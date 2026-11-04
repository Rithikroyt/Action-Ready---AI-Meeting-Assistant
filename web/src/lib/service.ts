import "server-only";
import { createHash } from "node:crypto";
import { isFinal, normalizeJob, type JobView, type Submission } from "./contract";
import { getConfig } from "./env";
import { fetchJobFromN8n, submitToN8n } from "./n8n";
import { buildDemoBody, demoScenarioFor, rebuildDemoBody } from "./demo";
import { addJob, findByRequest, findJob, listJobs, registryWritable, updateSnapshot, type RegistryEntry } from "./registry";

const NOT_RECORDABLE =
  "This server cannot record cases (its job storage is not writable), so the meeting was not sent. Set ACTIONREADY_DATA_DIR to a writable folder.";

export const fingerprint = (s: Submission) =>
  createHash("sha256").update(JSON.stringify([s.notes, s.period_start, s.period_end, s.timezone])).digest("hex");

export type SubmitResult =
  | { kind: "accepted"; job_id: string; reused: boolean }
  | { kind: "conflict" | "invalid" | "ambiguous" | "unavailable" | "demo_unsupported"; message: string };

export async function submitMeeting(owner: string, sub: Submission): Promise<SubmitResult> {
  const cfg = getConfig();
  const fp = fingerprint(sub);

  // Repeated request: same request_id + same input returns the existing job; different input conflicts.
  const prior = await findByRequest(owner, sub.request_id);
  if (prior) {
    if (prior.fingerprint !== fp)
      return { kind: "conflict", message: "This request ID was already used with different notes or period. Start a new meeting instead." };
    return { kind: "accepted", job_id: prior.job_id, reused: true };
  }

  const entry = (job_id: string, mode: RegistryEntry["mode"], demo_body?: unknown): RegistryEntry => ({
    job_id,
    request_id: sub.request_id,
    fingerprint: fp,
    mode,
    owner,
    submitted_at: new Date().toISOString(),
    period: { start: sub.period_start, end: sub.period_end, timezone: sub.timezone },
    snapshot: null,
    demo_body,
  });

  if (cfg.mode === "demo") {
    const scenario = demoScenarioFor(sub);
    if (!scenario)
      return {
        kind: "demo_unsupported",
        message: "Demo mode only evaluates the labeled synthetic examples, with their notes and period unchanged. Switch to live mode to analyze your own notes.",
      };
    const body = buildDemoBody(scenario, sub);
    // Demo cases are rebuilt from their self-describing ID, so recording is only for the Overview list:
    // best-effort, never a reason to fail (serverless storage may be read-only or per-instance).
    if (await registryWritable()) await addJob(entry(body.job_id, "DEMO", body)).catch(() => undefined);
    return { kind: "accepted", job_id: body.job_id, reused: false };
  }

  if (!cfg.n8n) return { kind: "unavailable", message: "Live mode is not configured on the server: " + cfg.problems.join(", ") };
  // Check first: an accepted run that cannot be recorded would be invisible here (and is a paid model run).
  if (!(await registryWritable())) return { kind: "unavailable", message: NOT_RECORDABLE };
  const out = await submitToN8n(cfg.n8n, sub);
  if (out.kind !== "accepted") return out;
  await addJob(entry(out.job_id, "LIVE"));
  return { kind: "accepted", job_id: out.job_id, reused: false };
}

export type JobLookup =
  | { kind: "ok"; view: JobView }
  | { kind: "not_found" }
  | { kind: "unavailable"; message: string; last_known: JobView | null };

export async function getJobView(owner: string, job_id: string): Promise<JobLookup> {
  const entry = await findJob(owner, job_id).catch(() => null);
  if (!entry) {
    // DEMO only: a synthetic case can be rebuilt from its ID on any server instance. Live jobs still require
    // a registry entry owned by this account, and demo IDs never resolve in live mode.
    if (getConfig().mode === "demo") {
      const body = rebuildDemoBody(job_id);
      if (body) return { kind: "ok", view: normalizeJob(body, "DEMO") };
    }
    return { kind: "not_found" }; // ownership: only jobs this owner submitted through this app
  }

  if (entry.mode === "DEMO") return { kind: "ok", view: normalizeJob(entry.demo_body, "DEMO") };

  // A final result does not change; skip the network round-trip.
  if (entry.snapshot && isFinal(entry.snapshot.execution_status)) return { kind: "ok", view: entry.snapshot };

  const cfg = getConfig();
  if (!cfg.n8n) return { kind: "unavailable", message: "Live mode is not configured on the server.", last_known: entry.snapshot };
  const out = await fetchJobFromN8n(cfg.n8n, job_id);
  if (out.kind === "not_found") return { kind: "not_found" };
  if (out.kind === "unavailable") return { kind: "unavailable", message: out.message, last_known: entry.snapshot };
  const view = normalizeJob(out.body, "LIVE");
  if (view.job_id && view.job_id !== job_id)
    return { kind: "unavailable", message: "The workflow returned a different job than requested.", last_known: entry.snapshot };
  view.job_id = job_id;
  await updateSnapshot(job_id, view);
  return { kind: "ok", view };
}

export interface OverviewRow {
  job_id: string;
  mode: RegistryEntry["mode"];
  submitted_at: string;
  period: RegistryEntry["period"];
  view: JobView | null;
  refresh_error: string | null;
}

export async function overview(owner: string, limit = 15): Promise<OverviewRow[]> {
  const rows = (await listJobs(owner)).slice(0, limit);
  return Promise.all(
    rows.map(async (r): Promise<OverviewRow> => {
      const base = { job_id: r.job_id, mode: r.mode, submitted_at: r.submitted_at, period: r.period };
      const res = await getJobView(owner, r.job_id).catch(() => null);
      if (res?.kind === "ok") return { ...base, view: res.view, refresh_error: null };
      if (res?.kind === "unavailable") return { ...base, view: res.last_known, refresh_error: res.message };
      return { ...base, view: r.snapshot, refresh_error: res ? "Job not found on the workflow." : "Could not refresh." };
    }),
  );
}
