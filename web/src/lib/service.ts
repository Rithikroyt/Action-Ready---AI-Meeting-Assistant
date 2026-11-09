import "server-only";
import { createHash } from "node:crypto";
import { isFinal, normalizeJob, type JobView, type Submission } from "./contract";
import { getConfig } from "./env";
import { dispatchToN8n, fetchCaseListFromN8n, fetchJobFromN8n, publishTrackerToN8n, submitToN8n, type DispatchOutcome, type TrackerOutcome } from "./n8n";
import { buildDemoBody, demoScenarioFor, isDemoJobId, rebuildDemoBody } from "./demo";
import { addJob, findByRequest, findJob, listJobs, registryWritable, updateSnapshot, type RegistryEntry } from "./registry";

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
  // Live cases are durable in n8n (the Overview reads the n8n case list), so a read-only or temporary disk no
  // longer hides a run. The local registry is only a cache plus same-instance double-submit protection.
  const out = await submitToN8n(cfg.n8n, sub);
  if (out.kind !== "accepted") return out;
  if (await registryWritable()) await addJob(entry(out.job_id, "LIVE")).catch(() => undefined);
  return { kind: "accepted", job_id: out.job_id, reused: false };
}

export type JobLookup =
  | { kind: "ok"; view: JobView }
  | { kind: "not_found" }
  | { kind: "unavailable"; message: string; last_known: JobView | null };

export async function getJobView(owner: string, job_id: string): Promise<JobLookup> {
  const entry = await findJob(owner, job_id).catch(() => null);
  // LIVE: one shared project workspace. Any signed-in member may open any case of this project; n8n scopes the
  // status endpoint to the project, so a job from elsewhere is simply not found.
  if (!entry && getConfig().mode === "live") return isDemoJobId(job_id) ? { kind: "not_found" } : liveView(job_id, null);
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
  return liveView(job_id, entry);
}

async function liveView(job_id: string, entry: RegistryEntry | null): Promise<JobLookup> {
  const cfg = getConfig();
  const last = entry?.snapshot ?? null;
  if (!cfg.n8n) return { kind: "unavailable", message: "Live mode is not configured on the server.", last_known: last };
  const out = await fetchJobFromN8n(cfg.n8n, job_id);
  if (out.kind === "not_found") return { kind: "not_found" };
  if (out.kind === "unavailable") return { kind: "unavailable", message: out.message, last_known: last };
  const view = normalizeJob(out.body, "LIVE");
  if (view.job_id && view.job_id !== job_id) return { kind: "unavailable", message: "The workflow returned a different job than requested.", last_known: last };
  view.job_id = job_id;
  if (entry) await updateSnapshot(job_id, view).catch(() => undefined);
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

export async function overview(owner: string, limit = 15, browserDemoIds: string[] = []): Promise<OverviewRow[]> {
  const cfg = getConfig();
  // LIVE: the durable case list comes from n8n in one request (shared project workspace).
  if (cfg.mode === "live" && cfg.n8n) {
    const list = await fetchCaseListFromN8n(cfg.n8n);
    if (list.kind === "ok")
      return list.jobs.slice(0, limit).map((j) => {
        const view = normalizeJob(j, "LIVE");
        const p = view.period;
        return {
          job_id: view.job_id,
          mode: "LIVE" as const,
          submitted_at: view.timestamps.accepted_at ?? "",
          period: p ? { start: p.start, end: p.end, timezone: p.timezone ?? "" } : { start: "", end: "", timezone: "" },
          view,
          refresh_error: null,
        };
      });
  }
  const listed = await listJobs(owner).catch(() => [] as RegistryEntry[]);
  // DEMO only: also list this browser's demo cases, rebuilt from their self-describing IDs, because serverless
  // instances do not share the registry. Never used in live mode.
  const extra: OverviewRow[] = [];
  if (getConfig().mode === "demo")
    for (const id of browserDemoIds) {
      if (listed.some((r) => r.job_id === id)) continue;
      const body = rebuildDemoBody(id);
      if (body)
        extra.push({
          job_id: id,
          mode: "DEMO",
          submitted_at: body.timestamps.accepted_at,
          period: body.period,
          view: normalizeJob(body, "DEMO"),
          refresh_error: null,
        });
    }
  const rows = listed.slice(0, limit);
  const fromRegistry = await Promise.all(
    rows.map(async (r): Promise<OverviewRow> => {
      const base = { job_id: r.job_id, mode: r.mode, submitted_at: r.submitted_at, period: r.period };
      const res = await getJobView(owner, r.job_id).catch(() => null);
      if (res?.kind === "ok") return { ...base, view: res.view, refresh_error: null };
      if (res?.kind === "unavailable") return { ...base, view: res.last_known, refresh_error: res.message };
      return { ...base, view: r.snapshot, refresh_error: res ? "Job not found on the workflow." : "Could not refresh." };
    }),
  );
  return [...fromRegistry, ...extra].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, limit);
}

