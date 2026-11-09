// OFFLINE: the website side of the Team page (lib/team). n8n is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["ACTIONREADY_MODE", "N8N_WEBHOOK_BASE", "N8N_WEBHOOK_HEADER_NAME", "N8N_WEBHOOK_SECRET", "N8N_JOB_STATUS_PATH"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { ACTIONREADY_MODE: "live", N8N_WEBHOOK_BASE: "https://example.invalid/webhook", N8N_WEBHOOK_HEADER_NAME: "X-ActionReady-Key", N8N_WEBHOOK_SECRET: "x".repeat(24), N8N_JOB_STATUS_PATH: "abc/actionready/v1/jobs" });
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});
const load = async () => {
  vi.resetModules();
  return import("@/lib/team");
};

describe("team change schema", () => {
  it("accepts a person with hours for one period, and names-only updates", async () => {
    const { teamChangeSchema } = await load();
    expect(teamChangeSchema.safeParse({ display_name: "Priya Raman", aliases: ["Priya R"], period_start: "2026-11-16", period_end: "2026-11-20", available_hours: 30 }).success).toBe(true);
    expect(teamChangeSchema.safeParse({ owner_id: "maya", display_name: "Maya", aliases: ["Maya Chen"] }).success).toBe(true);
  });
  it.each([
    [{ display_name: "Priya", period_start: "2026-11-16", available_hours: 30 }],
    [{ display_name: "Priya", available_hours: 30 }],
    [{ display_name: "Priya", project_id: "OTHER" }],
    [{ display_name: "Priya", aliases: ["a", "b", "c", "d", "e", "f", "g"] }],
    [{ display_name: "P" }],
  ])("refuses %#", async (body) => {
    const { teamChangeSchema } = await load();
    expect(teamChangeSchema.safeParse(body).success).toBe(false);
  });
});

describe("talking to n8n", () => {
  it("reads the roster with the header secret and keeps only allowlisted fields", async () => {
    const { fetchTeam } = await load();
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ freshness_days: 14, people: [{ owner_id: "maya", display_name: "Maya", names: ["maya"], source: "CONFIGURED", active: true, email: "leak@example.org", capacity: [{ capacity_id: "C1", period_start: "2026-11-02", period_end: "2026-11-06", available_hours: 8, updated_at: "2026-11-03T00:00:00Z", provenance: "SYNTHETIC_DEMO" }] }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchTeam(f);
    expect(calls[0]!.url).toBe("https://example.invalid/webhook/actionready/v1/team");
    expect(calls[0]!.headers["X-ActionReady-Key"]).toBe("x".repeat(24));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.people[0]).toEqual({ owner_id: "maya", display_name: "Maya", names: ["maya"], source: "CONFIGURED", active: true, capacity: [{ capacity_id: "C1", period_start: "2026-11-02", period_end: "2026-11-06", available_hours: 8, updated_at: "2026-11-03T00:00:00Z", provenance: "SYNTHETIC_DEMO" }] });
      expect(JSON.stringify(r)).not.toContain("leak@");
    }
  });
  it("reports SAVED, REFUSED and no-answer honestly", async () => {
    const { saveTeamChange } = await load();
    const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect((await saveTeamChange({ display_name: "Ana", aliases: [] }, reply(200, { team_status: "SAVED", note: "Saved." }))).kind).toBe("saved");
    expect(await saveTeamChange({ display_name: "Ana", aliases: [] }, reply(409, { team_status: "REFUSED", error: { message: "taken" } }))).toMatchObject({ kind: "refused", http: 409, message: "taken" });
    const boom = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
    expect(await saveTeamChange({ display_name: "Ana", aliases: [] }, boom)).toMatchObject({ kind: "failed", message: expect.stringMatching(/may or may not be saved/) });
  });
  it("is unavailable in demo mode (never writes)", async () => {
    process.env.ACTIONREADY_MODE = "demo";
    const { fetchTeam, saveTeamChange } = await load();
    const f = vi.fn() as unknown as typeof fetch;
    expect((await fetchTeam(f)).kind).toBe("unavailable");
    expect((await saveTeamChange({ display_name: "Ana", aliases: [] }, f)).kind).toBe("unavailable");
    expect(f).not.toHaveBeenCalled();
  });
});
