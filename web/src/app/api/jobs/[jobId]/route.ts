import { JOB_ID_RE } from "@/lib/contract";
import { apiSession, guardApi, json } from "@/lib/guard";
import { getJobView } from "@/lib/service";

export const dynamic = "force-dynamic";

// Read-only: reads stored job state. Never triggers analysis, writes, or messages.
export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return json({ error: { code: "NOT_FOUND", message: "No such job." } }, 404);

  const res = await getJobView((await apiSession()).sub, jobId);
  if (res.kind === "not_found") return json({ error: { code: "NOT_FOUND", message: "No such job for this account." } }, 404);
  if (res.kind === "unavailable") return json({ error: { code: "UNAVAILABLE", message: res.message }, last_known: res.last_known }, 503);
  return json({ job: res.view });
}
