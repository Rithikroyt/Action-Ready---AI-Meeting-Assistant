import { z } from "zod";
import { JOB_ID_RE } from "@/lib/contract";
import { guardApi, json } from "@/lib/guard";
import { OWNER } from "@/lib/session";
import { requestDispatch } from "@/lib/service";

export const dynamic = "force-dynamic";

// Review & Send: the browser supplies only recipients, the version it reviewed, which draft (team summary or one
// employee), and explicit confirmation.
// The message text comes from the stored reviewed draft; n8n re-checks every rule before anything is sent.
const bodySchema = z
  .object({
    recipients: z.array(z.string().max(254)).min(1).max(10),
    version: z.number().int().min(1).max(20),
    employee: z.string().trim().min(1).max(120).nullable().optional(),
    confirm: z.literal(true),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const { jobId } = await ctx.params;
  if (!JOB_ID_RE.test(jobId)) return json({ error: { code: "NOT_FOUND", message: "No such job." } }, 404);
  const raw = await req.text();
  if (raw.length > 8 * 1024) return json({ error: { code: "TOO_LARGE", message: "Request body is too large." } }, 413);
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Body must be JSON." } }, 400);
  }
  if (!parsed.success) return json({ error: { code: "VALIDATION", message: "Send needs recipients, the reviewed version and explicit confirmation." } }, 422);

  const res = await requestDispatch(OWNER, jobId, parsed.data);
  switch (res.kind) {
    case "outcome":
      return json({ dispatch: res.outcome });
    case "not_found":
      return json({ error: { code: "NOT_FOUND", message: res.message } }, 404);
    case "stale":
      return json({ error: { code: "STALE_VERSION", message: res.message } }, 409);
    case "invalid":
      return json({ error: { code: "INVALID", message: res.message } }, 422);
    case "unavailable":
      return json({ error: { code: "UNAVAILABLE", message: res.message } }, 503);
  }
}
