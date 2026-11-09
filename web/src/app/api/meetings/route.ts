import type { NextRequest } from "next/server";
import { submissionSchema } from "@/lib/contract";
import { apiSession, guardApi, json } from "@/lib/guard";
import { submitMeeting } from "@/lib/service";
import { addToDemoCookie, DEMO_CASES_COOKIE, isDemoJobId } from "@/lib/demo";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const denied = await guardApi(req);
  if (denied) return denied;

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: { code: "TOO_LARGE", message: "Request body is too large." } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Body must be JSON." } }, 400);
  }

  // Only these five fields are accepted; project scope, owner, recipients and approval flags
  // come from trusted server/workflow configuration, never from the browser.
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? "body")] ??= i.message;
    return json({ error: { code: "VALIDATION", message: "Please fix the highlighted fields.", fields } }, 422);
  }

  const out = await submitMeeting((await apiSession()).sub, parsed.data);
  switch (out.kind) {
    case "accepted": {
      const res = json({ job_id: out.job_id, execution_status: "ACCEPTED", reused: out.reused, schema_version: "1" }, out.reused ? 200 : 202);
      // Demo cases are listed from this browser's cookie, so the Overview works on any serverless instance.
      if (isDemoJobId(out.job_id))
        res.cookies.set(DEMO_CASES_COOKIE, addToDemoCookie(req.cookies.get(DEMO_CASES_COOKIE)?.value, out.job_id), {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 30 * 24 * 3600,
        });
      return res;
    }
    case "conflict":
      return json({ error: { code: "CONFLICT", message: out.message } }, 409);
    case "invalid":
      return json({ error: { code: "REJECTED", message: out.message } }, 422);
    case "demo_unsupported":
      return json({ error: { code: "DEMO_ONLY", message: out.message } }, 422);
    case "ambiguous":
      return json({ error: { code: "AMBIGUOUS", message: out.message, request_id: parsed.data.request_id } }, 504);
    case "unavailable":
      return json({ error: { code: "UNAVAILABLE", message: out.message } }, 503);
  }
}
