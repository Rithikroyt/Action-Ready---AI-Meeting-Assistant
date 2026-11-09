// OFFLINE tests: the website side of Review & Send (lib/service.requestDispatch + lib/n8n.dispatchToN8n).
// n8n is mocked; nothing is sent anywhere.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["ACTIONREADY_DATA_DIR", "VERCEL", "ACTIONREADY_MODE", "N8N_WEBHOOK_BASE", "N8N_WEBHOOK_HEADER_NAME", "N8N_WEBHOOK_SECRET", "N8N_JOB_STATUS_PATH"];
const JOB = "8c0a7199-ec8a-461d-9849-064eda2de1b2";
let saved: Record<string, string | undefined>;
let scratch: string;

const LIVE_ENV = {
  ACTIONREADY_MODE: "live",
  N8N_WEBHOOK_BASE: "https://example.invalid/webhook",
  N8N_WEBHOOK_HEADER_NAME: "X-ActionReady-Key",
  N8N_WEBHOOK_SECRET: "x".repeat(24),
  N8N_JOB_STATUS_PATH: "abc/actionready/v1/jobs",
};
// Raw status body as the workflow returns it (draft text deliberately has edge whitespace: it must be sent byte-exact).
const statusBody = (version = 1) => ({
  job_id: JOB, case_id: "AR2-900", execution_status: "SUCCEEDED",
  ai_review: { status: "AI_REVIEWED_NOT_HUMAN_APPROVED", gate: "PASS", score: 5, version },
  operational_readiness: { status: "READY", reasons: [] },
  draft: { subject: "Project Atlas — follow-up ", body: "Hi team,\n\n• Maya — send the agenda by 3 November 2026 (1 h)\n" },
  routing: { route_id: "APPROVAL", why: ["passed"] },
  employee_drafts: [{ employee: "Maya Chen", subject: "Your action items: Atlas", body: "Hi Maya,\n\n- Send the agenda (due: Tuesday), estimated 1 h\n", action_ids: ["A1"], action_count: 1 }],
});

const load = async () => {
  vi.resetModules();
  return { service: await import("@/lib/service"), registry: await import("@/lib/registry") };
};
async function liveWithJob() {
  Object.assign(process.env, LIVE_ENV, { ACTIONREADY_DATA_DIR: path.join(scratch, "data") });
  const m = await load();
  await m.registry.addJob({ job_id: JOB, request_id: "r1", fingerprint: "f", mode: "LIVE", owner: "owner", submitted_at: new Date().toISOString(), period: { start: "2026-11-02", end: "2026-11-06", timezone: "UTC" }, snapshot: null });
  return m;
}
/** Mock n8n: GET status returns `status`, POST dispatch returns `dispatch` (or throws). Records every call. */
function n8n(dispatch: { status: number; body?: unknown } | "throw", status = statusBody()) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") return new Response(JSON.stringify(status), { status: 200 });
    if (String(url).endsWith("/tracker/publish")) return new Response(JSON.stringify({ tracker_status: "PUBLISHED", tab: "2026-11-09 · Atlas", rows_added: 1, rows_updated: 0, sheet_url: "https://docs.google.com/spreadsheets/d/abc/edit#gid=5" }), { status: 200 });
    if (dispatch === "throw") throw new Error("socket hang up");
    return new Response(JSON.stringify(dispatch.body ?? {}), { status: dispatch.status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const req = (over: Partial<{ recipients: string[]; version: number; confirm: boolean; employee: string | null }> = {}) => ({ recipients: ["Maya@ASU.edu"], version: 1, confirm: true, ...over });

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  scratch = mkdtempSync(path.join(tmpdir(), "ar-send-"));
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  rmSync(scratch, { recursive: true, force: true });
});

