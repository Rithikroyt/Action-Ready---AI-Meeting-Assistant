// OFFLINE tests: loading a synthetic example fills the real form values that the counter and pre-submit check read.
import { describe, expect, it } from "vitest";
import { exampleFormState, NOTES_PLACEHOLDER } from "@/lib/exampleForm";
import { preflightNotes } from "@/lib/preflight";
import { DEMO_TIMEZONE, SCENARIOS } from "@/lib/fixtures";

const atlas = SCENARIOS.find((s) => s.id === "overload")!;
const example = { notes: atlas.notes, period: atlas.period!, timezone: DEMO_TIMEZONE };
const labels = (r: ReturnType<typeof preflightNotes>) => r.errors.map((e) => e.label);

describe("Atlas synthetic example → form state", () => {
  const v = exampleFormState(example);

  it("populates the notes, period and timezone", () => {
    expect(v.notes).toContain("Project Atlas weekly planning.");
    expect(v.notes).toContain("Maya will prepare the customer-demo walkthrough");
    expect(v.notes.trim().length).toBeGreaterThan(0);
    expect(v.period_start).toBe("2026-11-02");
    expect(v.period_end).toBe("2026-11-06");
    expect(v.timezone).toBe("America/Phoenix");
  });

  it("passes the pre-submit check: no missing-notes or missing-period errors", () => {
    const r = preflightNotes({ notes: v.notes, period_start: v.period_start, period_end: v.period_end });
    expect(labels(r)).not.toContain("No notes provided");
    expect(labels(r).some((l) => /Planning period (start|end) is missing/.test(l))).toBe(false);
    expect(r.canSubmit).toBe(true);
  });

  it("is a pure mapping: loading an example makes no network call", () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.reject(new Error("no network expected"));
    }) as typeof fetch;
    try {
      exampleFormState(example);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toBe(0);
  });

  it("clearing the notes brings back the empty-state validation", () => {
    const r = preflightNotes({ notes: "", period_start: v.period_start, period_end: v.period_end });
    expect(labels(r)).toContain("No notes provided");
    expect(r.canSubmit).toBe(false);
    const p = preflightNotes({ notes: v.notes, period_start: "", period_end: "" });
    expect(labels(p)).toContain("Planning period start is missing");
  });

  it("the empty-box placeholder is a hint, not the Atlas example text", () => {
    expect(NOTES_PLACEHOLDER).not.toBe(atlas.notes);
    expect(NOTES_PLACEHOLDER).not.toContain("Project Atlas weekly planning");
    expect(NOTES_PLACEHOLDER).toMatch(/^Paste the complete meeting notes here/);
  });
});
