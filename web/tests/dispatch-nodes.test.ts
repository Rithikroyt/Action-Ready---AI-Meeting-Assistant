// OFFLINE tests of the n8n Review & Send Code nodes (n8n/dispatch/*.js) with mocked $input / $(). No n8n, no Gmail.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const code = (f: string) => readFileSync(fileURLToPath(new URL(`../../n8n/dispatch/${f}`, import.meta.url)), "utf8");
type J = Record<string, unknown>;
function run(file: string, input: J[], nodes: Record<string, J[]> = {}, patch?: (src: string) => string): J[] {
  const $input = { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) };
  const $ = (n: string) => ({ first: () => ({ json: (nodes[n] ?? [])[0] }), all: () => (nodes[n] ?? []).map((json) => ({ json })) });
  const src = patch ? patch(code(file)) : code(file);
  return (new Function("$input", "$", src) as (i: unknown, d: unknown) => { json: J }[])($input, $).map((x) => x.json);
}

const JOB = "8c0a7199-ec8a-461d-9849-064eda2de1b2";
const KEY = "a".repeat(64);
const SETTINGS = { send_enabled: false, allowed_recipient_domains: ["asu.edu"], allowed_recipient_addresses: ["owner.test@example.com"], max_recipients: 10, daily_send_cap: 25 };
const goodBody = (over: J = {}) => ({ job_id: JOB, version: 1, recipients: ["Maya@ASU.edu", "owner.test@example.com", "maya@asu.edu"], subject: "Project Atlas — follow-up", body: "Hi team, …", dispatch_key: KEY, confirm: true, ...over });
const validate = (body: unknown, settings = SETTINGS) => run("2-validate.js", [{ settings, body }])[0]!;

describe("Validate Dispatch Request", () => {
  it("with allow_any_recipient, any valid address is accepted (it becomes part of what is approved)", () => {
    expect(validate(goodBody({ recipients: ["someone@example.org"] }), { ...SETTINGS, allow_any_recipient: true } as typeof SETTINGS)).toMatchObject({ valid: true, recipients: ["someone@example.org"], employee: null });
  });
  it("the shipped settings node: sending ON (owner-authorized 2026-11-09), any recipient after approval, daily cap", () => {
    const shipped = run("1-settings.js", [{ body: {} }])[0]!.settings as Record<string, unknown>;
    expect(shipped).toMatchObject({ send_enabled: true, allow_any_recipient: true, daily_send_cap: 25, max_recipients: 10 });
  });
  it("accepts a confirmed, allowlisted request and normalizes recipients", () => {
    expect(validate(goodBody())).toMatchObject({ valid: true, recipients: ["maya@asu.edu", "owner.test@example.com"], version: 1 });
  });
  it.each([
    [{ ...goodBody(), approved: true }, "UNKNOWN_FIELDS"],
    [goodBody({ confirm: false }), "NOT_CONFIRMED"],
    [goodBody({ recipients: ["not an email"] }), "INVALID_RECIPIENT"],
    [goodBody({ recipients: ["a@asu.edu, b@evil.com"] }), "INVALID_RECIPIENT"],
    [goodBody({ recipients: ["someone@evil.com"] }), "RECIPIENT_NOT_ALLOWED"],
    [goodBody({ recipients: Array.from({ length: 11 }, (_, i) => `p${i}@asu.edu`) }), "TOO_MANY_RECIPIENTS"],
    [goodBody({ recipients: [] }), "NO_RECIPIENTS"],
    [goodBody({ job_id: "nope" }), "INVALID_JOB_ID"],
    [goodBody({ dispatch_key: "short" }), "INVALID_DISPATCH_KEY"],
    [goodBody({ employee: 42 }), "INVALID_EMPLOYEE"],
    [goodBody({ employee: "x".repeat(121) }), "INVALID_EMPLOYEE"],
  ])("refuses %#", (body, codeExpected) => {
    const r = validate(body);
    expect(r.valid).toBe(false);
    expect((r.response_body as { error: { code: string } }).error.code).toBe(codeExpected);
  });
});

// Stored records for a READY, approval-routed v1 case.
const readyCase = (over: J = {}) => ({
  case_id: "AR2-900", latest_version: 1, readiness_status: "READY", latest_subject: "Project Atlas — follow-up", latest_body: "Hi team, …",
  readiness_json: JSON.stringify({ checked_version: 1, routing: { route_id: "APPROVAL", label: "Ready for approval" } }), ...over,
});
const nodesFor = (opts: { settings?: J; caseRow?: J; versions?: J[]; job?: J; existing?: J[] } = {}) => ({
  "Validate Dispatch Request": [{ ...validate(goodBody()), settings: opts.settings ?? SETTINGS }],
  "Find Existing Dispatch": opts.existing ?? [{}],
  "Read Dispatch Job": [opts.job ?? { job_id: JOB, case_id: "AR2-900", execution_status: "SUCCEEDED" }],
  "Read Dispatch Case": [opts.caseRow ?? readyCase()],
  "Read Dispatch Versions": opts.versions ?? [{ case_id: "AR2-900", version: 1, gate: "PASS" }],
});
const authorize = (opts: Parameters<typeof nodesFor>[0] = {}) => run("3-authorize.js", [{}], nodesFor(opts))[0]!;
const errCode = (r: J) => (r.response_body as { error?: { code: string } }).error?.code;

