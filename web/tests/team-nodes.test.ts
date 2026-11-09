// OFFLINE tests: Week 4 Team roster + any-week planning (n8n/week3/*.js, n8n/team/*.js) with mocked $ / $input.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(fileURLToPath(new URL(`../../n8n/${p}`, import.meta.url)), "utf8");
type J = Record<string, unknown>;
function run(file: string, nodes: Record<string, J[]>, input: J[] = [{}]): J[] {
  const $input = { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) };
  const $ = (n: string) => {
    if (!(n in nodes)) throw new Error("node not executed: " + n);
    return { first: () => ({ json: nodes[n]![0] }), all: () => nodes[n]!.map((json) => ({ json })) };
  };
  return (new Function("$", "$input", src(file)) as (d: unknown, i: unknown) => { json: J }[])($, $input).map((x) => x.json);
}

// The real Week 3 Configuration node output (its code is run, not copied).
const settings = { enable_gmail: false };
const w3 = run("week3/week3-configuration.js", {}, [{ settings }])[0]!;
const ctx = (over: { notes?: string; period?: string | null; owners?: (string | null)[]; requested?: J | null; team?: J[] } = {}) => ({
  "Week 3 Configuration": [
    {
      ...w3,
      raw_notes: over.notes ?? "Project Atlas weekly planning.\nPlanning period: 2–6 November 2026.\nMaya will send the agenda.",
      candidate: { planning_period: over.period === undefined ? "2–6 November 2026" : over.period },
      validation: { actions: (over.owners ?? ["Maya"]).map((o, i) => ({ id: "A" + (i + 1), owner: o })) },
      requested_period: over.requested === undefined ? { start: "2026-11-02", end: "2026-11-06", timezone: "America/Phoenix" } : over.requested,
      version: 1,
    },
  ],
  "Read Team Roster": over.team ?? [{}],
});
const resolve = (over: Parameters<typeof ctx>[0] = {}) => run("week3/resolve-owners-and-period.js", ctx(over))[0]! as { week3: J & { owner_roster: J[]; limits: J; planning_period: J }; week3_scope: J & { period: J; owners: J[]; unresolved_owners: J[]; ambiguous_owners: J[] } };
const TEAM = (owner_id: string, display_name: string, match_names: string, extra: J = {}) => ({ owner_id, display_name, match_names, project_id: "DEMO_ATLAS", active: true, ...extra });

describe("Resolve Owners and Period — Team roster", () => {
  it("keeps the configured roster when the Team page is empty", () => {
    const r = resolve();
    expect(r.week3_scope.owners).toEqual([{ owner_id: "maya", display_name: "Maya", action_ids: ["A1"] }]);
    expect(r.week3_scope.period).toMatchObject({ status: "MATCHED", period_start: "2026-11-02", period_end: "2026-11-06" });
  });
  it("resolves people added on the Team page, and extra names for a configured owner", () => {
    const r = resolve({ owners: ["Priya", "Maya Chen", "dev patel"], team: [TEAM("priya_raman", "Priya Raman", "priya raman,priya"), TEAM("maya", "Maya", "maya chen"), TEAM("dev_patel", "Dev Patel", "dev patel,dev")] });
    expect(r.week3_scope.owners.map((o) => o.owner_id)).toEqual(["priya_raman", "maya", "dev_patel"]);
    expect(r.week3_scope.unresolved_owners).toEqual([]);
  });
  it("a shared first name is ambiguous, never guessed", () => {
    expect(resolve({ owners: ["Sam"] }).week3_scope.ambiguous_owners[0]).toMatchObject({ candidates: ["sam_okafor", "sam_kim"] });
  });
  it("inactive or other-project Team rows are ignored; an unreadable Team table is reported, not treated as empty", () => {
    expect(resolve({ owners: ["Priya"], team: [TEAM("priya_raman", "Priya", "priya", { active: false })] }).week3_scope.unresolved_owners[0]).toMatchObject({ reason: "NOT_IN_ROSTER" });
    expect(resolve({ owners: ["Priya"], team: [TEAM("priya_raman", "Priya", "priya", { project_id: "OTHER" })] }).week3_scope.unresolved_owners[0]).toMatchObject({ reason: "NOT_IN_ROSTER" });
    expect(resolve({ owners: ["Priya"], team: [{ error: "read failed" }] }).week3_scope.unresolved_owners[0]).toMatchObject({ reason: "ROSTER_UNAVAILABLE" });
  });
  it("scales the reviewer's business-tool budget with the number of owners (2 calls each), bounded", () => {
    const team = ["a", "b", "c", "d", "e", "f"].map((x) => TEAM("p_" + x, "P " + x, "person " + x));
    const r = resolve({ owners: ["Maya", ...team.map((t) => (t.match_names as string))], team });
    expect(r.week3_scope.owners).toHaveLength(7);
    expect(r.week3.limits.max_business_tool_calls).toBe(16);
    expect(resolve().week3.limits.max_business_tool_calls).toBe(8);
  });
});

