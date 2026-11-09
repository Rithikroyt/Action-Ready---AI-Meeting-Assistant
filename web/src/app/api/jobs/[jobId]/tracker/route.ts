import { z } from "zod";
import { JOB_ID_RE } from "@/lib/contract";
import { apiSession, guardApi, json } from "@/lib/guard";
import { syncTracker } from "@/lib/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ version: z.number().int().min(1).max(20) }).strict();

/** Sync tracker: re-publish this version's approved tasks to the Google Sheet. Approvers only. */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return json({ error: { code: "NOT_FOUND", message: "No such job." } }, 404);
  const session = await apiSession();
  if (!session.canSend) return json({ error: { code: "NOT_AN_APPROVER", message: "Only approvers can publish to the tracker." } }, 403);
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse((await req.text()).slice(0, 1024)));
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Body must be JSON." } }, 400);
  }
  if (!parsed.success) return json({ error: { code: "VALIDATION", message: "Sync needs the approved version." } }, 422);
  const res = await syncTracker(session.sub, jobId, parsed.data.version);
  if (res.kind === "ok") return json({ tracker: res.tracker });
  return json({ error: { code: res.kind === "not_found" ? "NOT_FOUND" : "UNAVAILABLE", message: res.message } }, res.kind === "not_found" ? 404 : 503);
}
