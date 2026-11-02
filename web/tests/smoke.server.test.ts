// LOCAL-SERVER smoke test against a running `next start` in DEMO mode. Not a live n8n test.
// Run:  SMOKE_URL=http://localhost:3100 SESSION_SECRET=... npx vitest run tests/smoke.server.test.ts
import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/lib/fixtures";

const URL_ = process.env.SMOKE_URL;
const SECRET = process.env.SESSION_SECRET ?? "";
const run = URL_ && SECRET ? describe : describe.skip;

const cookie = () => {
  const p = Buffer.from(JSON.stringify({ sub: "owner", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `ar_session=${p}.${createHmac("sha256", SECRET).update(p).digest("base64url")}`;
};
const body = (id: string, request_id = randomUUID()) => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  return { request_id, notes: s.notes, period_start: s.period!.start, period_end: s.period!.end, timezone: "America/Phoenix" };
};
const post = (b: unknown, headers: Record<string, string> = { Cookie: cookie(), Origin: URL_! }) =>
  fetch(`${URL_}/api/meetings`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(b) });
const getJob = async (id: string) => (await (await fetch(`${URL_}/api/jobs/${id}`, { headers: { Cookie: cookie() } })).json()) as { job: Record<string, any> };

run("app routes (LOCAL-SERVER, DEMO)", () => {
  it("auth and origin are enforced", async () => {
    expect((await post(body("overload"), { Origin: URL_! })).status).toBe(401);
    expect((await post(body("overload"), { Cookie: cookie() })).status).toBe(403);
    const page = await fetch(`${URL_}/`, { redirect: "manual" });
    expect(page.status).toBe(307);
  });

  it("headline overload: 6 + 4 vs 8 → BLOCKED, approval not given, nothing permitted", async () => {
    const res = await post(body("overload"));
    expect(res.status).toBe(202);
    const { job_id } = (await res.json()) as { job_id: string };
    const { job } = await getJob(job_id);
    expect(job.mode).toBe("DEMO");
    expect(job.execution_status).toBe("SUCCEEDED");
    expect(job.operational_readiness).toBe("BLOCKED");
    expect(job.approval_status).toBe("NOT_GIVEN");
    expect(job.external_action).toBe("NOT_PERMITTED");
    expect(job.workload[0]).toMatchObject({ existing_open_hours: 6, new_proposed_hours: 4, projected_load: 10, available_hours: 8, capacity_margin: -2 });
    expect(job.records.map((r: { id: string }) => r.id)).toContain("CMT-ATLAS-0007");
    expect(job.tool_evidence).toEqual([]); // demo never fabricates tool calls
  });

  it("failure demo: missing capacity → UNKNOWN with null capacity", async () => {
    const { job_id } = (await (await post(body("missing-capacity"))).json()) as { job_id: string };
    const { job } = await getJob(job_id);
    expect(job.operational_readiness).toBe("UNKNOWN");
    expect(job.workload[0].available_hours).toBeNull();
  });

  it("repeated request returns the same job; same id with different input conflicts", async () => {
    const rid = randomUUID();
    const a = (await (await post(body("within", rid))).json()) as { job_id: string };
    const second = await post(body("within", rid));
    expect(second.status).toBe(200);
    expect(((await second.json()) as { job_id: string }).job_id).toBe(a.job_id);
    expect((await post({ ...body("within", rid), notes: body("overload").notes })).status).toBe(409);
  });

  it("rejects browser-supplied scope and non-example notes in demo mode", async () => {
    expect((await post({ ...body("within"), project_id: "OTHER" })).status).toBe(422);
    const r = await post({ ...body("within"), notes: "Dev will fix the login bug by Friday, estimated 2 hours." });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("DEMO_ONLY");
  });

  it("unknown job ids are 404 and responses are no-store", async () => {
    const r = await fetch(`${URL_}/api/jobs/demo_doesnotexist1`, { headers: { Cookie: cookie() } });
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("case and overview pages render", async () => {
    const { job_id } = (await (await post(body("overload"))).json()) as { job_id: string };
    const html = await (await fetch(`${URL_}/cases/${job_id}`, { headers: { Cookie: cookie() } })).text();
    expect(html).toContain("Operational readiness");
    expect(html).toContain("Synthetic demo");
    expect(await (await fetch(`${URL_}/`, { headers: { Cookie: cookie() } })).text()).toContain("Recent cases");
  });
});
