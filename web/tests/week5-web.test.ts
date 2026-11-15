// MOCKED tests: Week 5 website adapter (lib/visibility/api.ts) and the public /agent-profile.json route.
// No real network: fetch is injected; demo mode must never reach n8n; live failures are never replaced by the sample.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getExperiment, listExperiments, startExperiment } from "@/lib/visibility/api";
import { aggregate, planRuns, runRow, W5 } from "@/lib/visibility/core";
import { GET as profileGET } from "@/app/agent-profile.json/route";

const KEYS = ["ACTIONREADY_MODE", "N8N_WEBHOOK_BASE", "N8N_WEBHOOK_HEADER_NAME", "N8N_WEBHOOK_SECRET", "N8N_JOB_STATUS_PATH"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});
const live = () =>
  Object.assign(process.env, { ACTIONREADY_MODE: "live", N8N_WEBHOOK_BASE: "https://example.test/webhook", N8N_WEBHOOK_HEADER_NAME: "X-Test-Key", N8N_WEBHOOK_SECRET: "s".repeat(24), N8N_JOB_STATUS_PATH: "abc/actionready/v1/jobs" });
const BODY = { kind: "CONTEXT", prompt_ids: ["P01", "P04", "P05", "P06", "P08"], cold_prompt_ids: [], contexts: ["COPY", "STRUCTURED"], models: ["gemini-3.5-flash"], reps: 3 };
const spy = (status: number, body: unknown) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
};

describe("visibility adapter", () => {
  it("demo mode never calls n8n (synthetic sample is a page-level choice, not a fallback)", async () => {
    process.env.ACTIONREADY_MODE = "demo";
    const s = spy(202, {});
    expect(await startExperiment(BODY, "owner", s.f)).toMatchObject({ kind: "unavailable" });
    expect(await listExperiments(s.f)).toMatchObject({ kind: "unavailable" });
    expect(s.calls).toHaveLength(0);
  });
  it("refuses an invalid experiment before any network call", async () => {
    live();
    const s = spy(202, {});
    expect(await startExperiment({ ...BODY, prompt: "free text" }, "g_abc", s.f)).toMatchObject({ kind: "refused", http: 400 });
    expect(await startExperiment({ ...BODY, reps: 99 }, "g_abc", s.f)).toMatchObject({ kind: "refused" });
    expect(s.calls).toHaveLength(0);
  });
  it("starts a valid experiment with the header secret server-side and an opaque requester id", async () => {
    live();
    const s = spy(202, { schema_version: "1", experiment_id: "w5x_mabc123_abcdef", status: "RUNNING", requested_runs: 30 });
    expect(await startExperiment(BODY, "g_0123456789abcdef01234567", s.f)).toEqual({ kind: "accepted", experiment_id: "w5x_mabc123_abcdef", requested_runs: 30 });
    expect(s.calls[0]!.url).toBe("https://example.test/webhook/actionready/v1/visibility/experiments");
    expect((s.calls[0]!.init.headers as Record<string, string>)["X-Test-Key"]).toBe("s".repeat(24));
    expect(JSON.parse(String(s.calls[0]!.init.body))).toMatchObject({ requested_by_hash: "g_0123456789abcdef01234567", reps: 3 });
  });
  it("409 from n8n (another experiment running) is reported as refused; silence is ambiguous, never 'started'", async () => {
    live();
    expect(await startExperiment(BODY, "g_a", spy(409, { error: { message: "Another visibility experiment is still running." } }).f)).toMatchObject({ kind: "refused", http: 409 });
    const dead = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await startExperiment(BODY, "g_a", dead)).toMatchObject({ kind: "ambiguous" });
    expect(await listExperiments(dead)).toMatchObject({ kind: "unavailable" });
  });
  it("detail: bad ids never hit the network; metrics are recomputed from runs, ignoring any server-sent numbers", async () => {
    live();
    const s = spy(200, {});
    expect(await getExperiment("../../etc", s.f)).toEqual({ kind: "not_found" });
    expect(s.calls).toHaveLength(0);
    const req = { kind: "CONTEXT" as const, prompt_ids: ["P01"], cold_prompt_ids: [], contexts: ["COPY" as const], models: ["gemini-3.5-flash"], reps: 3, seed: 1, requested_by_hash: null };
    const runs = planRuns("w5x_mabc123_abcdef", req).map((r) => runRow(r, "w5x_mabc123_abcdef", { provider_status: "OK", raw: JSON.stringify({ contract: W5.contract, prompt_id: "P01", declined: false, decline_reason: null, candidates: [{ name: "ActionReady", rank: 1, status: "RECOMMENDED", reasons: [], claimed_capabilities: [] }] }), latency_ms: 1, started_at: "x" }));
    const d = await getExperiment("w5x_mabc123_abcdef", spy(200, { experiment: { experiment_id: "w5x_mabc123_abcdef", status: "COMPLETE" }, runs, metrics: { forged: true } }).f);
    expect(d.kind).toBe("ok");
    if (d.kind === "ok") {
      expect(d.data.metrics).toEqual(aggregate(runs));
      expect(d.data.synthetic).toBe(false);
    }
  });
});

describe("stored summary vs recomputed status", () => {
  it("a stale stored summary is corrected from the runs and kept visibly as stored_status", async () => {
    live();
    const req = { kind: "COLD" as const, prompt_ids: [], cold_prompt_ids: ["P01"], contexts: [], models: ["gemini-3.5-flash"], reps: 3, seed: 1, requested_by_hash: null };
    const runs = planRuns("w5x_mabc123_abcdef", req).map((r) => runRow(r, "w5x_mabc123_abcdef", { provider_status: "OK", raw: JSON.stringify({ contract: W5.contract, prompt_id: "P01", declined: false, decline_reason: null, candidates: [{ name: "Otter.ai", rank: 1, status: "RECOMMENDED", reasons: [], claimed_capabilities: [] }] }), latency_ms: 1, started_at: "x" }));
    const d = await getExperiment("w5x_mabc123_abcdef", spy(200, { experiment: { experiment_id: "w5x_mabc123_abcdef", status: "PARTIAL", requested_runs: 3, valid_runs: 1 }, runs }).f);
    expect(d.kind === "ok" && d.data.experiment).toMatchObject({ status: "COMPLETE", valid_runs: 3, stored_status: "PARTIAL", stored_valid_runs: 1 });
  });
});

describe("sanitized n8n export", () => {
  it("contains only the Week 5 branch and no private identifiers", async () => {
    // @ts-expect-error — plain .mjs script
    const { sanitizedWorkflow } = await import("../scripts/export-week5.mjs");
    const wf = sanitizedWorkflow() as { nodes: { name: string; type: string }[] };
    const text = JSON.stringify(wf);
    expect(wf.nodes.every((n) => n.name.startsWith("W5 · ") || n.type === "n8n-nodes-base.stickyNote")).toBe(true);
    expect(text).not.toMatch(/n8n\.cloud|@gmail|webhookId|X-ActionReady-Key|KTQmpWghSB2jid1T/);
    expect(text).toMatch(/REPLACE_WITH_YOUR_GEMINI_CREDENTIAL/);
  });
});

describe("/agent-profile.json", () => {
  it("is public JSON, crawlable, and contains no secrets or private identifiers", async () => {
    live();
    const res = profileGET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("x-robots-tag")).toBe("all");
    const text = await res.text();
    const j = JSON.parse(text);
    expect(j.product).toBe("ActionReady");
    expect(text).not.toContain("example.test");
    expect(text).not.toContain("s".repeat(24));
    expect(text).not.toMatch(/X-Test-Key|N8N_|@gmail|webhook/i);
  });
});
