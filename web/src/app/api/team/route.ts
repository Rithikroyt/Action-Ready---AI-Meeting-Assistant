import { apiSession, guardApi, json } from "@/lib/guard";
import { fetchTeam, saveTeamChange, teamChangeSchema } from "@/lib/team";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Team roster + capacity (read): any signed-in member. */
export async function GET(req: Request) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const r = await fetchTeam();
  return r.kind === "ok" ? json({ people: r.people, freshness_days: r.freshness_days }) : json({ error: { code: "UNAVAILABLE", message: r.message } }, 503);
}

/** Add/update one person and their hours for one period: approvers only. */
export async function POST(req: Request) {
  const denied = await guardApi(req);
  if (denied) return denied;
  const session = await apiSession();
  if (!session.canSend) return json({ error: { code: "NOT_AN_APPROVER", message: "Only approvers can change the team roster or capacity." } }, 403);
  const raw = await req.text();
  if (raw.length > 4096) return json({ error: { code: "TOO_LARGE", message: "Request body is too large." } }, 413);
  let parsed;
  try {
    parsed = teamChangeSchema.safeParse(JSON.parse(raw));
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "Body must be JSON." } }, 400);
  }
  if (!parsed.success) return json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Check the fields." } }, 422);
  const r = await saveTeamChange(parsed.data);
  return r.kind === "saved" ? json({ team: r.body }) : json({ error: { code: r.kind.toUpperCase(), message: r.message } }, r.http);
}
