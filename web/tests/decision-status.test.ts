// OFFLINE: central status definitions, decision derivation, and overview list logic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeJob, type JobView } from "@/lib/contract";
import { APPROVAL, approvalStatus, executionStatus, officialScore, readinessStatus, reviewInvalidated, reviewStatus } from "@/lib/status";
import { deriveDecision, ownerName } from "@/lib/decision";
import { countBy, matchesFilter, matchesQuery, sortCases, toCaseRow, type CaseRow } from "@/lib/caseList";
import { buildDemoBody } from "@/lib/demo";
import { SCENARIOS } from "@/lib/fixtures";

const live = (over: Record<string, unknown> = {}) =>
  normalizeJob(
    {
      job_id: "0c6f2f0e-1d2b-4c3a-9e8f-1234567890ab",
      case_id: "AR2-1",
      execution_status: "SUCCEEDED",
      timestamps: { accepted_at: "2026-11-02T18:00:00.000Z", completed_at: "2026-11-02T18:00:40.000Z", updated_at: "2026-11-02T18:00:40.000Z" },
      ai_review: { status: "AI_REVIEWED_NOT_HUMAN_APPROVED", gate: "PASS", score: 5, version: 1 },
      operational_readiness: {
        status: "BLOCKED",
        reasons: [{ severity: "BLOCKED", code: "CAPACITY_OVERLOAD", owner_id: "maya", message: "Maya: 6 h + 4 h = 10 h vs 8 h." }],
        questions: ["Decision needed for Maya: change a task, estimate, timing, or the capacity record?"],
      },
      human_approval: { status: "NOT_REQUESTED" },
      actions: [{ id: "A1", task: "prepare the customer-demo walkthrough", owner: "Maya", due_text: "by 6 November 2026", estimated_hours: 4 }],
      workload_by_owner: [{ owner_id: "maya", existing_hours: 6, new_hours: 4, projected_hours: 10, capacity_hours: 8, margin_hours: -2 }],
      ...over,
    },
    "LIVE",
  );

const demo = (id: string): JobView => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  return normalizeJob(
    buildDemoBody(s, { request_id: crypto.randomUUID(), notes: s.notes, period_start: s.period!.start, period_end: s.period!.end, timezone: "America/Phoenix" }),
    "DEMO",
  );
};

afterEach(() => vi.unstubAllGlobals());

describe("status definitions (OFFLINE)", () => {
  it("four families stay separate for PASS + BLOCKED + NOT_REQUESTED", () => {
    const v = live();
    expect(executionStatus(v).key).toBe("SUCCEEDED");
    expect(reviewStatus(v)).toMatchObject({ key: "PASS", family: "AI review" });
    expect(readinessStatus(v.operational_readiness)).toMatchObject({ key: "BLOCKED", family: "Operational readiness", tone: "blocked" });
    expect(approvalStatus(v)).toMatchObject({ key: "NOT_REQUESTED", family: "Human approval" });
  });
  it("every status has a label, icon, description and screen-reader phrase", () => {
    for (const d of [executionStatus(live()), reviewStatus(live()), readinessStatus("UNKNOWN"), approvalStatus(live())]) {
      expect(d.label && d.icon && d.description).toBeTruthy();
      expect(d.sr).toBe(`${d.family}: ${d.label}`);
    }
  });
  it("cached legacy approval values still map safely", () => {
    expect(approvalStatus({ approval_status: "NOT_GIVEN" as never })).toBe(APPROVAL.NOT_REQUESTED);
    expect(approvalStatus({ approval_status: "REQUESTED" as never })).toBe(APPROVAL.PENDING);
    expect(approvalStatus({ approval_status: "SOMETHING_ELSE" as never })).toBe(APPROVAL.UNKNOWN);
  });
  it("approval lifecycle values from n8n are recognised", () => {
    const a = (s: string) => live({ human_approval: { status: s } }).approval_status;
    expect([a("PENDING_APPROVAL"), a("APPROVED"), a("CHANGES_REQUESTED"), a("REJECTED"), a("EXPIRED"), a("APPROVED_DRAFT_CREATED")]).toEqual([
      "PENDING",
      "APPROVED",
      "CHANGES_REQUESTED",
      "REJECTED",
      "EXPIRED",
      "DRAFT_CREATED",
    ]);
  });
  it("stale execution is its own state, not success", () => {
    expect(executionStatus({ execution_status: "RUNNING", stale: true }).key).toBe("STALE");
  });
  it("an invalidated review exposes no official score", () => {
    const tech = live({ ai_review: { status: "TECHNICAL_REVIEW", gate: "TECHNICAL", score: 4.6, version: 2 } });
    expect(reviewStatus(tech).key).toBe("TECHNICAL_REVIEW");
    expect(reviewInvalidated(tech)).toBe(true);
    expect(officialScore(tech)).toBeNull();
    expect(officialScore(live())).toBe(5);
  });
});

