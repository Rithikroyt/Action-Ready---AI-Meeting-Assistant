// OFFLINE: what-if simulation (local, non-mutating, hypothetical).
import { afterEach, describe, expect, it, vi } from "vitest";
import { officialInputs, simulate, suggestions } from "@/lib/whatif";
import { normalizeJob, type OwnerWorkload } from "@/lib/contract";
import { buildDemoBody } from "@/lib/demo";
import { SCENARIOS } from "@/lib/fixtures";

const official = (): OwnerWorkload => ({
  owner_id: "maya",
  owner_label: "Maya",
  existing_open_hours: 6,
  existing_commitment_ids: ["CMT-ATLAS-0007"],
  new_proposed_hours: 4,
  new_action_ids: ["A1"],
  projected_load: 10,
  available_hours: 8,
  capacity_id: "CAP-ATLAS-maya-2026W45",
  capacity_margin: -2,
  status: "OVER_CAPACITY",
});
const base = { existing_hours: 6, new_hours: 4, capacity_hours: 8 };

afterEach(() => vi.unstubAllGlobals());

describe("simulate (OFFLINE)", () => {
  it("8. 6 + 4 vs 8 → BLOCKED, margin −2", () => {
    expect(simulate(official(), base)).toMatchObject({ readiness: "BLOCKED", projected_hours: 10, margin_hours: -2 });
  });
  it("9. 6 + 2 vs 8 → READY, margin 0", () => {
    expect(simulate(official(), { ...base, new_hours: 2 })).toMatchObject({ readiness: "READY", projected_hours: 8, margin_hours: 0 });
  });
  it("10. 6 + 4 vs 10 → READY, margin 0", () => {
    expect(simulate(official(), { ...base, capacity_hours: 10 })).toMatchObject({ readiness: "READY", projected_hours: 10, margin_hours: 0 });
  });
  it("11. missing capacity → UNKNOWN", () => {
    const r = simulate(official(), { existing_hours: 6, new_hours: 4 });
    expect(r).toMatchObject({ readiness: "UNKNOWN", projected_hours: null, margin_hours: null });
    expect(officialInputs({ ...official(), available_hours: null })).toBeNull();
  });
  it("12. negative or non-numeric input → UNKNOWN with a reason", () => {
    expect(simulate(official(), { ...base, new_hours: -1 })).toMatchObject({ readiness: "UNKNOWN", invalid: "New work cannot be negative." });
    expect(simulate(official(), { ...base, capacity_hours: Number.NaN }).readiness).toBe("UNKNOWN");
    expect(simulate(official(), { ...base, capacity_hours: Number.POSITIVE_INFINITY }).readiness).toBe("UNKNOWN");
  });
  it("13. never mutates the official workload object", () => {
    const o = official();
    const snapshot = structuredClone(o);
    Object.freeze(o);
    Object.freeze(o.existing_commitment_ids);
    const r = simulate(o, { ...base, new_hours: 2 });
    expect(o).toEqual(snapshot);
    expect(r.workload).not.toBe(o);
    expect(r.workload?.existing_commitment_ids).not.toBe(o.existing_commitment_ids);
  });
  it("14. makes no network request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (let h = 0; h <= 12; h += 0.5) simulate(official(), { ...base, new_hours: h });
    suggestions(base);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("15. reset values are the official numbers", () => {
    expect(officialInputs(official())).toEqual(base);
  });
  it("suggests the smallest single change that removes the overload", () => {
    expect(suggestions(base).map((s) => s.inputs)).toEqual([
      { ...base, new_hours: 2 },
      { ...base, capacity_hours: 10 },
    ]);
    expect(suggestions({ ...base, new_hours: 1 })).toEqual([]);
  });
});

describe("demo mode (OFFLINE)", () => {
  it("16. official demo result stays BLOCKED after simulated READY results", () => {
    const s = SCENARIOS.find((x) => x.id === "overload")!;
    const job = normalizeJob(
      buildDemoBody(s, { request_id: crypto.randomUUID(), notes: s.notes, period_start: s.period!.start, period_end: s.period!.end, timezone: "America/Phoenix" }),
      "DEMO",
    );
    const before = structuredClone(job);
    const w = job.workload[0]!;
    const start = officialInputs(w)!;
    expect(start).toEqual(base);
    expect(simulate(w, { ...start, new_hours: 2 }).readiness).toBe("READY");
    expect(simulate(w, { ...start, capacity_hours: 10 }).readiness).toBe("READY");
    expect(job.operational_readiness).toBe("BLOCKED");
    expect(job).toEqual(before);
  });
});
