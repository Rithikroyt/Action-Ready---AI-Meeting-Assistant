// OFFLINE tests: the Week 4 Coordinator routes official results to the next responsible role. No model calls.
import { describe, expect, it } from "vitest";
import { coordinate, reasonGroup, type RouteId } from "@/lib/coordinator";
import { normalizeJob, type ApprovalState, type Issue, type JobView, type Readiness, type ReviewState } from "@/lib/contract";
import { buildDemoBody } from "@/lib/demo";
import { DEMO_TIMEZONE, SCENARIOS } from "@/lib/fixtures";

const AT = new Date("2026-11-03T18:00:00.000Z");
const demoView = (id: string): JobView => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  const body = buildDemoBody(s, { request_id: "r", notes: s.notes, period_start: s.period!.start, period_end: s.period!.end, timezone: DEMO_TIMEZONE }, AT);
  return normalizeJob(body, "DEMO");
};
const issue = (code: string, severity: Issue["severity"] = "UNKNOWN", message = code): Issue => ({ code, severity, owner_id: "maya", message });
/** A live-shaped result built from a synthetic one, overriding only the recorded official fields. */
const live = (base: string, over: Partial<JobView> & { reviewState?: ReviewState; score?: number | null }): JobView => {
  const v = demoView(base);
  const { reviewState = "PASSED", score = 5, ...rest } = over;
  return { ...v, mode: "LIVE", case_id: "AR2-TEST", version: 1, review: { ...v.review, state: reviewState, score }, ...rest };
};

describe("synthetic scenarios (demo mode)", () => {
  const expected: Record<string, RouteId> = {
    overload: "MANAGER_REVIEW",
    "missing-capacity": "DATA_REVIEW",
    within: "DEMO_PREVIEW",
    "possible-duplicate": "CLARIFICATION",
    "deadline-change": "CLARIFICATION",
    "stale-capacity": "DATA_REVIEW",
  };
  for (const [id, route] of Object.entries(expected))
    it(`${id} → ${route}`, () => {
      expect(coordinate(demoView(id)).route.id).toBe(route);
    });
});

describe("recorded live results (routing over recorded evidence, not new AI runs)", () => {
  it("Test A / AR2-821: PASS + BLOCKED 6 + 4 vs 8 → Manager review, with the shortfall explained", () => {
    const v = live("overload", { operational_readiness: "BLOCKED", issues: [issue("CAPACITY_OVERLOAD", "BLOCKING", "Maya: 6 h existing + 4 h proposed = 10 h against 8 h")] });
    const r = coordinate(v);
    expect(r.route).toMatchObject({ id: "MANAGER_REVIEW", role: "Manager" });
    expect(r.why[0]).toBe("Maya's projected workload is 10 h against 8 h of recorded capacity — a shortfall of 2 h.");
    expect(r.evidence).toEqual(expect.arrayContaining([{ label: "Maya · existing work (commitment register)", value: "6 h" }, { label: "Maya · margin", value: "−2 h" }]));
    expect(r.not_done).toMatch(/No task assignment has been published and no email has been sent/);
    // The overload is the manager's decision, not a data gap (regression: CAPACITY_OVERLOAD once matched CAPACITY_*).
    expect(r.also).toEqual([]);
  });

  it("AR2-789: overload plus missing tool evidence → Manager review, technical review listed, no data review", () => {
    const v = live("overload", {
      operational_readiness: "BLOCKED",
      issues: [issue("CAPACITY_OVERLOAD", "BLOCKING"), issue("TOOL_EVIDENCE_MISSING"), issue("TOOL_EVIDENCE_MISSING")],
    });
    const r = coordinate(v);
    expect(r.route.id).toBe("MANAGER_REVIEW");
    expect(r.also.map((a) => a.route.id)).toEqual(["TECHNICAL_REVIEW"]);
  });

  it("blocking issues are always the manager's, whatever the code", () => {
    expect(reasonGroup("CAPACITY_OVERLOAD")).toBe("manager");
    expect(reasonGroup("CAPACITY_MISSING")).toBe("data");
    expect(reasonGroup("ANYTHING", "BLOCKING")).toBe("manager");
  });

  it("Test B / AR2-848: PASS + UNKNOWN CAPACITY_MISSING → Data steward; capacity shown as not verified, never 0", () => {
    const v = live("missing-capacity", { operational_readiness: "UNKNOWN", issues: [issue("CAPACITY_MISSING", "UNKNOWN", "No recorded capacity for maya. Missing capacity is not zero.")] });
    const r = coordinate(v);
    expect(r.route).toMatchObject({ id: "DATA_REVIEW", role: "Data steward" });
    expect(r.evidence).toContainEqual({ label: "Maya · recorded capacity", value: "Not verified" });
    expect(r.evidence.some((e) => /capacity/.test(e.label) && e.value === "0 h")).toBe(false);
  });

  it("AR2-837: missing capacity plus a failed tool call → Technical review first, data review still listed", () => {
    const v = live("missing-capacity", {
      operational_readiness: "UNKNOWN",
      issues: [issue("CAPACITY_MISSING"), issue("TOOL_CALL_FAILED", "UNKNOWN", "Capacity_Lookup call failed"), issue("TOOL_EVIDENCE_MISSING")],
    });
    const r = coordinate(v);
    expect(r.route.id).toBe("TECHNICAL_REVIEW");
    expect(r.also.map((a) => a.route.id)).toContain("DATA_REVIEW");
  });

  it("AR2-832: technical stop with readiness not checked → Technical review", () => {
    const v = live("overload", { reviewState: "TECHNICAL_STOP", score: null, operational_readiness: "NOT_CHECKED", issues: [], workload: [] });
    expect(coordinate(v).route.id).toBe("TECHNICAL_REVIEW");
  });
});

