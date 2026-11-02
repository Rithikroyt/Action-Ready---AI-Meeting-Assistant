// OFFLINE tests of the deterministic readiness rules against synthetic fixtures.
import { describe, expect, it } from "vitest";
import { computeReadiness, resolveOwner, type ReadinessInput } from "@/lib/readiness";
import { DEMO_PROJECT_ID, FIXTURE_NOW, ROSTER, SCENARIOS, type Scenario } from "@/lib/fixtures";
import type { ToolEvidence } from "@/lib/contract";

const inputFor = (s: Scenario, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  project_id: DEMO_PROJECT_ID,
  period: s.period,
  now: FIXTURE_NOW,
  max_record_age_days: 14,
  max_rows_per_read: s.max_rows_per_read ?? 25,
  roster: s.roster ?? ROSTER,
  actions: s.actions,
  commitments: s.commitments,
  capacity: s.capacity,
  tool_calls: [],
  require_tool_evidence: false,
  ...over,
});

const byId = (id: string) => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error("missing scenario " + id);
  return s;
};

describe("fixture scenarios (OFFLINE)", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.expected.readiness}`, () => {
      const r = computeReadiness(inputFor(s));
      expect(r.operational_readiness).toBe(s.expected.readiness);
      const codes = r.issues.map((i) => i.code);
      for (const c of s.expected.codes) expect(codes).toContain(c);
      const w = r.workload.find((x) => x.owner_id === "maya");
      if (s.expected.projected_load !== undefined) expect(w?.projected_load ?? null).toBe(s.expected.projected_load);
      if (s.expected.margin !== undefined) expect(w?.capacity_margin ?? null).toBe(s.expected.margin);
    });
  }
});

describe("fixture integrity", () => {
  it("loadable examples have distinct notes (demo mode selects by notes)", () => {
    const notes = SCENARIOS.filter((s) => s.loadable).map((s) => s.notes.trim());
    expect(new Set(notes).size).toBe(notes.length);
  });
});

describe("headline overload", () => {
  it("computes 6 + 4 = 10 against 8 → 2 h shortfall, BLOCKED, with a clarification question", () => {
    const r = computeReadiness(inputFor(byId("overload")));
    const w = r.workload[0]!;
    expect(w).toMatchObject({ existing_open_hours: 6, new_proposed_hours: 4, projected_load: 10, available_hours: 8, capacity_margin: -2, status: "OVER_CAPACITY" });
    expect(w.existing_commitment_ids).toEqual(["CMT-ATLAS-0007"]); // completed CMT-ATLAS-0003 excluded
    expect(r.clarification_questions.join(" ")).toMatch(/Which commitment, estimate, or capacity record should change/);
    expect(r.clarification_questions.join(" ")).toMatch(/Nothing has been reassigned/);
  });

  it("never reports missing capacity as zero or unlimited", () => {
    const r = computeReadiness(inputFor(byId("missing-capacity")));
    expect(r.workload[0]!.available_hours).toBeNull();
    expect(r.workload[0]!.capacity_margin).toBeNull();
    expect(r.operational_readiness).not.toBe("READY");
  });
});

describe("tool evidence (LIVE rule)", () => {
  const s = byId("within");
  const call = (tool: string, ids: string[]): ToolEvidence => ({
    tool,
    args: { owner_id: "maya" },
    returned_ids: ids,
    result_count: ids.length,
    retrieved_at: FIXTURE_NOW,
    max_source_updated_at: null,
    outcome: ids.length ? "OK" : "EMPTY",
  });

  it("absent tool calls cannot produce READY", () => {
    const r = computeReadiness(inputFor(s, { require_tool_evidence: true }));
    expect(r.operational_readiness).toBe("UNKNOWN");
    expect(r.issues.map((i) => i.code)).toContain("TOOL_EVIDENCE_MISSING");
  });

  it("observed calls matching the independent read allow READY", () => {
    const r = computeReadiness(
      inputFor(s, { require_tool_evidence: true, tool_calls: [call("Commitment_Register", ["CMT-ATLAS-0007", "CMT-ATLAS-0003"]), call("Capacity_Lookup", ["CAP-ATLAS-maya-2026W45"])] }),
    );
    expect(r.operational_readiness).toBe("READY");
  });

  it("tool results that disagree with the independent read → CONTEXT_CHANGED", () => {
    const r = computeReadiness(
      inputFor(s, { require_tool_evidence: true, tool_calls: [call("Commitment_Register", ["CMT-ATLAS-0007"]), call("Capacity_Lookup", ["CAP-ATLAS-maya-2026W45"])] }),
    );
    expect(r.issues.map((i) => i.code)).toContain("CONTEXT_CHANGED");
    expect(r.operational_readiness).toBe("UNKNOWN");
  });

  it("a failed tool call is not evidence", () => {
    const failed = { ...call("Capacity_Lookup", []), outcome: "ERROR" as const };
    const r = computeReadiness(inputFor(s, { require_tool_evidence: true, tool_calls: [call("Commitment_Register", ["CMT-ATLAS-0007", "CMT-ATLAS-0003"]), failed] }));
    expect(r.operational_readiness).toBe("UNKNOWN");
  });

  it("demo waiver is reported, not hidden", () => {
    const r = computeReadiness(inputFor(s));
    expect(r.issues.map((i) => i.code)).toContain("TOOL_EVIDENCE_WAIVED");
  });
});

describe("guards", () => {
  it("injection text in a record does not change scope or result", () => {
    const r = computeReadiness(inputFor(byId("injection")));
    expect(r.operational_readiness).toBe("BLOCKED");
    expect(r.workload[0]!.projected_load).toBe(10);
  });

  it("a stable-ID restatement is not double-counted", () => {
    const r = computeReadiness(inputFor(byId("deadline-change")));
    expect(r.workload[0]!.projected_load).toBe(6);
    expect(r.workload[0]!.new_action_ids).toEqual([]);
  });

  it("a possible duplicate is counted (not silently removed) and flagged", () => {
    const r = computeReadiness(inputFor(byId("possible-duplicate")));
    expect(r.workload[0]!.new_action_ids).toEqual(["A1"]);
    expect(r.workload[0]!.projected_load).toBe(8);
  });

  it("missing period stops matching", () => {
    const r = computeReadiness(inputFor(byId("within"), { period: null }));
    expect(r.operational_readiness).toBe("UNKNOWN");
    expect(r.issues[0]!.code).toBe("PERIOD_MISSING");
  });

  it("no actions → UNKNOWN, not READY", () => {
    const r = computeReadiness(inputFor(byId("within"), { actions: [] }));
    expect(r.operational_readiness).toBe("UNKNOWN");
  });

  it("owner resolution", () => {
    expect(resolveOwner("maya", ROSTER)).toEqual({ owner_id: "maya" });
    expect(resolveOwner("Maya Chen", ROSTER)).toEqual({ owner_id: "maya" });
    expect(resolveOwner("Sam", ROSTER)).toEqual({ error: "UNRESOLVED" });
    expect(resolveOwner("Maya", [...ROSTER, { owner_id: "mo", names: ["Maya Ortiz"] }])).toEqual({ error: "AMBIGUOUS" });
  });
});