describe("requestDispatch refuses before calling n8n", () => {
  it("demo mode can never send", async () => {
    process.env.ACTIONREADY_DATA_DIR = path.join(scratch, "d");
    const { service } = await load();
    const m = n8n({ status: 200 });
    expect((await service.requestDispatch("owner", JOB, req(), m.fn)).kind).toBe("unavailable");
    expect(m.calls).toHaveLength(0);
  });
  it.each([
    [req({ confirm: false }), "invalid"],
    [req({ recipients: [] }), "invalid"],
    [req({ recipients: ["not-an-email"] }), "invalid"],
    [req({ recipients: Array.from({ length: 11 }, (_, i) => `p${i}@asu.edu`) }), "invalid"],
  ])("invalid input %# → %s, no network", async (input, kind) => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200 });
    expect((await service.requestDispatch("owner", JOB, input, m.fn)).kind).toBe(kind);
    expect(m.calls).toHaveLength(0);
  });
  it("a job the workflow does not know (other project, or invented) is not found, and nothing is POSTed", async () => {
    const { service } = await liveWithJob();
    const calls: string[] = [];
    const fn = (async (url: string | URL, init?: RequestInit) => {
      calls.push((init?.method ?? "GET") + " " + String(url));
      return new Response(JSON.stringify({ error: { code: "JOB_NOT_FOUND" } }), { status: 404 });
    }) as unknown as typeof fetch;
    expect((await service.requestDispatch("owner", "11111111-1111-4111-8111-111111111111", req(), fn)).kind).toBe("not_found");
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
  });
  it("an outdated reviewed version is refused after a fresh status read, with no POST", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200 }, statusBody(2));
    expect((await service.requestDispatch("owner", JOB, req({ version: 1 }), m.fn)).kind).toBe("stale");
    expect(m.calls.map((c) => c.method)).toEqual(["GET"]);
  });
});

describe("requestDispatch sends the exact reviewed draft once", () => {
  it("POSTs the stored subject/body byte-exact, normalized recipients and a stable key", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200, body: { dispatch_status: "SENT", gmail_message_id: "18c0ffee", note: "Gmail accepted the message. Delivery and reading are not confirmed." } });
    const out = await service.requestDispatch("owner", JOB, req({ recipients: ["Maya@ASU.edu", " dev@asu.edu", "maya@asu.edu"] }), m.fn);
    expect(out).toMatchObject({ kind: "outcome", outcome: { state: "SENT", gmail_message_id: "18c0ffee" } });
    const post = m.calls.find((c) => c.method === "POST" && c.url.endsWith("/dispatch"))!;
    expect(post.url).toBe("https://example.invalid/webhook/actionready/v1/dispatch");
    const b = post.body as { subject: string; body: string; recipients: string[]; dispatch_key: string; confirm: boolean };
    expect(b.subject).toBe(statusBody().draft.subject);
    expect(b.body).toBe(statusBody().draft.body);
    expect(b.recipients).toEqual(["dev@asu.edu", "maya@asu.edu"]);
    expect(b.confirm).toBe(true);
    expect(b.dispatch_key).toBe(service.dispatchKey(JOB, 1, ["maya@asu.edu", "dev@asu.edu"], b.subject, b.body));
    expect(m.calls.filter((c) => c.method === "POST" && c.url.endsWith("/dispatch"))).toHaveLength(1);
  });
  it("the key ignores recipient order/case but changes with recipients, version or text", async () => {
    const { service } = await load();
    const k = service.dispatchKey(JOB, 1, ["a@asu.edu", "B@asu.edu"], "S", "B");
    expect(service.dispatchKey(JOB, 1, ["b@asu.edu", "a@asu.edu"], "S", "B")).toBe(k);
    for (const other of [service.dispatchKey(JOB, 1, ["a@asu.edu"], "S", "B"), service.dispatchKey(JOB, 2, ["a@asu.edu", "b@asu.edu"], "S", "B"), service.dispatchKey(JOB, 1, ["a@asu.edu", "b@asu.edu"], "S", "B2")])
      expect(other).not.toBe(k);
  });
});

describe("per-employee drafts", () => {
  it("sends the named employee's stored draft byte-exact, never the team draft", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200, body: { dispatch_status: "SEND_DISABLED" } });
    await service.requestDispatch("owner", JOB, req({ employee: "maya chen", recipients: ["maya@example.org"] }), m.fn);
    const b = m.calls.find((c) => c.method === "POST" && c.url.endsWith("/dispatch"))!.body as { employee: string; subject: string; body: string };
    expect(b).toMatchObject({ employee: "maya chen", subject: "Your action items: Atlas", body: statusBody().employee_drafts[0]!.body });
  });
  it("an employee with no reviewed items is refused before any POST", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200 });
    expect((await service.requestDispatch("owner", JOB, req({ employee: "Mallory" }), m.fn)).kind).toBe("invalid");
    expect(m.calls.map((c) => c.method)).toEqual(["GET"]);
  });
  it("employee null sends the team summary draft", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200, body: { dispatch_status: "SEND_DISABLED" } });
    await service.requestDispatch("owner", JOB, req({ employee: null }), m.fn);
    expect((m.calls.find((c) => c.method === "POST" && c.url.endsWith("/dispatch"))!.body as { employee: unknown; subject: string }).employee).toBeNull();
  });
});

