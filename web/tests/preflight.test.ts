// OFFLINE: pre-submit notes check (local heuristics; not AI verification).
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightNotes } from "@/lib/preflight";
import { SCENARIOS } from "@/lib/fixtures";

const period = { period_start: "2026-11-02", period_end: "2026-11-06" };
const COMPLETE = "Project Atlas weekly planning.\nMaya will prepare the customer-demo walkthrough by 6 November 2026, estimated 4 hours.";
const level = (r: ReturnType<typeof preflightNotes>, id: string) => r.items.find((i) => i.id === id)?.level;

afterEach(() => vi.unstubAllGlobals());

describe("preflightNotes (OFFLINE)", () => {
  it("1. empty notes → ERROR", () => {
    const r = preflightNotes({ notes: "   ", ...period });
    expect(level(r, "notes")).toBe("ERROR");
    expect(r.canSubmit).toBe(false);
  });

  it("2. missing planning period → ERROR", () => {
    for (const p of [{ period_start: "", period_end: "2026-11-06" }, { period_start: "2026-11-02", period_end: "" }]) {
      const r = preflightNotes({ notes: COMPLETE, ...p });
      expect(level(r, "period")).toBe("ERROR");
      expect(r.canSubmit).toBe(false);
    }
  });

  it("reversed, impossible or over-long periods → ERROR", () => {
    expect(preflightNotes({ notes: COMPLETE, period_start: "2026-11-06", period_end: "2026-11-02" }).canSubmit).toBe(false);
    expect(preflightNotes({ notes: COMPLETE, period_start: "2026-02-30", period_end: "2026-03-02" }).canSubmit).toBe(false);
    expect(preflightNotes({ notes: COMPLETE, period_start: "2026-11-01", period_end: "2026-12-31" }).canSubmit).toBe(false);
  });

  it("too-short notes → ERROR", () => expect(level(preflightNotes({ notes: "Maya will do it", ...period }), "length")).toBe("ERROR"));

  it("3. complete sample → no blocking error and no warnings", () => {
    const r = preflightNotes({ notes: COMPLETE, ...period });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.canSubmit).toBe(true);
    expect(level(r, "owner")).toBe("OK");
  });

  it("4. missing hours → WARNING", () => {
    const r = preflightNotes({ notes: "Project Atlas planning.\nMaya will prepare the walkthrough by 6 November 2026.", ...period });
    expect(level(r, "effort")).toBe("WARNING");
  });

  it("recognizes 4h, 2.5 hrs and 4 hours", () => {
    for (const est of ["4h", "2.5 hrs", "4 hours"]) {
      const r = preflightNotes({ notes: `Planning notes.\nMaya will prepare the walkthrough by Friday, ${est}.`, ...period });
      expect(level(r, "effort")).toBe("OK");
    }
  });

  it("5. missing obvious deadline → WARNING", () => {
    const r = preflightNotes({ notes: "Project Atlas planning.\nMaya will prepare the walkthrough, estimated 4 hours.", ...period });
    expect(level(r, "deadline")).toBe("WARNING");
  });

  it("flags only the action that lacks a deadline", () => {
    const r = preflightNotes({
      notes: "Planning.\nMaya will prepare the walkthrough by Friday, 4 hours.\nDev will review the deck, 2 hours.",
      ...period,
    });
    expect(r.items.find((i) => i.id === "deadline")?.label).toBe("One action may be missing a deadline");
  });

  it("no owner near an action → WARNING", () => {
    const r = preflightNotes({ notes: "Planning notes for the week.\nThe walkthrough will be prepared by Friday, 4 hours.", ...period });
    expect(level(r, "owner")).toBe("WARNING");
  });

  it("6. warnings alone do not block submission", () => {
    const r = preflightNotes({ notes: "We talked about the demo and the roadmap for a while today.", ...period });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.errors).toEqual([]);
    expect(r.canSubmit).toBe(true);
  });

  it("7. makes no network request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const s of SCENARIOS) preflightNotes({ notes: s.notes, period_start: s.period?.start ?? "", period_end: s.period?.end ?? "" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the headline overload example passes cleanly", () => {
    const s = SCENARIOS.find((x) => x.id === "overload")!;
    const r = preflightNotes({ notes: s.notes, period_start: s.period!.start, period_end: s.period!.end });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("is deterministic", () => {
    const a = preflightNotes({ notes: COMPLETE, ...period });
    expect(preflightNotes({ notes: COMPLETE, ...period })).toEqual(a);
  });
});
