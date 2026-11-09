// OFFLINE: Week 4 per-employee drafts. The n8n template (n8n/shared/employee-drafts.js) is authoritative; the
// TS port must match it exactly, and both n8n nodes that use it must embed the identical function.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { employeeDrafts } from "@/lib/employeeDrafts";
import { normalizeJob } from "@/lib/contract";

const repo = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const SHARED = repo("n8n/shared/employee-drafts.js");
const n8nDrafts = new Function(`${SHARED}\nreturn employeeDrafts;`)() as typeof employeeDrafts;

const CANDS: [string, unknown][] = [
  [
    "two owners, mixed estimates",
    {
      meeting_title: "Project Atlas  weekly sync",
      actions: [
        { id: "A1", task: "Send the customer agenda", owner: "Maya Chen", due_text: "Tuesday 3 November", estimated_hours: 1 },
        { id: "A2", task: "Fix the login bug", owner: "Dev Patel", due_text: "Friday", estimated_hours: 4.5 },
        { id: "A3", task: "Book the demo room", owner: "maya chen", due_text: "", estimated_hours: null },
      ],
    },
  ],
  ["one item, no title", { actions: [{ id: "B1", task: "Draft the memo", owner: "Sam", due_text: "next week", estimated_hours: 2 }] }],
  ["missing owner/task are skipped", { meeting_title: "Ops", actions: [{ id: "C1", task: "", owner: "A" }, { id: "C2", task: "Call vendor", owner: "" }, { id: "C3", task: "Review", owner: "Lee", estimated_hours: 0.25 }] }],
  ["garbage", { actions: "nope" }],
  ["null", null],
];

describe("employee drafts template", () => {
  it.each(CANDS)("TS port matches the n8n template: %s", (_n, cand) => {
    expect(employeeDrafts(cand as never, "AR2-900", 2)).toEqual(n8nDrafts(cand as never, "AR2-900", 2));
  });

  it("groups by owner (case-insensitive), keeps every task, and never invents effort", () => {
    const d = employeeDrafts(CANDS[0]![1] as never, "AR2-900", 2);
    expect(d.map((x) => x.employee)).toEqual(["Maya Chen", "Dev Patel"]);
    expect(d[0]).toMatchObject({ subject: "Your action items: Project Atlas weekly sync", action_ids: ["A1", "A3"], action_count: 2 });
    expect(d[0]!.body).toContain("Hi Maya,");
    expect(d[0]!.body).toContain("- Book the demo room (no due date given)");
    expect(d[0]!.body).toContain("Estimated effort is known for 1 of 2 items (1 h so far).");
    expect(d[1]!.body).toContain("Total estimated effort: 4.5 h.");
    expect(d[1]!.body).toContain("Reference: AR2-900, version 2");
  });

  it("both n8n nodes embed the identical shared function", () => {
    expect(repo("n8n/status/build-job-result.js").startsWith(SHARED)).toBe(true);
    expect(repo("n8n/dispatch/3-authorize.js").startsWith(SHARED)).toBe(true);
  });
});

describe("Build Job Result returns employee_drafts from the stored reviewed version", () => {
  const JOB = "8c0a7199-ec8a-461d-9849-064eda2de1b2";
  const cand = CANDS[0]![1];
  const run = (verRows: unknown[]) => {
    const nodes: Record<string, unknown[]> = {
      "Validate Job Lookup": [{ job_id: JOB }],
      "Read Job Record": [{ job_id: JOB, case_id: "AR2-900", execution_status: "SUCCEEDED" }],
      "Read Job Case": [{ case_id: "AR2-900", latest_version: 1, readiness_status: "READY", readiness_json: JSON.stringify({ checked_version: 1 }), latest_subject: "S", latest_body: "B" }],
      "Read Job Versions": verRows,
    };
    const $ = (n: string) => ({ first: () => ({ json: (nodes[n] ?? [])[0] }), all: () => (nodes[n] ?? []).map((json) => ({ json })) });
    const out = (new Function("$", repo("n8n/status/build-job-result.js")) as (d: unknown) => { json: { response_body: Record<string, unknown> } }[])($);
    return out[0]!.json.response_body;
  };
  it("matches the template for the latest version", () => {
    const body = run([{ case_id: "AR2-900", version: 1, gate: "PASS", evaluated_candidate_json: JSON.stringify(cand) }]);
    expect(body.employee_drafts).toEqual(n8nDrafts(cand as never, "AR2-900", 1));
    // and the browser contract keeps it byte-exact
    expect(normalizeJob(body, "LIVE").employee_drafts).toEqual(body.employee_drafts);
  });
  it("is empty when no reviewed version exists", () => {
    expect(run([]).employee_drafts).toEqual([]);
  });
});

describe("demo cases", () => {
  it("get per-employee drafts labelled as a never-sent preview, never 'version null'", async () => {
    const { rebuildDemoBody, demoJobId } = await import("@/lib/demo");
    const id = demoJobId("within", new Date(Date.now() - 60_000), "America/Phoenix");
    const view = normalizeJob(rebuildDemoBody(id), "DEMO");
    expect(view.employee_drafts.length).toBeGreaterThan(0);
    for (const d of view.employee_drafts) {
      expect(d.body).not.toMatch(/version null/);
      expect(d.body).toMatch(/preview only, never sent\)$/);
    }
  });
});
