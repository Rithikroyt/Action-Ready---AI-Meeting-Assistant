// OFFLINE tests of the n8n Week 4 task-tracker Code nodes (n8n/tracker/*.js) with mocked $input / $(). No Google.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const code = (f: string) => readFileSync(fileURLToPath(new URL(`../../n8n/tracker/${f}`, import.meta.url)), "utf8");
type J = Record<string, unknown>;
function run(file: string, input: J[], nodes: Record<string, J[]> = {}): J[] {
  const $input = { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) };
  const $ = (n: string) => ({ first: () => ({ json: (nodes[n] ?? [])[0] }), all: () => (nodes[n] ?? []).map((json) => ({ json })) });
  return (new Function("$input", "$", code(file)) as (i: unknown, d: unknown) => { json: J }[])($input, $).map((x) => x.json);
}

const JOB = "2f27dd6f-90c3-4b5e-bba3-06ca0f169cc9";
const validated = run("1-validate.js", [{ body: { job_id: JOB, version: 1 } }])[0]!;
const CAND = {
  meeting_title: "Project Atlas weekly planning",
  actions: [
    { id: "A1", task: "send the demo agenda", owner: "Maya", due_text: "by 3 November 2026", estimated_hours: 1 },
    { id: "A2", task: "fix the login bug", owner: "Dev", due_text: "Friday", estimated_hours: 3 },
    { id: "A3", task: "=HYPERLINK(\"http://x\")", owner: "Maya", due_text: "3 or 4 November 2026", estimated_hours: null },
  ],
};
const records = (over: { dispatches?: J[]; case?: J; versions?: J[] } = {}) => ({
  "Validate Tracker Request": [validated],
  "Read Tracker Job": [{ job_id: JOB, case_id: "AR2-1062", accepted_at: "2026-11-09T16:20:00Z" }],
  "Read Tracker Case": [over.case ?? { case_id: "AR2-1062", latest_version: 1, readiness_status: "READY", first_recorded_at: "2026-11-09T16:25:00Z", meeting_title: "x" }],
  "Read Tracker Versions": over.versions ?? [{ case_id: "AR2-1062", version: 1, gate: "PASS", evaluated_candidate_json: JSON.stringify(CAND) }],
  "Read Tracker Dispatches": over.dispatches ?? [{ job_id: JOB, version: 1, status: "SENT", employee: "Maya", recipients: "maya@example.org" }],
});
const plan = (over: Parameters<typeof records>[0] = {}) => run("2-plan.js", [{}], records(over))[0]!;

describe("Validate Tracker Request", () => {
  it("accepts {job_id, version} only", () => {
    expect(validated).toMatchObject({ valid: true, job_id: JOB, version: 1 });
    const bad = run("1-validate.js", [{ body: { job_id: JOB, version: 1, tab: "x" } }])[0]!;
    expect((bad.response_body as { error: { code: string } }).error.code).toBe("UNKNOWN_FIELDS");
  });
});

describe("Plan Tracker Publication: only approved (sent) tasks", () => {
  it("publishes only the owner whose approved draft was sent, under a dated meeting tab", () => {
    const p = plan();
    expect(p.action).toBe("PUBLISH");
    expect(p.tab).toBe("2026-11-09 · Project Atlas weekly planning");
    const tasks = p.tasks as J[];
    expect(tasks.map((t) => t.task_id)).toEqual(["AR2-1062-A1", "AR2-1062-A3"]); // Dev's task is not approved yet
    expect(tasks[0]).toMatchObject({ owner: "Maya", email: "maya@example.org", due_date: "2026-11-03", estimate: 1, approval_state: "Approved (v1)", email_state: "Sent - Gmail accepted" });
    expect(tasks[1]).toMatchObject({ due_date: "", estimate: "" }); // ambiguous wording and unknown estimate stay blank, never guessed
  });
  it("a sent team summary covers every task", () => {
    const tasks = plan({ dispatches: [{ job_id: JOB, version: 1, status: "SENT", employee: "", recipients: "team@example.org" }] }).tasks as J[];
    expect(tasks.map((t) => t.owner)).toEqual(["Maya", "Dev", "Maya"]);
    expect(tasks[1]).toMatchObject({ email: "", email_state: "Included in team email" });
  });
  it.each([
    [{ dispatches: [] }, "NOT_APPROVED"],
    [{ dispatches: [{ job_id: JOB, version: 1, status: "FAILED", employee: "Maya" }] }, "NOT_APPROVED"],
    [{ dispatches: [{ job_id: JOB, version: 1, status: "UNCERTAIN", employee: "Maya" }] }, "NOT_APPROVED"],
    [{ case: { case_id: "AR2-1062", latest_version: 1, readiness_status: "BLOCKED" } }, "NOT_APPROVABLE"],
    [{ case: { case_id: "AR2-1062", latest_version: 2, readiness_status: "READY" } }, "VERSION_NOT_CURRENT"],
  ])("refuses %#", (over, codeExpected) => {
    const p = plan(over as Parameters<typeof records>[0]);
    expect(p.action).toBe("RESPOND");
    expect((p.response_body as { error: { code: string } }).error.code).toBe(codeExpected);
  });
});

