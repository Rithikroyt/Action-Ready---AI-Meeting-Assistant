// OFFLINE: normalizeJob() against the ACTUAL shape produced by the n8n "Build Job Result" node
// (workflow KTQmpWghSB2jid1T, audited 2026-11-02). Synthetic values; no n8n call.
import { describe, expect, it, vi } from "vitest";
import { normalizeJob } from "@/lib/contract";
import { officialInputs, simulate } from "@/lib/whatif";

const JOB = "0c6f2f0e-1d2b-4c3a-9e8f-1234567890ab";
const NOTE = "during reviewer run, this execution (exact timestamp not exposed by the agent trace)";
const QUOTE = "Maya will prepare the customer-demo walkthrough by 6 November 2026, estimated 4 hours.";

const record = (tool: string, ids: string[]) => ({
  source_type: "DATA_TABLE_LOOKUP",
  tool_name: tool,
  project_id: "DEMO_ATLAS",
  owner_id: "maya",
  period_start: "2026-11-02",
  period_end: "2026-11-06",
  record_ids: ids,
  record_count: ids.length,
  retrieved_at: NOTE,
  updated_at: ids.length ? "2026-10-30T16:00:00.000Z" : null,
  success: true,
});

function liveBody(kind: "BLOCKED" | "UNKNOWN") {
  const blocked = kind === "BLOCKED";
  const wl = { owner_id: "maya", existing_hours: 6, new_hours: 4, projected_hours: 10, capacity_hours: blocked ? 8 : null, margin_hours: blocked ? -2 : null };
  return {
    schema_version: "1",
    job_id: JOB,
    case_id: "AR2-501",
    execution_status: "SUCCEEDED",
    stale: false,
    stored_execution_status: "SUCCEEDED",
    timestamps: {
      accepted_at: "2026-11-02T18:00:00.000Z",
      started_at: "2026-11-02T18:00:01.000Z",
      completed_at: "2026-11-02T18:00:40.000Z",
      updated_at: "2026-11-02T18:00:40.000Z",
      case_updated_at: "2026-11-02T18:00:39.000Z",
    },
    error: null,
    result_available: true,
    result_note: null,
    ai_review: { status: "AI_REVIEWED_NOT_HUMAN_APPROVED", gate: "PASS", score: 4.8, version: 1 },
    operational_readiness: {
      status: kind,
      reasons: blocked
        ? [
            { severity: "BLOCKED", code: "CAPACITY_OVERLOAD", owner_id: "maya", message: "Maya: 6 h existing + 4 h proposed = 10 h against 8 h recorded capacity; margin -2 h." },
            { severity: "WARNING", code: "INSTRUCTION_TEXT_IN_RECORD", owner_id: null, message: "Record(s) CMT-ATLAS-0007 contain instruction-like text." },
          ]
        : [{ severity: "UNKNOWN", code: "CAPACITY_MISSING", owner_id: "maya", message: "No recorded capacity for maya in 2026-11-02 to 2026-11-06. Missing capacity is not zero." }],
      questions: blocked
        ? ["Decision needed for Maya: change a task, estimate, timing, or the capacity record? Rewriting the email will not resolve this."]
        : ["Please record Maya's project-allocated capacity for 2026-11-02 to 2026-11-06."],
      checked_version: 1,
      data_kind: "SYNTHETIC_DEMO",
    },
    human_approval: { status: "NOT_REQUESTED" },
    external_actions: { status: "DISABLED_DEV_PHASE" },
    actions: [{ id: "A1", task: "Prepare the customer-demo walkthrough", owner: "Maya", due_text: "by 6 November 2026", estimated_hours: 4 }],
    draft: { subject: "Project Atlas — customer-demo walkthrough", body: "Hi team, ..." },
    workload: wl,
    workload_by_owner: [wl],
    evidence: {
      actions: [{ action_id: "A1", source_type: "MEETING_NOTES_EXCERPT", source_quote: QUOTE }],
      business_records: [record("Commitment_Register", ["CMT-ATLAS-0007"]), record("Capacity_Lookup", blocked ? ["CAP-ATLAS-maya-2026W45"] : [])],
    },
    review_history: [{ version: 1, gate: "PASS", score: 4.8, created_at: "2026-11-02T18:00:35.000Z" }],
  };
}