describe("Authorize Dispatch (server-side rules)", () => {
  it("with sending switched off: all checks pass but nothing is sent", () => {
    const r = authorize();
    expect(r).toMatchObject({ action: "RESPOND", http_status: 403 });
    expect(errCode(r)).toBe("SEND_DISABLED");
  });
  it("with sending switched on: authorizes exactly one SEND for the current version", () => {
    const r = authorize({ settings: { ...SETTINGS, send_enabled: true } });
    expect(r).toMatchObject({ action: "SEND", version: 1, recipients: "maya@asu.edu, owner.test@example.com", recipient_count: 2, dispatch_key: KEY });
  });
  it("a repeated dispatch_key replays the recorded outcome and never sends again", () => {
    const r = authorize({ settings: { ...SETTINGS, send_enabled: true }, existing: [{ dispatch_key: KEY, status: "SENT", gmail_message_id: "m1", recipient_count: 2, id: 4 }] });
    expect(r).toMatchObject({ action: "RESPOND", http_status: 200, response_body: { dispatch_status: "SENT", replay: true, gmail_message_id: "m1" } });
  });
  it.each([
    [{ caseRow: readyCase({ readiness_status: "BLOCKED" }) }, "NOT_READY"],
    [{ caseRow: readyCase({ readiness_status: "UNKNOWN" }) }, "NOT_READY"],
    [{ versions: [{ case_id: "AR2-900", version: 1, gate: "TECHNICAL" }] }, "AI_REVIEW_NOT_PASSED"],
    [{ versions: [{ case_id: "AR2-900", version: 1, gate: "PASS" }, { case_id: "AR2-900", version: 2, gate: "PASS" }], caseRow: readyCase({ latest_version: 2 }) }, "VERSION_NOT_CURRENT"],
    [{ caseRow: readyCase({ latest_body: "Edited after review" }) }, "CONTENT_CHANGED"],
    [{ caseRow: readyCase({ readiness_json: JSON.stringify({ checked_version: 1, routing: { route_id: "MANAGER_REVIEW", label: "Manager review" } }) }) }, "NOT_ROUTED_TO_APPROVAL"],
    [{ caseRow: readyCase({ readiness_json: JSON.stringify({ checked_version: 0 }) }) }, "READINESS_NOT_CURRENT"],
    [{ job: { job_id: JOB, case_id: "AR2-900", execution_status: "RUNNING" } }, "JOB_NOT_FINAL"],
    [{ job: { job_id: "someone-else", case_id: "AR2-900", execution_status: "SUCCEEDED" } }, "JOB_NOT_FOUND"],
    [{ existing: [{ error: "read failed" }] }, "STORAGE_UNAVAILABLE"],
  ])("refuses even when sending is on %#", (opts, expected) => {
    const r = authorize({ ...opts, settings: { ...SETTINGS, send_enabled: true } } as Parameters<typeof nodesFor>[0]);
    expect(r.action).toBe("RESPOND");
    expect(errCode(r)).toBe(expected);
  });
});

describe("Confirm Dispatch Claim (no double send)", () => {
  const auth = { action: "SEND", claim_id: "c-mine", dispatch_key: KEY, job_id: JOB, version: 1 };
  const confirm = (rows: J[]) => run("4-confirm-claim.js", rows, { "Authorize Dispatch": [auth] })[0]!;
  it("the first recorded claim sends", () => expect(confirm([{ dispatch_key: KEY, claim_id: "c-mine", id: 7 }]).confirmed).toBe(true));
  it("a concurrent earlier claim wins; this request sends nothing", () => {
    const r = confirm([{ dispatch_key: KEY, claim_id: "c-mine", id: 8 }, { dispatch_key: KEY, claim_id: "c-other", id: 7 }]);
    expect(r).toMatchObject({ confirmed: false, http_status: 409 });
  });
  it("an unrecorded claim never sends", () => expect(confirm([{}])).toMatchObject({ confirmed: false, http_status: 503 }));
});

