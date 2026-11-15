import { guardApi, json } from "@/lib/guard";
import { getExperiment } from "@/lib/visibility/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** One experiment with its runs; metrics are recomputed from the stored runs (read-only). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const r = await getExperiment(id);
  if (r.kind === "ok") return json(r.data);
  if (r.kind === "not_found") return json({ error: { code: "NOT_FOUND", message: "No such experiment." } }, 404);
  return json({ error: { code: "UNAVAILABLE", message: r.message } }, 503);
}