describe("routing rules", () => {
  const ready = (over: Partial<JobView> & { reviewState?: ReviewState; score?: number | null } = {}) => live("within", { operational_readiness: "READY", issues: [], ...over });

  it("PASS + READY → Approver", () => {
    expect(coordinate(ready()).route).toMatchObject({ id: "APPROVAL", role: "Approver" });
  });
  it("approved → Dispatcher, and states that nothing was dispatched", () => {
    const r = coordinate(ready({ approval_status: "APPROVED" }));
    expect(r.route.id).toBe("DISPATCH");
    expect(r.not_done).toMatch(/no task has been published and no email has been sent/);
  });
  it("rejected or changes requested → Requester revision", () => {
    expect(coordinate(ready({ approval_status: "REJECTED" })).route.id).toBe("REVISION");
    expect(coordinate(ready({ approval_status: "CHANGES_REQUESTED" })).route.id).toBe("REVISION");
  });
  it("needs clarification beats a READY result", () => {
    expect(coordinate(ready({ reviewState: "NEEDS_CLARIFICATION", score: null })).route.id).toBe("CLARIFICATION");
  });
  it("execution states: running → processing, failed or stale → technical review", () => {
    expect(coordinate(ready({ execution_status: "RUNNING" })).route.id).toBe("PROCESSING");
    expect(coordinate(ready({ execution_status: "FAILED" })).route.id).toBe("TECHNICAL_REVIEW");
    expect(coordinate(ready({ execution_status: "RUNNING", stale: true })).route.id).toBe("TECHNICAL_REVIEW");
  });
  it("an unrecognised reason code is never treated as resolved", () => {
    expect(reasonGroup("SOMETHING_NEW")).toBe("technical");
    expect(coordinate(ready({ operational_readiness: "UNKNOWN", issues: [issue("SOMETHING_NEW")] })).route.id).toBe("TECHNICAL_REVIEW");
  });
  it("notices alone do not change the route", () => {
    expect(coordinate(ready({ issues: [issue("INSTRUCTION_TEXT_IN_RECORD", "NOTICE")] })).route.id).toBe("APPROVAL");
  });

  it("only a passing review AND a READY result ever reach the Approver", () => {
    const reviews: ReviewState[] = ["PASSED", "NEEDS_CLARIFICATION", "REVISION_LIMIT", "TECHNICAL_STOP", "PENDING", "NOT_RUN"];
    const readiness: Readiness[] = ["READY", "BLOCKED", "UNKNOWN", "NOT_CHECKED"];
    const approvals: ApprovalState[] = ["NOT_REQUESTED", "PENDING", "UNKNOWN"];
    for (const rv of reviews)
      for (const rd of readiness)
        for (const ap of approvals) {
          const r = coordinate(live("within", { reviewState: rv, operational_readiness: rd, approval_status: ap, issues: rd === "BLOCKED" ? [issue("CAPACITY_OVERLOAD", "BLOCKING")] : [] }));
          if (r.route.id === "APPROVAL") expect([rv, rd]).toEqual(["PASSED", "READY"]);
          expect(r.not_done).toMatch(/no email has been sent/);
        }
  });
});
