import "server-only";
import { z } from "zod";
import { getConfig } from "./env";

// Week 4 Team page: the roster + weekly capacity used by the readiness check. Stored in n8n (AR_Team, AR_Capacity).
// Signed-in members may read it; only approvers may change it. The notes never add people or capacity.

export interface TeamCapacity {
  capacity_id: string;
  period_start: string;
  period_end: string;
  available_hours: number | null;
  updated_at: string | null;
  provenance: string;
}
export interface TeamPerson {
  owner_id: string;
  display_name: string;
  names: string[];
  source: "CONFIGURED" | "TEAM_PAGE";
  active: boolean;
  capacity: TeamCapacity[];
}
export type TeamResult = { kind: "ok"; people: TeamPerson[]; freshness_days: number } | { kind: "unavailable"; message: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const teamChangeSchema = z
  .object({
    owner_id: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
    display_name: z.string().trim().min(2).max(60),
    aliases: z.array(z.string().trim().min(2).max(60)).max(6).default([]),
    period_start: day.optional(),
    period_end: day.optional(),
    available_hours: z.number().min(0).max(80).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => (v.period_start === undefined) === (v.period_end === undefined) && (v.period_start === undefined) === (v.available_hours === undefined), {
    message: "Period start, period end and available hours go together.",
  });
export type TeamChange = z.infer<typeof teamChangeSchema>;

const str = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");

function target() {
  const cfg = getConfig();
  return cfg.mode === "live" ? cfg.n8n : null;
}

export async function fetchTeam(fetchImpl: typeof fetch = fetch): Promise<TeamResult> {
  const t = target();
  if (!t) return { kind: "unavailable", message: "The Team roster is only available when the site is connected to the live workflow." };
  let res: Response;
  try {
    res = await fetchImpl(`${t.base}/actionready/v1/team`, { headers: { Accept: "application/json", [t.headerName]: t.secret }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { kind: "unavailable", message: "The workflow did not answer." };
  }
  if (!res.ok) return { kind: "unavailable", message: `The workflow returned HTTP ${res.status}.` };
  const b = (await res.json().catch(() => null)) as { people?: unknown; freshness_days?: unknown } | null;
  if (!b || !Array.isArray(b.people)) return { kind: "unavailable", message: "Unexpected response from the workflow." };
  const people = b.people.slice(0, 80).flatMap((p): TeamPerson[] => {
    const o = p as Record<string, unknown>;
    if (!o || typeof o.owner_id !== "string") return [];
    return [
      {
        owner_id: str(o.owner_id, 40),
        display_name: str(o.display_name, 60) || str(o.owner_id, 40),
        names: Array.isArray(o.names) ? o.names.filter((n): n is string => typeof n === "string").slice(0, 10).map((n) => n.slice(0, 60)) : [],
        source: o.source === "CONFIGURED" ? "CONFIGURED" : "TEAM_PAGE",
        active: o.active !== false,
        capacity: Array.isArray(o.capacity)
          ? o.capacity.slice(0, 12).map((c) => {
              const r = c as Record<string, unknown>;
              return { capacity_id: str(r.capacity_id, 80), period_start: str(r.period_start, 10), period_end: str(r.period_end, 10), available_hours: typeof r.available_hours === "number" ? r.available_hours : null, updated_at: typeof r.updated_at === "string" ? r.updated_at : null, provenance: str(r.provenance, 40) };
            })
          : [],
      },
    ];
  });
  return { kind: "ok", people, freshness_days: typeof b.freshness_days === "number" ? b.freshness_days : 14 };
}

export type TeamChangeResult = { kind: "saved" | "refused" | "failed" | "unavailable"; http: number; message: string; body?: unknown };

export async function saveTeamChange(change: TeamChange, fetchImpl: typeof fetch = fetch): Promise<TeamChangeResult> {
  const t = target();
  if (!t) return { kind: "unavailable", http: 503, message: "Team changes need the live workflow." };
  let res: Response;
  try {
    res = await fetchImpl(`${t.base}/actionready/v1/team/change`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", [t.headerName]: t.secret }, body: JSON.stringify(change), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    return { kind: "failed", http: 504, message: "The workflow did not answer, so the change may or may not be saved. Reload the Team page to check." };
  }
  const b = (await res.json().catch(() => null)) as { team_status?: unknown; error?: { message?: unknown }; note?: unknown } | null;
  const message = typeof b?.error?.message === "string" ? b.error.message : typeof b?.note === "string" ? b.note : `The workflow returned HTTP ${res.status}.`;
  if (b?.team_status === "SAVED") return { kind: "saved", http: 200, message, body: b };
  if (b?.team_status === "REFUSED") return { kind: "refused", http: res.status, message };
  return { kind: "failed", http: res.status >= 400 ? res.status : 502, message };
}