const ok = (body: unknown) => ({ statusCode: 200, body });
describe("Ensure Tracker Tab", () => {
  const p = plan();
  it("reuses an existing tab", () => {
    const r = run("3-ensure-tab.js", [ok({ sheets: [{ properties: { sheetId: 7, title: p.tab } }] })], { "Plan Tracker Publication": [p] })[0]!;
    expect(r).toMatchObject({ action: "EXISTS", sheet_id: 7 });
  });
  it("creates a missing tab with header, Status dropdown and warning-only protection, leaving Status/Update note editable", () => {
    const r = run("3-ensure-tab.js", [ok({ sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }] })], { "Plan Tracker Publication": [p] })[0]!;
    expect(r.action).toBe("CREATE");
    const reqs = (r.request_body as { requests: J[] }).requests;
    expect(JSON.stringify(reqs[1])).toContain("Status");
    const dv = reqs.find((x) => x.setDataValidation) as { setDataValidation: { range: J } };
    expect(dv.setDataValidation.range).toMatchObject({ startColumnIndex: 8, endColumnIndex: 9 });
    const prot = reqs.filter((x) => x.addProtectedRange).map((x) => (x as { addProtectedRange: { protectedRange: { range: J; warningOnly: boolean } } }).addProtectedRange.protectedRange);
    expect(prot.every((x) => x.warningOnly)).toBe(true);
    const body = prot.filter((x) => x.range.startRowIndex === 1);
    for (const col of [8, 9]) expect(body.some((x) => (x.range.startColumnIndex as number) <= col && col < (x.range.endColumnIndex as number))).toBe(false);
  });
  it("an unreadable sheet fails honestly", () => {
    expect(run("3-ensure-tab.js", [{ statusCode: 403, body: { error: {} } }], { "Plan Tracker Publication": [p] })[0]).toMatchObject({ action: "RESPOND", response_body: { tracker_status: "FAILED" } });
  });
});

describe("Plan Tracker Writes: never overwrite the employee's Status or Update note", () => {
  const p = plan();
  const tab = { action: "EXISTS", tab: p.tab, sheet_id: 7, read_url: "u" };
  const header = ["Task ID", "Meeting", "Owner", "Email", "Task", "Due wording", "Due date", "Estimate (h)", "Status", "Update note"];
  const writes = (values: unknown[][]) => run("4-plan-writes.js", [ok({ values })], { "Plan Tracker Publication": [p], "Ensure Tracker Tab": [tab] })[0]!;
  it("appends new tasks as Not started, RAW", () => {
    const w = writes([header]);
    const rb = w.request_body as { valueInputOption: string; data: { range: string; values: unknown[][] }[] };
    expect(rb.valueInputOption).toBe("RAW");
    expect(rb.data.map((d) => d.range)).toEqual([`'${p.tab}'!A2:O2`, `'${p.tab}'!A3:O3`]);
    expect(rb.data[0]!.values[0]![8]).toBe("Not started");
    expect(w).toMatchObject({ added: 2, updated: 0 });
  });
  it("updates an existing row by Task ID, skipping columns I-J", () => {
    const w = writes([header, ["AR2-1062-A1", "old", "Maya", "maya@example.org", "old", "", "", 1, "In progress", "halfway"]]);
    const ranges = (w.request_body as { data: { range: string }[] }).data.map((d) => d.range);
    expect(ranges).toContain(`'${p.tab}'!A2:H2`);
    expect(ranges).toContain(`'${p.tab}'!K2:O2`);
    expect(ranges.some((x) => /![A-Z]*2:[A-Z]*2$/.test(x) && /I|J/.test(x.split("!")[1]!))).toBe(false);
    expect(w).toMatchObject({ added: 1, updated: 1 });
  });
});

describe("Verify Tracker Rows", () => {
  const p = plan();
  const tab = { action: "CREATE", tab: p.tab, sheet_id: 7, read_url: "u" };
  const w = { added: 2, updated: 0 };
  const verify = (readBack: J, wrote: J = ok({})) => run("5-verify.js", [readBack], { "Plan Tracker Publication": [p], "Ensure Tracker Tab": [tab], "Plan Tracker Writes": [w], "Sheets · Write Tracker Rows": [wrote] })[0]!;
  const row = (t: J) => [t.task_id, t.meeting, t.owner, t.email, t.task, t.due_text, t.due_date, t.estimate, "Not started", "", t.case_id, String(t.version)];
  it("PUBLISHED only when every task reads back exactly once", () => {
    const v = verify(ok({ values: [["Task ID"], ...(p.tasks as J[]).map(row)] }));
    expect(v).toMatchObject({ tracker_status: "PUBLISHED", response_body: { verified: true, tab_created: true } });
  });
  it("a missing or duplicated row is UNVERIFIED, not PUBLISHED", () => {
    const t = p.tasks as J[];
    expect(verify(ok({ values: [["Task ID"], row(t[0]!)] })).tracker_status).toBe("UNVERIFIED");
    expect(verify(ok({ values: [["Task ID"], row(t[0]!), row(t[0]!), row(t[1]!)] })).tracker_status).toBe("UNVERIFIED");
  });
  it("a rejected write is FAILED", () => {
    expect(verify(ok({ values: [] }), { statusCode: 400, body: {} }).tracker_status).toBe("FAILED");
  });
});