describe("live n8n response shape (OFFLINE)", () => {
  it("1. nested operational_readiness.status BLOCKED → BLOCKED (not NOT_CHECKED)", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.operational_readiness).toBe("BLOCKED");
    expect(v.execution_status).toBe("SUCCEEDED");
  });

  it("2. missing capacity → capacity and margin stay null, readiness UNKNOWN", () => {
    const v = normalizeJob(liveBody("UNKNOWN"), "LIVE");
    expect(v.operational_readiness).toBe("UNKNOWN");
    expect(v.workload[0]).toMatchObject({ existing_open_hours: 6, new_proposed_hours: 4, projected_load: 10, available_hours: null, capacity_margin: null, status: "UNKNOWN" });
    expect(officialInputs(v.workload[0]!)).toBeNull(); // what-if will not invent a capacity
  });

  it("3. workload 6 + 4 = 10 vs 8 → margin −2, OVER_CAPACITY", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.workload).toHaveLength(1);
    expect(v.workload[0]).toMatchObject({ owner_id: "maya", existing_open_hours: 6, new_proposed_hours: 4, projected_load: 10, available_hours: 8, capacity_margin: -2, status: "OVER_CAPACITY" });
  });

  it("single workload object is used when workload_by_owner is absent", () => {
    const body = liveBody("BLOCKED") as Record<string, unknown>;
    delete body.workload_by_owner;
    expect(normalizeJob(body, "LIVE").workload[0]).toMatchObject({ projected_load: 10, capacity_margin: -2 });
  });

  it("in-flight job: all-null workload object yields no workload rows and NOT_CHECKED", () => {
    const v = normalizeJob(
      {
        job_id: JOB,
        execution_status: "RUNNING",
        operational_readiness: { status: null, reasons: [], questions: [] },
        workload: { owner_id: null, existing_hours: null, new_hours: null, projected_hours: null, capacity_hours: null, margin_hours: null },
        timestamps: { accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      },
      "LIVE",
    );
    expect(v.workload).toEqual([]);
    expect(v.operational_readiness).toBe("NOT_CHECKED");
  });

  it("4. ai_review → review state PASSED, score 4.8, version 1", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.review).toMatchObject({ state: "PASSED", raw_status: "AI_REVIEWED_NOT_HUMAN_APPROVED", score: 4.8 });
    expect(v.version).toBe(1);
  });

  it("5. human_approval NOT_REQUESTED → NOT_GIVEN; external action not permitted", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.approval_status).toBe("NOT_GIVEN");
    expect(v.external_action).toBe("NOT_PERMITTED");
  });

  it("6. nested reasons become issues; BLOCKED → BLOCKING, WARNING → NOTICE", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.issues).toEqual([
      expect.objectContaining({ code: "CAPACITY_OVERLOAD", severity: "BLOCKING", owner_id: "maya" }),
      expect.objectContaining({ code: "INSTRUCTION_TEXT_IN_RECORD", severity: "NOTICE" }),
    ]);
    expect(normalizeJob(liveBody("UNKNOWN"), "LIVE").issues[0]).toMatchObject({ code: "CAPACITY_MISSING", severity: "UNKNOWN" });
  });

  it("7. nested questions become clarification_questions", () => {
    expect(normalizeJob(liveBody("BLOCKED"), "LIVE").clarification_questions).toEqual([
      "Decision needed for Maya: change a task, estimate, timing, or the capacity record? Rewriting the email will not resolve this.",
    ]);
  });

  it("8. evidence.business_records → tool_evidence; descriptive retrieval text is not a timestamp", () => {
    const v = normalizeJob(liveBody("UNKNOWN"), "LIVE");
    expect(v.tool_evidence).toEqual([
      {
        tool: "Commitment_Register",
        args: { owner_id: "maya", period_start: "2026-11-02", period_end: "2026-11-06" },
        returned_ids: ["CMT-ATLAS-0007"],
        result_count: 1,
        retrieved_at: null,
        max_source_updated_at: "2026-10-30T16:00:00.000Z",
        outcome: "OK",
        retrieved_note: NOTE,
      },
      expect.objectContaining({ tool: "Capacity_Lookup", returned_ids: [], result_count: 0, outcome: "EMPTY", retrieved_at: null, max_source_updated_at: null }),
    ]);
  });

  it("failed tool record → ERROR; arguments n8n did not report are not invented", () => {
    const body = liveBody("UNKNOWN");
    body.evidence.business_records = [{ tool_name: "Capacity_Lookup", record_ids: [], record_count: null, success: false } as never];
    const t = normalizeJob(body, "LIVE").tool_evidence[0]!;
    expect(t).toMatchObject({ outcome: "ERROR", args: {}, result_count: null, retrieved_at: null, retrieved_note: null });
  });

  it("record IDs become id-only records with every other field null", () => {
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    expect(v.records).toEqual([
      { kind: "commitment", id: "CMT-ATLAS-0007", owner_id: "maya", label: null, hours: null, status: null, due_text: null, updated_at: null, provenance: null, id_only: true },
      { kind: "capacity", id: "CAP-ATLAS-maya-2026W45", owner_id: "maya", label: null, hours: null, status: null, due_text: null, updated_at: null, provenance: null, id_only: true },
    ]);
  });

  it("9. evidence.actions source_quote attaches to the matching action without mutating input", () => {
    const body = liveBody("BLOCKED");
    const before = structuredClone(body);
    const v = normalizeJob(body, "LIVE");
    expect(v.actions[0]).toMatchObject({ action_id: "A1", owner: "Maya", estimated_hours: 4, source_quote: QUOTE });
    expect(body).toEqual(before);
    // an excerpt for a different action is never attached
    const other = liveBody("BLOCKED");
    other.evidence.actions = [{ action_id: "A9", source_type: "MEETING_NOTES_EXCERPT", source_quote: "x y z" }];
    expect(normalizeJob(other, "LIVE").actions[0]!.source_quote).toBeNull();
  });

  it("null semantics: unknown numbers never become 0", () => {
    const body = liveBody("UNKNOWN");
    body.ai_review.score = null as never;
    const v = normalizeJob(body, "LIVE");
    expect(v.review.score).toBeNull();
    const w = v.workload[0]!;
    expect([w.available_hours, w.capacity_margin]).toEqual([null, null]);
    expect(JSON.stringify(w)).not.toContain('"available_hours":0');
  });

  it("n8n stale flag is honoured", () => {
    const v = normalizeJob({ job_id: JOB, execution_status: "UNKNOWN", stale: true }, "LIVE");
    expect(v.stale).toBe(true);
  });

  it("what-if works on the live BLOCKED shape without changing it", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const v = normalizeJob(liveBody("BLOCKED"), "LIVE");
    const before = structuredClone(v);
    const start = officialInputs(v.workload[0]!)!;
    expect(start).toEqual({ existing_hours: 6, new_hours: 4, capacity_hours: 8 });
    expect(simulate(v.workload[0]!, { ...start, new_hours: 2 }).readiness).toBe("READY");
    expect(v).toEqual(before);
    expect(v.operational_readiness).toBe("BLOCKED");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
