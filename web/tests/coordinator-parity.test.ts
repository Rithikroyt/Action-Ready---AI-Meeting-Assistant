// OFFLINE parity: the n8n "Week 4 Coordinator" Code node (n8n/week4-coordinator.node.js) must route exactly like
// the reference lib/coordinator.ts. The node runs here with a mocked $input; no n8n, no model.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coordinate } from "@/lib/coordinator";
import type { Issue, JobView, ReviewState } from "@/lib/contract";

const NODE_CODE = readFileSync(fileURLToPath(new URL("../../n8n/week4-coordinator.node.js", import.meta.url)), "utf8");
type NodeItem = { json: Record<string, unknown> };
const runNode = (json: Record<string, unknown>) => (new Function("$input", NODE_CODE) as (i: unknown) => NodeItem[])({ first: () => ({ json }) })[0]!.json;

const GATE: Record<string, ReviewState> = { PASS: "PASSED", CLARIFY: "NEEDS_CLARIFICATION", STOP: "REVISION_LIMIT", TECHNICAL: "TECHNICAL_STOP" };
type N8nOwner = { owner_id: string; display_name: string; existing_hours: number | null; proposed_new_hours: number | null; projected_load: number | null; available_hours: number | null; capacity_margin: number | null };
const owner = (o: Partial<N8nOwner>): N8nOwner => ({ owner_id: "maya", display_name: "Maya", existing_hours: 6, proposed_new_hours: 4, projected_load: 10, available_hours: 8, capacity_margin: -2, ...o });

/** One recorded scenario expressed both as the n8n ORC output and as the website JobView. */
function both(gate: keyof typeof GATE, status: string, reasons: Issue[], owners = [owner({})]) {
  const n8nItem = { gate, version: 1, readiness: { status, reasons: reasons.map((r) => ({ ...r, severity: r.severity === "BLOCKING" ? "BLOCKED" : r.severity })), questions: [], owners }, history: [{ version: 1, readiness: { status } }] };
  const view = {
    mode: "LIVE", execution_status: "SUCCEEDED", stale: false, approval_status: "NOT_REQUESTED", actions: [{ action_id: "A1", owner: "Maya", owner_id: "maya" }],
    review: { state: GATE[gate], score: gate === "PASS" ? 5 : null },
    operational_readiness: status, clarification_questions: [], issues: reasons,
    workload: owners.map((o) => ({ owner_id: o.owner_id, owner_label: null, existing_open_hours: o.existing_hours, new_proposed_hours: o.proposed_new_hours, projected_load: o.projected_load, available_hours: o.available_hours, capacity_margin: o.capacity_margin })),
  } as unknown as JobView;
  return { n8nItem, view };
}
const iss = (code: string, severity: Issue["severity"] = "UNKNOWN"): Issue => ({ code, severity, owner_id: "maya", message: `${code} message` });

const CASES: [string, ReturnType<typeof both>][] = [
  ["Test A overload (AR2-821)", both("PASS", "BLOCKED", [iss("CAPACITY_OVERLOAD", "BLOCKING")])],
  ["Test B missing capacity (AR2-848)", both("PASS", "UNKNOWN", [iss("CAPACITY_MISSING")], [owner({ available_hours: null, capacity_margin: null })])],
  ["AR2-837 tool failure + missing capacity", both("PASS", "UNKNOWN", [iss("CAPACITY_MISSING"), iss("TOOL_CALL_FAILED"), iss("TOOL_EVIDENCE_MISSING")], [owner({ available_hours: null, capacity_margin: null })])],
  ["AR2-789 overload + missing tool evidence", both("PASS", "BLOCKED", [iss("CAPACITY_OVERLOAD", "BLOCKING"), iss("TOOL_EVIDENCE_MISSING")])],
  ["technical stop, not checked (AR2-832)", both("TECHNICAL", "NOT_CHECKED", [], [])],
  ["revision limit", both("STOP", "BLOCKED", [iss("CAPACITY_OVERLOAD", "BLOCKING")])],
  ["needs clarification", both("CLARIFY", "UNKNOWN", [iss("OWNER_AMBIGUOUS")])],
  ["clarification code with PASS", both("PASS", "UNKNOWN", [iss("PROPOSED_ESTIMATE_MISSING")])],
  ["stale capacity record", both("PASS", "UNKNOWN", [iss("CAPACITY_STALE")], [owner({ available_hours: 8, capacity_margin: null, projected_load: null })])],
  ["unrecognised code", both("PASS", "UNKNOWN", [iss("SOMETHING_NEW")])],
  ["ready for approval", both("PASS", "READY", [], [owner({ existing_hours: 6, proposed_new_hours: 1, projected_load: 7, available_hours: 8, capacity_margin: 1 })])],
  ["warnings alone", both("PASS", "READY", [{ ...iss("INSTRUCTION_TEXT_IN_RECORD"), severity: "NOTICE" }], [owner({ projected_load: 7, capacity_margin: 1, proposed_new_hours: 1 })])],
];

describe("n8n Coordinator node ↔ lib/coordinator.ts parity", () => {
  for (const [name, { n8nItem, view }] of CASES)
    it(name, () => {
      const out = runNode(n8nItem) as { routing: { route_id: string; role: string; why: string[]; also: { route_id: string }[] }; readiness: { routing: unknown }; history: { readiness: { routing: unknown } }[]; gate: string };
      const ref = coordinate(view);
      expect(out.routing.route_id).toBe(ref.route.id);
      expect(out.routing.role).toBe(ref.route.role);
      expect(out.routing.why[0]).toBe(ref.why[0]);
      expect(out.routing.also.map((a) => a.route_id)).toEqual(ref.also.map((a) => a.route.id));
      // Attached for persistence; the Week 3 gate field is untouched.
      expect(out.readiness.routing).toEqual(out.routing);
      expect(out.history.at(-1)!.readiness.routing).toEqual(out.routing);
      expect(out.gate).toBe(n8nItem.gate);
    });

  it("REVISE routes to processing (a new version is coming), and missing readiness never crashes", () => {
    expect((runNode({ gate: "REVISE", readiness: { status: "BLOCKED", reasons: [] } }).routing as { route_id: string }).route_id).toBe("PROCESSING");
    expect((runNode({ gate: "PASS" }).routing as { route_id: string }).route_id).toBe("TECHNICAL_REVIEW");
  });
});
