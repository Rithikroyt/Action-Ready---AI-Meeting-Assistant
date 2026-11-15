import "server-only";
import { getConfig } from "../env";
import { aggregate, agentProfile, readability, recommendations, validateExperiment, type Metrics, type RunRow } from "./core";

// Server-only adapter for the Week 5 webhooks on the SAME ActionReady canvas. The header secret never reaches the browser.
// Live failures are reported as unavailable — they are NEVER replaced with the synthetic sample.

export interface ExperimentSummary {
  experiment_id: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  kind: string;
  prompt_ids: string;
  contexts: string;
  models: string;
  reps_per_cell: number;
  requested_runs: number;
  valid_runs: number;
  failed_runs: number;
  readability_score: number | null;
}
export interface ExperimentDetail {
  synthetic: boolean;
  experiment: ExperimentSummary & Record<string, unknown>;
  runs: RunRow[];
  metrics: Metrics;
  readability: ReturnType<typeof readability>;
  recommendations: ReturnType<typeof recommendations>;
}
export type Live<T> = { kind: "ok"; data: T } | { kind: "unavailable"; message: string } | { kind: "not_found" };

const ID_RE = /^w5x_[a-z0-9]{4,14}_[a-z0-9]{6}$/;

function target() {
  const cfg = getConfig();
  return cfg.mode === "live" ? cfg.n8n : null;
}

async function call(path: string, init: RequestInit & { timeoutMs?: number } = {}, fetchImpl: typeof fetch = fetch): Promise<{ status: number; body: unknown } | { error: string }> {
  const t = target();
  if (!t) return { error: "The Visibility Lab needs the live workflow connection." };
  try {
    const res = await fetchImpl(`${t.base}/${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), [t.headerName]: t.secret },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { error: "The workflow did not answer." };
  }
}

const errMsg = (b: unknown, status: number) => {
  const m = (b as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof m === "string" ? m.slice(0, 300) : `The workflow returned HTTP ${status}.`;
};

export async function listExperiments(fetchImpl?: typeof fetch): Promise<Live<ExperimentSummary[]>> {
  const r = await call("actionready/v1/visibility/experiments", { method: "GET" }, fetchImpl);
  if ("error" in r) return { kind: "unavailable", message: r.error };
  const list = (r.body as { experiments?: unknown } | null)?.experiments;
  if (r.status !== 200 || !Array.isArray(list)) return { kind: "unavailable", message: errMsg(r.body, r.status) };
  return { kind: "ok", data: list.filter((x): x is ExperimentSummary => !!x && typeof (x as ExperimentSummary).experiment_id === "string") };
}

export async function getExperiment(id: string, fetchImpl?: typeof fetch): Promise<Live<ExperimentDetail>> {
  if (!ID_RE.test(id)) return { kind: "not_found" };
  const r = await call(`actionready/v1/visibility/experiment?id=${encodeURIComponent(id)}`, { method: "GET", timeoutMs: 20_000 }, fetchImpl);
  if ("error" in r) return { kind: "unavailable", message: r.error };
  if (r.status === 404) return { kind: "not_found" };
  const b = r.body as Partial<ExperimentDetail> | null;
  if (r.status !== 200 || !b || !b.experiment || !Array.isArray(b.runs)) return { kind: "unavailable", message: errMsg(r.body, r.status) };
  return { kind: "ok", data: detailFromStored(b.experiment as ExperimentDetail["experiment"], b.runs) };
}

/** Builds the page model from stored rows: metrics, status and recommendations are always recomputed from the runs. */
export function detailFromStored(stored: ExperimentDetail["experiment"], runs: RunRow[]): ExperimentDetail {
  const b = { runs };
  // Recompute on this side too: the page shows numbers derived from the stored runs, never trusted blindly.
  const metrics = aggregate(b.runs);
  const rubric = readability(agentProfile());
  const experiment = { ...stored };
  // The status shown is recomputed from the stored runs too. If the stored summary disagrees (e.g. an experiment finalized
  // by an earlier, buggy aggregator), the stored value is kept visibly as stored_status — never silently overwritten.
  if (experiment.status !== "RUNNING") {
    const requested = Number(experiment.requested_runs) || 0;
    const keys = new Set(b.runs.map((r) => r.run_key)).size;
    const computed = requested > 0 && metrics.totals.valid === requested && keys === requested ? "COMPLETE" : metrics.totals.valid > 0 ? "PARTIAL" : "FAILED";
    if (computed !== experiment.status || Number(experiment.valid_runs) !== metrics.totals.valid) {
      Object.assign(experiment, { stored_status: experiment.status, stored_valid_runs: experiment.valid_runs, status: computed, valid_runs: metrics.totals.valid, failed_runs: requested - metrics.totals.valid });
    }
  }
  return { synthetic: false, experiment, runs: b.runs, metrics, readability: rubric, recommendations: recommendations(metrics, rubric) };
}

export type StartOutcome = { kind: "accepted"; experiment_id: string; requested_runs: number } | { kind: "refused"; http: number; message: string } | { kind: "unavailable"; message: string } | { kind: "ambiguous"; message: string };

export async function startExperiment(body: unknown, requestedBy: string, fetchImpl?: typeof fetch): Promise<StartOutcome> {
  if (!target()) return { kind: "unavailable", message: "Live experiments need the n8n connection; this site is showing the synthetic sample." };
  // Same rules as n8n, checked here first so an invalid request never reaches the workflow.
  const withOwner = { ...(body as object), requested_by_hash: requestedBy.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64) || null };
  const v = validateExperiment(withOwner);
  if (!v.ok) return { kind: "refused", http: v.http, message: v.message };
  const r = await call("actionready/v1/visibility/experiments", { method: "POST", body: JSON.stringify(withOwner), timeoutMs: 25_000 }, fetchImpl);
  if ("error" in r) return { kind: "ambiguous", message: "No answer from the workflow — the experiment may or may not have started. Check the list before trying again." };
  const b = r.body as { experiment_id?: unknown; requested_runs?: unknown } | null;
  if (r.status === 202 && b && typeof b.experiment_id === "string" && ID_RE.test(b.experiment_id)) return { kind: "accepted", experiment_id: b.experiment_id, requested_runs: Number(b.requested_runs) || v.total_runs };
  if (r.status === 400 || r.status === 409) return { kind: "refused", http: r.status, message: errMsg(r.body, r.status) };
  return { kind: "unavailable", message: errMsg(r.body, r.status) };
}
