import { apiSession, guardApi, json } from "@/lib/guard";
import { listExperiments, startExperiment } from "@/lib/visibility/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Recent visibility experiments (read-only): any signed-in member. */
export async function GET(req: Request) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const r = await listExperiments();
  return r.kind === "ok" ? json({ experiments: r.data }) : json({ error: { code: "UNAVAILABLE", message: r.kind === "unavailable" ? r.message : "Not found." } }, 503);
}

/** Start a live experiment (makes model calls): approvers only, corpus prompts only, ≤60 calls. */
export async function POST(req: Request) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const session = await apiSession();
  if (!session.canSend) return json({ error: { code: "NOT_AN_APPROVER", message: "Only approvers can start live experiments, because they make model calls." } }, 403);
  const raw = await req.text();
  if (raw.length > 2048) return json({ error: { code: "TOO_LARGE", message: "Request body is too large." } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Body must be JSON." } }, 400);
  }
  const r = await startExperiment(body, session.sub);
  if (r.kind === "accepted") return json({ experiment_id: r.experiment_id, requested_runs: r.requested_runs }, 202);
  if (r.kind === "refused") return json({ error: { code: "REFUSED", message: r.message } }, r.http);
  return json({ error: { code: r.kind.toUpperCase(), message: r.message } }, r.kind === "ambiguous" ? 504 : 503);
}