describe("decision derivation (OFFLINE)", () => {
  it("BLOCKED: plain-language workload sentence and decision question", () => {
    const d = deriveDecision(live());
    expect(d.primary).toMatchObject({ kind: "BLOCKED", title: "Action required" });
    expect(d.primary.summary).toBe(
      "Maya has 6 h of existing confirmed work and 4 h of new proposed work against 8 h of recorded capacity. The plan exceeds capacity by 2 h.",
    );
    expect(d.primary.question).toBe("Which commitment, estimate, deadline or capacity record should change?");
    expect(d.secondary).toBeNull();
  });
  it("uses the display name from the case's actions, not the roster ID", () => {
    expect(ownerName(live(), "maya")).toBe("Maya");
    expect(ownerName(live({ actions: [] }), "maya")).toBe("maya");
  });
  it("UNKNOWN missing capacity: never assumes availability", () => {
    const d = deriveDecision(demo("missing-capacity"));
    expect(d.primary).toMatchObject({ kind: "UNKNOWN", title: "Capacity could not be verified" });
    expect(d.primary.summary).toContain("Existing commitments were retrieved");
    expect(d.primary.summary).toContain("will not assume availability");
  });
  it("READY says approval is still separate", () => {
    const d = deriveDecision(demo("within"));
    expect(d.primary.kind).toBe("READY");
    expect(d.primary.summary).toContain("Human approval is still a separate step");
  });
  it("TECHNICAL review leads, and readiness stays visible as its own decision", () => {
    const d = deriveDecision(live({ ai_review: { status: "TECHNICAL_REVIEW", gate: "TECHNICAL", score: null, version: 2 } }));
    expect(d.primary).toMatchObject({ kind: "TECHNICAL", title: "AI review requires technical attention" });
    expect(d.primary.summary).toContain("Nothing has been approved or sent");
    expect(d.secondary?.kind).toBe("BLOCKED");
  });
  it("FAILED and STALE never read as success", () => {
    expect(deriveDecision(live({ execution_status: "FAILED", error: { code: "PERSISTENCE_FAILED", message: "Not saved." } })).primary.kind).toBe("FAILED");
    expect(deriveDecision(live({ execution_status: "UNKNOWN", stale: true })).primary.kind).toBe("STALE");
  });
  it("NOT_CHECKED legacy result makes no readiness claim", () => {
    expect(deriveDecision(live({ operational_readiness: undefined })).primary.kind).toBe("NOT_CHECKED");
  });
  it("deriving a decision never mutates the official result", () => {
    const v = live();
    const before = structuredClone(v);
    deriveDecision(v);
    expect(v).toEqual(before);
  });
});

describe("overview list (OFFLINE)", () => {
  const row = (view: JobView, extra: Partial<CaseRow> = {}): CaseRow => ({
    ...toCaseRow({ job_id: view.job_id || crypto.randomUUID(), mode: view.mode, submitted_at: "2026-11-02T18:00:00.000Z", period: null, view, refresh_error: null }),
    ...extra,
  });
  const rows = [
    row(live(), { title: "Atlas blocked", updated_at: "2026-11-02T18:00:00Z" }),
    row(demo("within"), { title: "Atlas ready", updated_at: "2026-11-02T19:00:00Z" }),
    row(demo("missing-capacity"), { title: "Atlas unknown", updated_at: "2026-11-02T17:00:00Z" }),
    row(live({ ai_review: { status: "TECHNICAL_REVIEW", gate: "TECHNICAL" } }), { title: "Atlas technical", updated_at: "2026-11-02T16:00:00Z" }),
    row(live({ execution_status: "RUNNING", operational_readiness: undefined, timestamps: { updated_at: new Date().toISOString() } }), { title: "Atlas running", updated_at: "2026-11-02T20:00:00Z" }),
  ];

  it("filters by official readiness, review and execution", () => {
    const titles = (f: Parameters<typeof matchesFilter>[1]) => rows.filter((r) => matchesFilter(r, f)).map((r) => r.title);
    expect(titles("BLOCKED")).toEqual(["Atlas blocked", "Atlas technical"]);
    expect(titles("READY")).toEqual(["Atlas ready"]);
    expect(titles("UNKNOWN")).toEqual(["Atlas unknown"]);
    expect(titles("TECHNICAL_REVIEW")).toEqual(["Atlas technical"]);
    expect(titles("IN_PROGRESS")).toEqual(["Atlas running"]);
    expect(titles("AWAITING_APPROVAL")).toEqual([]);
  });
  it("a running case carries no readiness or reason yet", () => {
    const r = rows[4]!;
    expect(r.readiness).toBe("NOT_CHECKED");
    expect(r.reason).toBeNull();
  });
  it("search matches title, case ID and reason", () => {
    expect(rows.filter((r) => matchesQuery(r, "capacity could not")).map((r) => r.title)).toEqual(["Atlas unknown"]);
    expect(rows.filter((r) => matchesQuery(r, "  ")).length).toBe(rows.length);
  });
  it("attention sort puts blocked/technical work first; updated sort is newest first", () => {
    expect(sortCases(rows, "attention").map((r) => r.title).slice(0, 2)).toEqual(["Atlas blocked", "Atlas technical"]);
    expect(sortCases(rows, "updated")[0]!.title).toBe("Atlas running");
  });
  it("counts come only from listed cases", () => {
    expect(countBy(rows)).toEqual({ cases: 5, ready: 1, blocked: 2, unknown: 1, inProgress: 1, awaiting: 0 });
  });
  it("list logic makes no network request", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    sortCases(rows.filter((r) => matchesFilter(r, "ALL") && matchesQuery(r, "atlas")), "attention");
    expect(f).not.toHaveBeenCalled();
  });
});