describe("Resolve Owners and Period — any requested week", () => {
  const notes = (p: string) => `Project Atlas weekly planning.\nPlanning period: ${p}.\nMaya will send the agenda.`;
  it.each([
    ["2–6 November 2026", "2026-11-02", "2026-11-06"],
    ["9-13 November 2026", "2026-11-09", "2026-11-13"],
    ["November 9 to 13, 2026", "2026-11-09", "2026-11-13"],
    ["30 November – 4 December 2026", "2026-11-30", "2026-12-04"],
    ["Nov 30 - Dec 4, 2026", "2026-11-30", "2026-12-04"],
    ["2026-11-16 to 2026-11-20", "2026-11-16", "2026-11-20"],
    ["16th to 20th November 2026", "2026-11-16", "2026-11-20"],
  ])("'%s' matches the requested %s..%s", (wording, start, end) => {
    const r = resolve({ notes: notes(wording), period: wording, requested: { start, end, timezone: "UTC" } });
    expect(r.week3_scope.period).toMatchObject({ status: "MATCHED", period_start: start, period_end: end });
    expect(r.week3.planning_period).toMatchObject({ period_start: start, period_end: end });
  });
  it("wording for a different week than requested is NOT_MATCHED (never silently re-dated)", () => {
    expect(resolve({ notes: notes("9-13 November 2026"), period: "9-13 November 2026" }).week3_scope.period.status).toBe("NOT_MATCHED");
  });
  it("vague or missing wording is not matched, and wording absent from the notes is caught", () => {
    expect(resolve({ notes: notes("next week"), period: "next week" }).week3_scope.period.status).toBe("NOT_MATCHED");
    expect(resolve({ period: null }).week3_scope.period.status).toBe("MISSING");
    expect(resolve({ period: "9-13 November 2026" }).week3_scope.period.status).toBe("NOT_IN_NOTES");
  });
  it("the chat lane (no website request) still uses the configured week", () => {
    expect(resolve({ requested: null }).week3_scope.period).toMatchObject({ status: "MATCHED", period_start: "2026-11-02" });
  });
  it("project check tolerates dashes and punctuation ('Project Atlas — weekly …')", () => {
    expect(resolve({ notes: "Project Atlas — weekly planning meeting\nPlanning period: 2–6 November 2026." }).week3_scope.project_confirmed_in_notes).toBe(true);
    expect(resolve({ notes: "Project Orion planning\nPlanning period: 2–6 November 2026." }).week3_scope.project_confirmed_in_notes).toBe(false);
  });
});

describe("Validate Website Request — any week", () => {
  const req = (period_start: string, period_end: string, notes = "Project Atlas weekly planning. Maya will send the agenda by Tuesday, estimated 1 hour.") => [
    { headers: { "content-type": "application/json" }, body: { request_id: "req-12345678", notes, period_start, period_end, timezone: "America/Phoenix" } },
  ];
  const v = (input: J[]) => run("week3/validate-website-request.js", {}, input)[0]!;
  it("accepts a week other than 2–6 November", () => expect(v(req("2026-11-16", "2026-11-20"))).toMatchObject({ valid: true, period_start: "2026-11-16" }));
  it("rejects periods over 31 days", () => expect((v(req("2026-11-01", "2026-12-15")).response_body as { error: { code: string } }).error.code).toBe("PERIOD_TOO_LONG"));
  it("still rejects notes that state a different period than requested", () =>
    expect((v(req("2026-11-16", "2026-11-20", "Planning period: 2-6 November 2026. Maya will send the agenda.")).response_body as { error: { code: string } }).error.code).toBe("PERIOD_CONFLICT"));
});

