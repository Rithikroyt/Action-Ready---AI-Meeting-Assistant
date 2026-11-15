// SYNTHETIC SAMPLE for demo mode only — "Synthetic sample — not a measurement".
// A small rule-based stand-in for a model writes contract-shaped answers; they then go through the REAL
// parser, scorer and aggregator, so the demo exercises the same code paths as live data. No network, no model.
import { aggregate, hashString, planRuns, PRODUCTS, PROMPTS, readability, agentProfile, recommendations, runRow, truthOf, W5, type ExperimentRequest, type PlannedRun, type RunRow } from "./core";

export const SYNTHETIC_EXPERIMENT_ID = "w5x_synthetic_sample";

const NEEDS: Record<string, string[]> = {
  P01: ["action_item_extraction"],
  P02: ["action_item_extraction", "text_notes_input"],
  P03: ["source_quote_evidence", "second_ai_review"],
  P04: ["capacity_check", "commitment_lookup"],
  P05: ["human_approval_required", "per_person_email_drafts"],
  P06: ["source_quote_evidence", "capacity_check", "human_approval_required"],
  P07: ["auto_send_without_review", "task_board", "scheduled_reminders"],
  P08: ["meeting_platform_join", "live_transcription", "auto_send_without_review"],
};

function syntheticAnswer(run: PlannedRun): string {
  const p = PROMPTS.find((x) => x.prompt_id === run.prompt_id)!;
  const noise = (s: string) => (hashString(`${run.run_key}|${s}`) % 1000) / 1000;
  if (run.context === "COLD") {
    return JSON.stringify({ contract: W5.contract, prompt_id: p.prompt_id, declined: false, decline_reason: null, candidates: [{ name: "Generic meeting recorder", rank: 1, status: p.delegation === "SHOW_OPTIONS" ? "SHORTLISTED" : "RECOMMENDED", reasons: ["Widely used"], claimed_capabilities: ["live_transcription"], uncertainty: "Answer from general knowledge" }] });
  }
  const need = NEEDS[p.prompt_id] ?? [];
  const scored = PRODUCTS.map((prod) => {
    const t = truthOf(prod.id);
    return { prod, score: need.filter((k) => t[k]).length + noise(prod.id) * (run.context === "STRUCTURED" ? 0.4 : 0.9) };
  }).sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 3).map(({ prod }, i) => {
    const t = truthOf(prod.id);
    const claims = Object.keys(t).filter((k) => t[k]).slice(0, 5);
    // In COPY, the stand-in sometimes over-reads marketing copy and claims an unsupported capability.
    if (prod.id === "actionready" && run.context === "COPY" && noise("overclaim") < 0.35) claims.push("scheduled_reminders");
    const fits = need.every((k) => t[k]);
    const status = i === 0 && (p.delegation !== "SHOW_OPTIONS" || noise("show") < 0.6) ? "RECOMMENDED" : fits || i === 1 ? "SHORTLISTED" : p.delegation === "COMPARE" ? "REJECTED" : "MENTIONED";
    return { name: prod.name, rank: i + 1, status, reasons: [`Matches: ${need.filter((k) => t[k]).join(", ") || "general fit"}`], claimed_capabilities: claims, uncertainty: null };
  });
  return JSON.stringify({ contract: W5.contract, prompt_id: p.prompt_id, declined: false, decline_reason: null, candidates });
}

export function syntheticSample() {
  const req: ExperimentRequest = { kind: "BOTH", prompt_ids: ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"], cold_prompt_ids: ["P01", "P06"], contexts: ["COPY", "STRUCTURED"], models: ["gemini-3.5-flash"], reps: 3, seed: 515, requested_by_hash: null };
  const runs = planRuns(SYNTHETIC_EXPERIMENT_ID, req);
  const rows: RunRow[] = runs.map((run, i) => {
    // one malformed answer and one provider error, so failure handling is visible in the sample too
    if (i === 7) return runRow(run, SYNTHETIC_EXPERIMENT_ID, { provider_status: "OK", raw: "Sure! Here are some tools: ...", latency_ms: 2100, started_at: "2026-11-14T18:00:00.000Z" });
    if (i === 23) return runRow(run, SYNTHETIC_EXPERIMENT_ID, { provider_status: "ERROR", raw: "429 RESOURCE_EXHAUSTED (synthetic)", latency_ms: 300, started_at: "2026-11-14T18:00:00.000Z" });
    return runRow(run, SYNTHETIC_EXPERIMENT_ID, { provider_status: "OK", raw: syntheticAnswer(run), latency_ms: 1800 + (hashString(run.run_key) % 2400), started_at: "2026-11-14T18:00:00.000Z" });
  });
  const metrics = aggregate(rows);
  const rubric = readability(agentProfile());
  return {
    synthetic: true as const,
    experiment: {
      experiment_id: SYNTHETIC_EXPERIMENT_ID,
      created_at: "2026-11-14T18:00:00.000Z",
      completed_at: "2026-11-14T18:06:00.000Z",
      status: metrics.totals.valid === rows.length ? "COMPLETE" : "PARTIAL",
      kind: req.kind,
      prompt_ids: [...req.prompt_ids, ...req.cold_prompt_ids.map((p) => "COLD:" + p)].join(","),
      contexts: "COPY,STRUCTURED,COLD",
      models: req.models.join(","),
      reps_per_cell: req.reps,
      requested_runs: rows.length,
      valid_runs: metrics.totals.valid,
      failed_runs: metrics.totals.failed,
      readability_score: rubric.score,
    },
    runs: rows,
    metrics,
    readability: rubric,
    recommendations: recommendations(metrics, rubric),
  };
}