describe("dispatch outcomes are reported honestly", () => {
  it.each([
    [{ status: 403, body: { dispatch_status: "SEND_DISABLED", error: { code: "SEND_DISABLED", message: "switched off" } } }, "SEND_DISABLED"],
    [{ status: 409, body: { dispatch_status: "REFUSED", error: { code: "NOT_READY", message: "not ready" } } }, "REFUSED"],
    [{ status: 502, body: { dispatch_status: "FAILED", error: { code: "SEND_FAILED", message: "rejected" } } }, "FAILED"],
    [{ status: 504, body: { dispatch_status: "UNCERTAIN" } }, "UNCERTAIN"],
    [{ status: 504, body: "gateway html" }, "UNCERTAIN"],
    [{ status: 404 }, "REFUSED"],
    [{ status: 200, body: { dispatch_status: "SENT", replay: true } }, "SENT"],
  ])("HTTP response %# → %s", async (resp, state) => {
    const { service } = await liveWithJob();
    const out = await service.requestDispatch("owner", JOB, req(), n8n(resp).fn);
    expect(out.kind === "outcome" && out.outcome.state).toBe(state);
  });
  it("no response from n8n → UNCERTAIN, and it is never retried", async () => {
    const { service } = await liveWithJob();
    const m = n8n("throw");
    const out = await service.requestDispatch("owner", JOB, req(), m.fn);
    expect(out).toMatchObject({ kind: "outcome", outcome: { state: "UNCERTAIN" } });
    expect(m.calls.filter((c) => c.method === "POST" && c.url.endsWith("/dispatch"))).toHaveLength(1);
  });
});

describe("task tracker follows a SENT dispatch only", () => {
  it("after Gmail accepts, the tracker is published once for this job and version, and reported separately", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200, body: { dispatch_status: "SENT", gmail_message_id: "x1" } });
    const out = await service.requestDispatch("owner", JOB, req(), m.fn);
    const t = m.calls.filter((c) => c.url.endsWith("/tracker/publish"));
    expect(t).toHaveLength(1);
    expect(t[0]!.body).toEqual({ job_id: JOB, version: 1 });
    expect(out).toMatchObject({ kind: "outcome", outcome: { state: "SENT" }, tracker: { state: "PUBLISHED", rows_added: 1, sheet_url: "https://docs.google.com/spreadsheets/d/abc/edit#gid=5" } });
  });
  it.each([
    [{ status: 403, body: { dispatch_status: "SEND_DISABLED" } }],
    [{ status: 409, body: { dispatch_status: "REFUSED" } }],
    [{ status: 502, body: { dispatch_status: "FAILED" } }],
    [{ status: 504, body: { dispatch_status: "UNCERTAIN" } }],
  ])("is never touched when the send was not accepted %#", async (resp) => {
    const { service } = await liveWithJob();
    const m = n8n(resp);
    const out = await service.requestDispatch("owner", JOB, req(), m.fn);
    expect(m.calls.some((c) => c.url.endsWith("/tracker/publish"))).toBe(false);
    expect(out).toMatchObject({ tracker: null });
  });
  it("Sync tracker only calls the tracker endpoint (never the AI, never email)", async () => {
    const { service } = await liveWithJob();
    const m = n8n({ status: 200 });
    expect((await service.syncTracker("owner", JOB, 1, m.fn)).kind).toBe("ok");
    expect(m.calls.map((c) => c.url.split("/").slice(-2).join("/"))).toEqual(["tracker/publish"]);
    // Shared project workspace: n8n (not this app's per-instance cache) decides what may be published.
    expect((await service.syncTracker("another-member", JOB, 1, m.fn)).kind).toBe("ok");
  });
});

describe("Stage B: live Overview reads the durable n8n case list", () => {
  it("one request lists the project's cases with their route and readiness, independent of this host's disk", async () => {
    Object.assign(process.env, LIVE_ENV, { ACTIONREADY_DATA_DIR: path.join(scratch, "empty") });
    const { service } = await load();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ jobs: [{ ...statusBody(), timestamps: { accepted_at: "2026-11-09T16:20:00.000Z" }, period: { start: "2026-11-02", end: "2026-11-06" } }] }), { status: 200 });
    });
    const rows = await service.overview("any-member", 15);
    vi.unstubAllGlobals();
    expect(calls).toEqual(["https://example.invalid/webhook/actionready/v1/cases"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ job_id: JOB, mode: "LIVE", submitted_at: "2026-11-09T16:20:00.000Z" });
    expect(rows[0]!.view?.operational_readiness).toBe("READY");
    expect(rows[0]!.view?.routing?.route_id).toBe("APPROVAL");
  });
});
