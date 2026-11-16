// Every number and claim in the Week 5 presentation script, checked against evidence.
// Numbers are recomputed with the same aggregate() n8n runs, from the 36 REAL stored Gemini runs exported
// read-only to submission/week5/live-results.json. Product claims are checked against the code that enforces them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agentProfile, aggregate, parseModelOutput, PRODUCTS, readability, recommendations, type RunRow } from "@/lib/visibility/core";
import { extractNotesFile } from "@/lib/notesFile";

const snap = JSON.parse(readFileSync(fileURLToPath(new URL("../../submission/week5/live-results.json", import.meta.url)), "utf8")) as {
  experiments: { experiment_id: string; kind: string }[];
  runs: RunRow[];
};
const cold = snap.runs.filter((r) => r.context === "COLD");
const ctx = snap.runs.filter((r) => r.context !== "COLD");
const mCold = aggregate(cold);
const m = aggregate(ctx);
const kn = (r: { k: number; n: number } | null | undefined) => (r ? `${r.k}/${r.n}` : "null");

describe("Week 5 script — every claim backed by the stored live runs", () => {
  it('"I ran Gemini 36 times" — 36 stored runs, one model, no others', () => {
    expect(snap.runs).toHaveLength(36);
    expect(new Set(snap.runs.map((r) => r.model_id))).toEqual(new Set(["gemini-3.5-flash"]));
    expect(cold).toHaveLength(6);
    expect(ctx).toHaveLength(30);
  });

  it('"asked with no information, it mentioned ActionReady 0 out of 6 times"', () => {
    expect(mCold.totals.valid).toBe(6);
    expect(kn(mCold.cold?.appearance)).toBe("0/6");
  });

  it('"ActionReady appeared 11 out of 11, recommended 9 out of 11" (P08 excluded, copy pages)', () => {
    const s = m.contexts.COPY!;
    expect(kn(s.appearance)).toBe("11/11");
    expect(kn(s.shortlist)).toBe("11/11");
    expect(kn(s.recommendation)).toBe("9/11");
    expect(kn(s.top_position)).toBe("9/11");
  });

  it('"every claim it made about ActionReady was correct" — 121/121, no run with an unsupported claim', () => {
    const s = m.contexts.COPY!;
    expect(kn(s.capability_accuracy)).toBe("121/121");
    expect(kn(s.unsupported_claims)).toBe("0/11");
    // and across every valid context run, including the one structured run
    expect(ctx.filter((r) => r.parse_success && r.ar_unsupported).length).toBe(0);
  });

  it('"on a general question it won 1 of 3, when asked about workload or approval it won 8 of 8"', () => {
    const seg = m.by_segment.COPY!;
    expect(kn(seg.OPEN?.recommendation)).toBe("1/3");
    const k = (seg.CONSTRAINED?.recommendation.k ?? 0) + (seg.DELEGATED?.recommendation.k ?? 0);
    const n = (seg.CONSTRAINED?.recommendation.n ?? 0) + (seg.DELEGATED?.recommendation.n ?? 0);
    expect(`${k}/${n}`).toBe("8/8");
  });

  it('"the AI correctly said no to ActionReady, 4 out of 4 times" (P08: Zoom + transcription + auto-send)', () => {
    expect(kn(m.negative.COPY)).toBe("2/2");
    expect(kn(m.negative.STRUCTURED)).toBe("2/2");
    const p08 = ctx.filter((r) => r.prompt_id === "P08" && r.parse_success);
    expect(p08).toHaveLength(4);
    expect(p08.every((r) => r.ar_recommended === false)).toBe(true);
  });

  it('"Gemini\'s free tier blocked 13 of my 30 calls, so the structured result is inconclusive"', () => {
    expect(m.totals.errors).toEqual({ PROVIDER_ERROR: 13, NO_RECOMMEND: 1 });
    expect(m.totals.valid).toBe(16);
    const structuredValid = ctx.filter((r) => r.context === "STRUCTURED" && r.parse_success && r.prompt_id !== "P08").length;
    expect(structuredValid).toBe(1);
    expect(structuredValid).toBeLessThan(10); // minimum per side for a before/after claim
    const recs = recommendations({ ...m, cold: mCold.cold }, readability(agentProfile())).map((r) => r.id);
    expect(recs).toContain("before_after_insufficient");
  });

  it('"I kept the failures" — failed runs are stored, not retried or dropped', () => {
    expect(ctx.filter((r) => r.parse_error === "PROVIDER_ERROR")).toHaveLength(13);
    expect(new Set(snap.runs.map((r) => r.run_key)).size).toBe(36); // no duplicate retries
  });

  it('"Code, not the AI, scores every answer" — scoring is deterministic: same raw answer, same coding', () => {
    const raw = ctx.find((r) => r.parse_success)!.raw_output as string;
    const a = parseModelOutput(raw, ctx.find((r) => r.parse_success)!.prompt_id);
    const b = parseModelOutput(raw, ctx.find((r) => r.parse_success)!.prompt_id);
    expect(a).toEqual(b);
    expect(a.parse_success).toBe(true);
  });

  it('"three made-up competitors" — Tool A/B/C are labelled synthetic', () => {
    const synth = PRODUCTS.filter((p) => p.id !== "actionready");
    expect(synth.map((p) => p.name)).toEqual(["Tool A", "Tool B", "Tool C"]);
    for (const p of synth) expect(JSON.stringify(p).toLowerCase()).toContain("synthetic");
  });
});

describe("Week 5 script — product claims backed by the code", () => {
  it('"things ActionReady doesn\'t do" — the public profile says no recording, transcription or auto-send', () => {
    const p = JSON.stringify(agentProfile());
    expect(p).toMatch(/no audio recording or transcription/);
    expect(p).toMatch(/Does not join Zoom, Teams or Meet/);
    const ar = PRODUCTS.find((x) => x.id === "actionready")!;
    for (const k of ["audio_recording", "live_transcription", "meeting_platform_join", "auto_send_without_review"]) expect(ar.supported).not.toContain(k);
    expect(ar.supported).toContain("human_approval_required");
  });

  // "If data is missing, we never pretend it's zero" is covered by tests/readiness.test.ts:
  //   "never reports missing capacity as zero or unlimited" and "Test B (missing capacity) → UNKNOWN".

  it('"you can add a PDF, Word or text file" — and recordings are refused', async () => {
    expect((await extractNotesFile(new File(["Priya drafts the report by Friday, 4h."], "n.txt"))).ok).toBe(true);
    const mp4 = await extractNotesFile(new File([new Uint8Array(8)], "call.mp4"));
    expect(mp4.ok).toBe(false);
  });
});
