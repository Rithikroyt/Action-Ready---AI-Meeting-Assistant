// Writes ../fixtures/*.csv and scenarios.json from src/lib/fixtures.ts (single source of truth).
// Run: npm run fixtures:export
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE_CAPACITY, BASE_COMMITMENTS, SCENARIOS } from "../src/lib/fixtures.ts";

const out = new URL("../../fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
const csv = (rows, cols) => {
  const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
};
writeFileSync(new URL("AR_Commitments.seed.csv", out), csv(BASE_COMMITMENTS, ["commitment_id", "project_id", "owner_id", "task", "due_text", "period_start", "period_end", "remaining_hours", "task_status", "confirmation_state", "source_ref", "updated_at", "data_provenance"]));
writeFileSync(new URL("AR_Capacity.seed.csv", out), csv(BASE_CAPACITY, ["capacity_id", "project_id", "owner_id", "period_start", "period_end", "available_hours", "capacity_basis", "source_ref", "updated_at", "data_provenance"]));
writeFileSync(
  new URL("scenarios.json", out),
  JSON.stringify(
    {
      provenance: "SYNTHETIC_DEMO — test specifications, not evidence that any test passed.",
      scenarios: SCENARIOS.map(({ id, title, summary, notes, period, actions, commitments, capacity, expected, roster, max_rows_per_read }) => ({
        id, title, summary, notes, period, roster, max_rows_per_read,
        synthetic_extraction: actions,
        commitment_read: commitments.status === "OK" ? { status: "OK", record_ids: commitments.rows.map((r) => r.commitment_id) } : { status: commitments.status },
        capacity_read: capacity.status === "OK" ? { status: "OK", record_ids: capacity.rows.map((r) => r.capacity_id) } : { status: capacity.status },
        expected,
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log("wrote fixtures/AR_Commitments.seed.csv, AR_Capacity.seed.csv, scenarios.json");