describe("Capture Send Result + Build Dispatch Response (honest outcomes)", () => {
  const claim = { job_id: JOB, version: 1, recipient_count: 2, claim_id: "c-mine" };
  const capture = (gmailOut: J) => run("5-capture-result.js", [gmailOut], { "Confirm Dispatch Claim": [claim] })[0]!;
  const respond = (captured: J, updateOut: J[] = [{}]) => run("6-build-response.js", updateOut, { "Capture Send Result": [captured] })[0]!;
  it("a Gmail message ID → SENT, described as accepted, never as delivered", () => {
    const c = capture({ id: "18c0ffee", threadId: "t" });
    expect(c).toMatchObject({ status: "SENT", gmail_message_id: "18c0ffee" });
    const r = respond(c);
    expect(r.http_status).toBe(200);
    expect(JSON.stringify(r.response_body)).toMatch(/Delivery and reading are not confirmed/);
    expect(JSON.stringify(r.response_body)).not.toMatch(/\bdelivered\b(?! and)/i);
  });
  it("a timeout → UNCERTAIN (504), with no automatic resend", () => {
    const c = capture({ error: { message: "ETIMEDOUT while calling Gmail" } });
    expect(c.status).toBe("UNCERTAIN");
    expect(respond(c)).toMatchObject({ http_status: 504, response_body: { dispatch_status: "UNCERTAIN" } });
  });
  it("a definite rejection → FAILED (502)", () => {
    const c = capture({ error: { message: "Invalid To header" } });
    expect(c.status).toBe("FAILED");
    expect(respond(c)).toMatchObject({ http_status: 502, response_body: { dispatch_status: "FAILED" } });
  });
  it("reports when the outcome could not be saved", () => {
    expect(respond(capture({ id: "x" }), [{ error: "write failed" }]).response_body).toMatchObject({ record_saved: false });
  });
});

const CAND = { meeting_title: "Project Atlas sync", actions: [{ id: "A1", task: "Send the agenda", owner: "Maya Chen", due_text: "Tuesday", estimated_hours: 1 }, { id: "A2", task: "Fix login", owner: "Dev Patel", due_text: "Friday", estimated_hours: 3 }] };
const SHARED = readFileSync(fileURLToPath(new URL("../../n8n/shared/employee-drafts.js", import.meta.url)), "utf8");
const drafts = (new Function(SHARED + "; return employeeDrafts;")() as (c: unknown, id: string, v: number) => { employee: string; subject: string; body: string }[])(CAND, "AR2-900", 1);
describe("Authorize Dispatch: per-employee drafts and the daily cap", () => {
  const ON = { ...SETTINGS, send_enabled: true, daily_send_cap: 25 };
  const empAuth = (over: J = {}, extra: Parameters<typeof nodesFor>[0] = {}) => {
    const d = drafts[0]!;
    const n = nodesFor({ settings: ON, versions: [{ case_id: "AR2-900", version: 1, gate: "PASS", evaluated_candidate_json: JSON.stringify(CAND) }], ...extra });
    n["Validate Dispatch Request"] = [{ ...validate(goodBody({ employee: "maya chen", subject: d.subject, body: d.body, ...over })), settings: extra.settings ?? ON }];
    return run("3-authorize.js", [{}], n)[0]!;
  };
  it("sends one employee's draft when the text matches the stored reviewed version", () => {
    expect(empAuth()).toMatchObject({ action: "SEND", employee: "maya chen", subject: drafts[0]!.subject, body: drafts[0]!.body });
  });
  it("refuses an employee who has no reviewed action items", () => {
    expect(errCode(empAuth({ employee: "Mallory" }))).toBe("EMPLOYEE_NOT_IN_DRAFT");
  });
  it("refuses a per-employee message edited in the browser", () => {
    expect(errCode(empAuth({ body: drafts[0]!.body + " P.S. wire money" }))).toBe("CONTENT_CHANGED");
  });
  it("refuses sending one employee's text under another employee's name", () => {
    expect(errCode(empAuth({ employee: "Dev Patel" }))).toBe("CONTENT_CHANGED");
  });
  it("enforces the daily send cap across today's SENT / SENDING / UNCERTAIN dispatches", () => {
    const today = new Date().toISOString();
    const existing = [{ dispatch_key: "b".repeat(64), status: "SENT", recipient_count: 24, approved_at: today, id: 1 }];
    const r = empAuth({}, { settings: ON, existing });
    expect(errCode(r)).toBe("DAILY_LIMIT_REACHED");
    expect(r.http_status).toBe(429);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(empAuth({}, { settings: ON, existing: [{ ...existing[0]!, approved_at: yesterday }] }).action).toBe("SEND");
    expect(empAuth({}, { settings: ON, existing: [{ ...existing[0]!, status: "FAILED" }] }).action).toBe("SEND");
  });
});