// ---------- Week 4: Review & Send ----------
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export const normalizeRecipients = (list: string[]) => [...new Set(list.map((r) => String(r).trim().toLowerCase()).filter(Boolean))].sort();
export const validRecipient = (r: string) => EMAIL_RE.test(r) && r.length <= 254;

/** One key per (job, version, recipients, exact message): approving the same thing twice can never send twice. */
export const dispatchKey = (job_id: string, version: number, recipients: string[], subject: string, body: string) =>
  createHash("sha256").update(JSON.stringify([job_id, version, normalizeRecipients(recipients), subject, body])).digest("hex");

export type DispatchRequestResult =
  | { kind: "outcome"; outcome: DispatchOutcome; tracker: TrackerOutcome | null }
  | { kind: "invalid" | "not_found" | "unavailable" | "stale"; message: string };

/**
 * Prepare and send a reviewed message. The draft is re-read FRESH from n8n (never from a cache) so approval always
 * applies to the current version, and the exact stored subject/body are used — the browser never supplies the text.
 */
export async function requestDispatch(owner: string, job_id: string, input: { recipients: string[]; version: number; confirm: boolean; employee?: string | null }, fetchImpl: typeof fetch = fetch): Promise<DispatchRequestResult> {
  const cfg = getConfig();
  if (cfg.mode !== "live") return { kind: "unavailable", message: "Sending is only available for live workflow cases, never for synthetic demo cases." };
  if (!cfg.n8n) return { kind: "unavailable", message: "Live mode is not configured on the server." };
  if (input.confirm !== true) return { kind: "invalid", message: "Confirm the exact message and recipients before sending." };
  const recipients = normalizeRecipients(input.recipients);
  if (!recipients.length) return { kind: "invalid", message: "Add at least one recipient." };
  if (recipients.length > 10) return { kind: "invalid", message: "At most 10 recipients per message." };
  if (!recipients.every(validRecipient)) return { kind: "invalid", message: "Each recipient must be a single plain email address." };
  // Shared project workspace: the case only has to exist in n8n (project-scoped); the fresh read below is the check.
  const fresh = await fetchJobFromN8n(cfg.n8n, job_id, fetchImpl);
  if (fresh.kind === "not_found") return { kind: "not_found", message: "The workflow has no live case with this ID." };
  if (fresh.kind !== "ok") return { kind: "unavailable", message: fresh.message };
  const raw = fresh.body as { draft?: { subject?: unknown; body?: unknown }; employee_drafts?: unknown };
  const view = normalizeJob(fresh.body, "LIVE");
  if (view.version !== input.version) return { kind: "stale", message: `This case is now at version ${view.version ?? "unknown"}. Reload and review the current version.` };
  // Team summary (employee null) or one action owner's draft — always the workflow's stored text, byte-exact.
  const employee = input.employee?.trim() || null;
  let src: { subject?: unknown; body?: unknown } | undefined = raw.draft;
  if (employee) {
    const list = Array.isArray(raw.employee_drafts) ? (raw.employee_drafts as { employee?: unknown; subject?: unknown; body?: unknown }[]) : [];
    src = list.find((d) => typeof d?.employee === "string" && d.employee.toLowerCase() === employee.toLowerCase());
    if (!src) return { kind: "invalid", message: `The reviewed version has no action items for ${employee.slice(0, 60)}.` };
  }
  const subject = typeof src?.subject === "string" ? src.subject : null;
  const body = typeof src?.body === "string" ? src.body : null;
  if (!subject || !body) return { kind: "invalid", message: "This case has no reviewed draft to send." };
  const outcome = await dispatchToN8n(
    cfg.n8n,
    { job_id, version: input.version, employee, recipients, subject, body, dispatch_key: dispatchKey(job_id, input.version, recipients, subject, body), confirm: true },
    fetchImpl,
  );
  // An approved message that Gmail accepted is the approval evidence for the tracker: publish those tasks now.
  const tracker = outcome.state === "SENT" ? await publishTrackerToN8n(cfg.n8n, { job_id, version: input.version }, fetchImpl) : null;
  return { kind: "outcome", outcome, tracker };
}

/** Re-sync this version's approved tasks to the tracker (never re-runs the AI, never sends email). */
export async function syncTracker(owner: string, job_id: string, version: number, fetchImpl: typeof fetch = fetch): Promise<{ kind: "ok"; tracker: TrackerOutcome } | { kind: "not_found" | "unavailable"; message: string }> {
  const cfg = getConfig();
  if (cfg.mode !== "live" || !cfg.n8n) return { kind: "unavailable", message: "The task tracker is only available for live workflow cases." };
  // n8n re-checks the case, version, review, readiness and the sent approval before writing anything.
  return { kind: "ok", tracker: await publishTrackerToN8n(cfg.n8n, { job_id, version }, fetchImpl) };
}