describe("Team page nodes", () => {
  it("the configured roster mirrored in the Team nodes equals Week 3 Configuration", () => {
    const mirror = new Function(src("team/shared.js") + "; return CONFIGURED_ROSTER;")();
    expect(mirror).toEqual((w3.week3 as { owner_roster: unknown }).owner_roster);
  });
  const change = (body: J, team: J[] = [{}]) => run("team/validate-change.js", { "Website Team Change": [{ body }], "Read Team For Change": team })[0]!;
  const code = (r: J) => (r.response_body as { error?: { code: string } } | undefined)?.error?.code;
  it("adds a new person with weekly hours; the first name is added as an alias", () => {
    const r = change({ display_name: "Priya Raman", aliases: [], period_start: "2026-11-16", period_end: "2026-11-20", available_hours: 30 });
    expect(r).toMatchObject({ valid: true, member: { owner_id: "priya_raman", display_name: "Priya Raman", match_names: "priya raman,priya", created: true }, capacity: { capacity_id: "CAP-priya_raman-2026-11-16-2026-11-20", available_hours: 30 } });
  });
  it("never auto-adds a first name someone else uses ('Sam')", () => {
    expect((change({ display_name: "Sam Lee" }).member as J).match_names).toBe("sam lee");
  });
  it("refuses an explicit name already used by another person", () => expect(code(change({ display_name: "Ana Diaz", aliases: ["Li"] }))).toBe("NAME_TAKEN"));
  it("refuses creating a duplicate person, and editing someone who does not exist", () => {
    expect(code(change({ display_name: "Priya Raman" }, [TEAM("priya_raman", "Priya Raman", "priya raman,priya")]))).toBe("OWNER_EXISTS");
    expect(code(change({ owner_id: "ghost", display_name: "Ghost" }))).toBe("OWNER_NOT_FOUND");
  });
  it("can add a full-name alias and a new week for a configured owner (Maya)", () => {
    const r = change({ owner_id: "maya", display_name: "Maya Chen", aliases: ["Maya Chen"], period_start: "2026-11-16", period_end: "2026-11-20", available_hours: 8 });
    expect(r).toMatchObject({ valid: true, member: { owner_id: "maya", display_name: "Maya", configured: true } });
    expect(String((r.member as J).match_names).split(",")).toEqual(expect.arrayContaining(["maya chen", "maya"]));
  });
  it.each([
    [{ display_name: "X" }, "INVALID_NAME"],
    [{ display_name: "Robert'); DROP TABLE" }, "INVALID_NAME"],
    [{ display_name: "Ana Diaz", period_start: "2026-11-20", period_end: "2026-11-16", available_hours: 5 }, "INVALID_PERIOD"],
    [{ display_name: "Ana Diaz", period_start: "2026-11-16", period_end: "2026-11-20", available_hours: 500 }, "INVALID_HOURS"],
    [{ display_name: "Ana Diaz", period_start: "2026-11-16", period_end: "2026-11-20", available_hours: -1 }, "INVALID_HOURS"],
    [{ display_name: "Ana Diaz", project_id: "OTHER" }, "UNKNOWN_FIELDS"],
  ])("refuses %#", (body, expected) => expect(code(change(body as J))).toBe(expected));
  it("an unreadable team table refuses the change", () => expect(code(change({ display_name: "Ana Diaz" }, [{ error: "x" }]))).toBe("STORAGE_UNAVAILABLE"));

  it("the Team view lists configured + Team-page people with their capacity periods", () => {
    const r = run("team/build-view.js", {
      "Read Team Members": [TEAM("priya_raman", "Priya Raman", "priya raman,priya"), TEAM("maya", "Maya", "maya chen")],
      "Read Team Capacity": [{ project_id: "DEMO_ATLAS", owner_id: "maya", capacity_id: "C1", period_start: "2026-11-02", period_end: "2026-11-06", available_hours: 8, updated_at: "2026-11-03T00:40:47Z", data_provenance: "SYNTHETIC_DEMO" }],
    })[0]!;
    const people = (r.response_body as { people: J[] }).people;
    expect(people.map((p) => p.owner_id)).toEqual(["maya", "li_chen", "sam_okafor", "sam_kim", "priya_raman"]);
    expect(people[0]).toMatchObject({ source: "CONFIGURED", names: ["maya", "maya chen"], capacity: [{ available_hours: 8, period_start: "2026-11-02" }] });
    expect(people[4]).toMatchObject({ source: "TEAM_PAGE", names: ["priya raman", "priya"] });
  });
  it("the change response never reports an unsaved write as saved", () => {
    const v = change({ display_name: "Ana Diaz", period_start: "2026-11-16", period_end: "2026-11-20", available_hours: 20 });
    const resp = (m: J[], c: J[]) => run("team/change-response.js", { "Validate Team Change": [v], "Upsert Team Member": m, "Upsert Team Capacity": c })[0]!;
    expect(resp([{ id: 1 }], [{ id: 2 }])).toMatchObject({ http_status: 200, response_body: { team_status: "SAVED", member_saved: true, capacity_saved: true } });
    expect(resp([{ id: 1 }], [{ error: "x" }])).toMatchObject({ http_status: 502, response_body: { team_status: "FAILED", capacity_saved: false } });
  });
});
