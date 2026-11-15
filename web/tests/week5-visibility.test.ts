// OFFLINE + MOCKED tests: Week 5 AI Visibility & Delegation Lab.
// Core logic (web/src/lib/visibility/core.ts), the generated n8n Code nodes (run with mocked $ / $input),
// the branch graph (isolation), the public agent profile and the synthetic demo fixture.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aggregate, agentProfile, CAP_KEYS, codeRun, dossierProfile, geminiText, MODELS, parseModelOutput, planRuns, PRODUCTS, PROMPTS, readability, recommendations,
  runRow, seededShuffle, truthOf, userMessage, validateExperiment, W5, type ExperimentRequest, type PlannedRun, type RunRow,
} from "@/lib/visibility/core";
import { syntheticSample } from "@/lib/visibility/fixtures";
// @ts-expect-error — plain .mjs build scripts (tested, not type-checked)
import { buildWeek5Nodes } from "../scripts/build-week5-nodes.mjs";
// @ts-expect-error — plain .mjs build scripts (tested, not type-checked)
import { buildBranch, MODEL_ROUTES } from "../scripts/week5-branch.mjs";

type J = Record<string, unknown>;
const answer = (prompt_id: string, candidates: J[], extra: J = {}) => JSON.stringify({ contract: W5.contract, prompt_id, declined: false, decline_reason: null, candidates, ...extra });
const cand = (name: string, rank: number, status: string, claimed_capabilities: string[] = [], over: J = {}) => ({ name, rank, status, reasons: ["r"], claimed_capabilities, uncertainty: null, ...over });
const coded = (prompt_id: string, raw: string) => codeRun(parseModelOutput(raw, prompt_id), prompt_id);
const REQ: ExperimentRequest = { kind: "CONTEXT", prompt_ids: ["P01", "P04", "P05", "P06", "P08"], cold_prompt_ids: [], contexts: ["COPY", "STRUCTURED"], models: ["gemini-3.5-flash"], reps: 3, seed: 515, requested_by_hash: null };
const rowFor = (run: PlannedRun, raw: string, status = "OK") => runRow(run, "w5x_test01_abcdef", { provider_status: status, raw, latency_ms: 1000, started_at: "2026-11-14T00:00:00Z" });

describe("corpus + FOD", () => {
  it("has the eight w5-p1 prompts with full FOD fields and never names ActionReady", () => {
    expect(PROMPTS.map((p) => p.prompt_id)).toEqual(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"]);
    for (const p of PROMPTS) {
      expect(p.filter && p.objective && p.delegation && p.purpose && p.segment).toBeTruthy();
      expect(`${p.text} ${p.cold_text ?? ""}`).not.toMatch(/action\s*ready/i);
    }
    expect(PROMPTS.filter((p) => p.negative).map((p) => p.prompt_id)).toEqual(["P08"]);
  });
  it("builds the user message from corpus text only, with the dossier in run order", () => {
    const msg = userMessage({ prompt_id: "P04", context: "STRUCTURED", order: ["tool_c", "actionready", "tool_a", "tool_b"] });
    expect(msg.indexOf("### Tool C")).toBeLessThan(msg.indexOf("### ActionReady"));
    expect(msg).toContain("Structured profile:");
    expect(userMessage({ prompt_id: "P04", context: "COPY", order: ["tool_c", "actionready", "tool_a", "tool_b"] })).not.toContain("Structured profile:");
    expect(userMessage({ prompt_id: "P01", context: "COLD", order: [] })).not.toContain("PRODUCT MATERIAL");
  });
});

describe("products + truth tables", () => {
  it("24. ActionReady's supported list matches the owner-approved truth table exactly", () => {
    const yes = ["text_notes_input", "txt_upload", "action_item_extraction", "source_quote_evidence", "second_ai_review", "commitment_lookup", "capacity_check", "role_routing", "human_approval_required", "per_person_email_drafts", "task_tracker_publish"];
    const t = truthOf("actionready");
    expect(CAP_KEYS.filter((k) => t[k]).sort()).toEqual(yes.sort());
    for (const k of ["audio_recording", "live_transcription", "meeting_platform_join", "auto_send_without_review", "scheduled_reminders", "crm_sync", "task_board", "jira_slack_integration", "calendar_scheduling"]) expect(t[k]).toBe(false);
  });
  it("23. all four products get the SAME structured schema, with balanced size", () => {
    const keys = PRODUCTS.map((p) => Object.keys(dossierProfile(p)).join(","));
    expect(new Set(keys).size).toBe(1);
    const sizes = PRODUCTS.map((p) => JSON.stringify(dossierProfile(p)).length);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.35);
    const copy = PRODUCTS.map((p) => p.copy.split(/\s+/).length);
    expect(Math.max(...copy) / Math.min(...copy)).toBeLessThan(1.1);
  });
  it("synthetic competitors are labelled and each has real strengths (A: transcription, C: capacity, B: auto-send)", () => {
    expect(PRODUCTS.filter((p) => p.synthetic).map((p) => p.name)).toEqual(["Tool A", "Tool B", "Tool C"]);
    expect(truthOf("tool_a").live_transcription).toBe(true);
    expect(truthOf("tool_c").capacity_check).toBe(true);
    expect(truthOf("tool_b").auto_send_without_review).toBe(true);
  });
});

describe("experiment validation + planning", () => {
  it("accepts the primary evidence run and counts calls exactly (5 × 2 × 3 = 30)", () => {
    const v = validateExperiment({ ...REQ });
    expect(v).toMatchObject({ ok: true, total_runs: 30 });
  });
  it("refuses free-text prompts, unknown fields, >60 runs and a second RUNNING experiment", () => {
    expect(validateExperiment({ ...REQ, prompt: "anything" })).toMatchObject({ ok: false, http: 400 });
    expect(validateExperiment({ ...REQ, prompt_ids: ["P99"] })).toMatchObject({ ok: false });
    expect(validateExperiment({ ...REQ, prompt_ids: PROMPTS.map((p) => p.prompt_id), models: MODELS.map((m) => m.id), reps: 3 })).toMatchObject({ ok: false, code: "TOO_MANY_RUNS" });
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(validateExperiment({ ...REQ }, [{ status: "RUNNING", created_at: "2026-11-14T11:55:00Z" }], now)).toMatchObject({ ok: false, http: 409 });
    expect(validateExperiment({ ...REQ }, [{ status: "RUNNING", created_at: "2026-11-14T10:00:00Z" }], now)).toMatchObject({ ok: true });
  });
  it("22. dossier order is seeded, reproducible, and identical for COPY and STRUCTURED (paired design)", () => {
    expect(seededShuffle([1, 2, 3, 4], "x")).toEqual(seededShuffle([1, 2, 3, 4], "x"));
    const runs = planRuns("w5x_test01_abcdef", REQ);
    expect(runs).toHaveLength(30);
    expect(new Set(runs.map((r) => r.run_key)).size).toBe(30);
    for (const r of runs.filter((x) => x.context === "COPY")) {
      const twin = runs.find((x) => x.context === "STRUCTURED" && x.prompt_id === r.prompt_id && x.rep === r.rep)!;
      expect(twin.order).toEqual(r.order);
    }
    expect(new Set(runs.map((r) => r.order.join())).size).toBeGreaterThan(1);
  });
  it("25. configuring an experiment makes no network call", () => {
    const orig = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      throw new Error("network");
    }) as typeof fetch;
    try {
      validateExperiment({ ...REQ });
      planRuns("w5x_test01_abcdef", REQ);
      userMessage({ prompt_id: "P06", context: "COPY", order: ["actionready", "tool_a", "tool_b", "tool_c"] });
    } finally {
      globalThis.fetch = orig;
    }
    expect(calls).toBe(0);
  });
});

describe("parser (no retries; failures preserved)", () => {
  it("13. malformed JSON", () => expect(parseModelOutput("Sure! here you go", "P01")).toMatchObject({ parse_success: false, parse_error: "NOT_JSON" }));
  it("accepts a ```json fenced answer", () => expect(parseModelOutput("```json\n" + answer("P01", []) + "\n```", "P01").parse_success).toBe(true));
  it("14. wrong contract", () => expect(parseModelOutput(JSON.stringify({ contract: "x", prompt_id: "P01", declined: false, candidates: [] }), "P01").parse_error).toBe("WRONG_CONTRACT"));
  it("15. wrong prompt id", () => expect(parseModelOutput(answer("P02", []), "P01").parse_error).toBe("WRONG_PROMPT_ID"));
  it("16. multiple recommendations", () => expect(parseModelOutput(answer("P04", [cand("Tool C", 1, "RECOMMENDED"), cand("ActionReady", 2, "RECOMMENDED")]), "P04").parse_error).toBe("MULTI_RECOMMEND"));
  it("RECOMMEND_ONE without a recommendation (not declined) fails as NO_RECOMMEND", () => expect(parseModelOutput(answer("P06", [cand("Tool C", 1, "SHORTLISTED")]), "P06").parse_error).toBe("NO_RECOMMEND"));
  it("17. provider failure and 18. timeout", () => {
    expect(parseModelOutput("boom", "P01", "ERROR").parse_error).toBe("PROVIDER_ERROR");
    expect(parseModelOutput(null, "P01", "TIMEOUT").parse_error).toBe("TIMEOUT");
  });
  it("12. unknown capability keys are dropped and flagged, not fatal", () => {
    const r = parseModelOutput(answer("P01", [cand("ActionReady", 1, "SHORTLISTED", ["capacity_check", "telepathy"])]), "P01");
    expect(r.parse_success).toBe(true);
    expect(r.flags).toContain("UNKNOWN_CAPABILITY");
    expect(r.parsed!.candidates[0]!.claimed_capabilities).toEqual(["capacity_check"]);
  });
  it("extra fields and bad ranks are flagged and deterministically repaired", () => {
    const r = parseModelOutput(answer("P01", [cand("Tool A", 2, "SHORTLISTED", [], { score: 9 }), cand("ActionReady", 2, "MENTIONED")], { confidence: 0.9 }), "P01");
    expect(r.flags).toEqual(expect.arrayContaining(["EXTRA_FIELDS", "RANK_REPAIRED"]));
    expect(r.parsed!.candidates.map((c) => c.rank)).toEqual([1, 2]);
  });
  it("more than 5 candidates is a schema failure", () => expect(parseModelOutput(answer("P01", [1, 2, 3, 4, 5, 6].map((i) => cand("X" + i, i, "MENTIONED"))), "P01").parse_error).toBe("SCHEMA_INVALID"));
  it("reads text from the Gemini node's raw and simplified shapes and from errors", () => {
    expect(geminiText({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } })).toMatchObject({ status: "OK", text: "{}", tokens_in: 10 });
    expect(geminiText({ content: { parts: [{ text: "abc" }] } }).text).toBe("abc");
    expect(geminiText({ error: { message: "Request timed out" } }).status).toBe("TIMEOUT");
    expect(geminiText({ error: "403 forbidden" }).status).toBe("ERROR");
  });
});

describe("deterministic run coding", () => {
  it("1. P01 appearance (shortlisted, not recommended)", () => expect(coded("P01", answer("P01", [cand("Tool A", 1, "RECOMMENDED"), cand("ActionReady", 2, "SHORTLISTED")]))).toMatchObject({ ar_mentioned: true, ar_shortlisted: true, ar_recommended: false, ar_rank: 2 }));
  it("2/3/4. constrained prompts code evidence, capacity and approval claims against the truth table", () => {
    const o = coded("P04", answer("P04", [cand("ActionReady", 1, "RECOMMENDED", ["capacity_check", "source_quote_evidence", "human_approval_required"]), cand("Tool C", 2, "SHORTLISTED", ["capacity_check"])]))!;
    expect(o.ar_correct).toEqual(["capacity_check", "source_quote_evidence", "human_approval_required"]);
    expect(o.ar_unsupported).toEqual([]);
    expect(o.peers.tool_c).toMatchObject({ mentioned: true, correct: 1, unsupported: 0 });
    const o5 = coded("P05", answer("P05", [cand("Tool B", 1, "RECOMMENDED", ["human_approval_required"]), cand("ActionReady", 2, "SHORTLISTED", ["human_approval_required"])]))!;
    expect(o5.peers.tool_b!.unsupported).toBe(1); // Tool B's review is optional/off by default → not "required"
    expect(o5.ar_correct).toEqual(["human_approval_required"]);
  });
  it("5/10. P06 delegated: recommended and ranked first", () => expect(coded("P06", answer("P06", [cand("ActionReady", 1, "RECOMMENDED")]))).toMatchObject({ ar_recommended: true, ar_ranked_first: true }));
  it("6. P07 appropriate loss: another product recommended, ActionReady only shortlisted", () => expect(coded("P07", answer("P07", [cand("Tool B", 1, "RECOMMENDED"), cand("ActionReady", 2, "SHORTLISTED")]))).toMatchObject({ ar_recommended: false, ar_ranked_first: false }));
  it("7. P08 correct rejection vs representation error", () => {
    expect(coded("P08", answer("P08", [cand("Tool A", 1, "RECOMMENDED"), cand("ActionReady", 2, "REJECTED")]))).toMatchObject({ correct_rejection: true, representation_error: false, ar_rank: null });
    expect(coded("P08", answer("P08", [cand("ActionReady", 1, "RECOMMENDED", ["live_transcription"])]))).toMatchObject({ correct_rejection: false, representation_error: true });
  });
  it("8. absent, and a free-text mention does not count as appearance", () => {
    const o = coded("P01", answer("P01", [cand("Tool A", 1, "RECOMMENDED", [], { reasons: ["Better than ActionReady here"] })]))!;
    expect(o).toMatchObject({ ar_mentioned: false, ar_text_mention: true });
  });
  it("9. mentioned but not shortlisted", () => expect(coded("P01", answer("P01", [cand("Tool A", 1, "RECOMMENDED"), cand("ActionReady", 2, "MENTIONED")]))).toMatchObject({ ar_mentioned: true, ar_shortlisted: false }));
  it("11. unsupported capability claim", () => expect(coded("P03", answer("P03", [cand("ActionReady", 1, "RECOMMENDED", ["source_quote_evidence", "auto_send_without_review"])]))!.ar_unsupported).toEqual(["auto_send_without_review"]));
  it("name normalisation and duplicates", () => {
    const o = coded("P01", answer("P01", [cand("Action Ready (AI)", 2, "MENTIONED"), cand("ACTIONREADY", 1, "SHORTLISTED")]))!;
    expect(o.flags).toContain("DUPLICATE");
    expect(o.ar_rank).toBe(1);
  });
  it("failed parse codes nothing (null, not false)", () => {
    const r = rowFor(planRuns("w5x_test01_abcdef", REQ)[0]!, "nope");
    expect(r).toMatchObject({ parse_success: false, parse_error: "NOT_JSON", ar_mentioned: null, ar_rank: null });
  });
});

describe("metrics (recomputed from rows; missing is null)", () => {
  const runs = planRuns("w5x_test01_abcdef", REQ);
  const good = (run: PlannedRun) => rowFor(run, answer(run.prompt_id, run.prompt_id === "P08" ? [cand("Tool A", 1, "RECOMMENDED"), cand("ActionReady", 2, "REJECTED")] : [cand("ActionReady", 1, "RECOMMENDED", run.context === "COPY" ? ["capacity_check", "crm_sync"] : ["capacity_check"])]));
  it("19. zero valid runs → null rates, never 0%", () => {
    const m = aggregate(runs.slice(0, 4).map((r) => rowFor(r, "bad")));
    const s = m.contexts.COPY!;
    expect(s.valid).toBe(0);
    expect(s.appearance.rate).toBeNull();
    expect(s.capability_accuracy.rate).toBeNull();
    expect(s.parse_failure).toMatchObject({ k: 4, n: 4, rate: 1 });
    expect(aggregate([]).cold).toBeNull();
  });
  it("20. capability-accuracy denominator = correct + unsupported claims over runs that list ActionReady", () => {
    const m = aggregate(runs.map(good));
    expect(m.contexts.COPY!.capability_accuracy).toMatchObject({ k: 12, n: 24, rate: 0.5 });
    expect(m.contexts.STRUCTURED!.capability_accuracy).toMatchObject({ k: 12, n: 12, rate: 1 });
    expect(m.contexts.COPY!.unsupported_claims).toMatchObject({ k: 12, n: 12 });
  });
  it("funnel excludes P08; P08 reported as correct rejection; parse failures counted, not dropped", () => {
    const rows = runs.map((r, i) => (i === 0 ? rowFor(r, "x", "ERROR") : good(r)));
    const m = aggregate(rows);
    expect(m.contexts.COPY!.requested).toBe(12); // 4 non-negative prompts × 3 reps
    expect(m.contexts.COPY!.failed).toBe(1);
    expect(m.contexts.COPY!.appearance).toMatchObject({ k: 11, n: 11 });
    expect(m.negative.COPY).toMatchObject({ k: 3, n: 3, rate: 1 });
    expect(m.totals.errors).toEqual({ PROVIDER_ERROR: 1 });
    expect(m.contexts.COPY!.appearance.low).toBeGreaterThan(0.7);
  });
  it("21. before/after parity: COPY and STRUCTURED slices have identical prompts, reps and models", () => {
    const m = aggregate(runs.map(good));
    expect(m.contexts.COPY!.requested).toBe(m.contexts.STRUCTURED!.requested);
    const key = (ctx: string) => m.by_prompt.filter((p) => p.context === ctx).map((p) => `${p.prompt_id}|${p.model_id}|${p.slice.requested}`);
    expect(key("COPY")).toEqual(key("STRUCTURED"));
  });
  it("small slices are marked insufficient; consistency is k-of-n agreement", () => {
    const m = aggregate(runs.map(good));
    expect(m.contexts.COPY!.sufficient).toBe(true);
    expect(m.by_segment.COPY!.OPEN!.sufficient).toBe(true);
    expect(m.consistency.mean_agreement).toBe(1);
    expect(aggregate(runs.slice(0, 3).map(good)).contexts.COPY!.sufficient).toBe(false);
  });
});

describe("agent profile + readability rubric", () => {
  const profile = agentProfile();
  it("33. the public profile has no secrets, emails, IDs or private URLs", () => {
    const s = JSON.stringify(profile);
    expect(s).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    expect(s).not.toMatch(/n8n\.cloud|webhook|secret|api[_-]?key|token|credential|KTQmpWghSB2jid1T|[A-Za-z0-9]{16}(?=["\s])/i);
    expect(profile.maturity).toMatch(/class project/i);
    expect(profile.human_approval.auto_send).toBe(false);
  });
  it("profile truth parity: capabilities = supported truth, not_supported = the rest", () => {
    const t = truthOf("actionready");
    expect(profile.capabilities.every((c) => t[c.key])).toBe(true);
    expect(profile.not_supported.every((k) => !t[k])).toBe(true);
    expect(profile.capabilities.length + profile.not_supported.length).toBe(CAP_KEYS.length);
  });
  it("the rubric is deterministic, sums to 100 and catches an overclaim", () => {
    const r = readability(profile);
    expect(r.sections.reduce((a, s) => a + s.max, 0)).toBe(100);
    expect(r.score).toBe(100);
    expect(readability(profile)).toEqual(r);
    const lying = { ...profile, capabilities: [...profile.capabilities, { key: "live_transcription", description: "x" }] };
    expect(readability(lying).score).toBe(90);
    expect(readability(profile, { linked_from_landing: false, crawlable: false }).score).toBe(94);
    expect(readability(profile, { linked_from_landing: false, crawlable: false }).weakest).toBe("metadata");
  });
  it("reliability rules fire on provider failures, contract violations and an unmeasurable before/after", () => {
    const runs = planRuns("w5x_test01_abcdef", REQ);
    const rows = runs.map((r, i) => (r.context === "STRUCTURED" && i % 15 !== 14 ? rowFor(r, "429", "ERROR") : r.prompt_id === "P08" && r.rep === 1 ? rowFor(r, answer("P08", [cand("Tool A", 1, "REJECTED")])) : rowFor(r, answer(r.prompt_id, [cand("ActionReady", 1, "RECOMMENDED")]))));
    const ids = recommendations(aggregate(rows), readability(agentProfile())).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["reliability_provider", "reliability_contract", "before_after_insufficient"]));
    expect(ids).not.toContain("none");
  });
  it("recommendations are rule-based and cite their measured basis", () => {
    const runs = planRuns("w5x_test01_abcdef", REQ);
    const m = aggregate(runs.map((r) => rowFor(r, answer(r.prompt_id, [cand("ActionReady", 1, "RECOMMENDED", ["crm_sync"])]))));
    const recs = recommendations(m, readability(profile));
    expect(recs.find((x) => x.id === "unsupported_COPY")?.basis).toMatch(/of/);
    expect(recs.find((x) => x.id === "negative_COPY")).toBeTruthy();
  });
});

describe("generated n8n Code nodes (OFFLINE, mocked $ / $input)", () => {
  const files = buildWeek5Nodes() as Record<string, string>;
  const onDisk = (f: string) => readFileSync(fileURLToPath(new URL(`../../n8n/week5/${f}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  type Node = (d: unknown, i: unknown) => unknown;
  const node = (f: string) => new Function("$", "$input", files[f]!) as Node;
  const $ = (data: Record<string, J[]>) => (n: string) => {
    if (!(n in data)) throw new Error("node not executed: " + n);
    return { first: () => ({ json: data[n]![0] }), all: () => data[n]!.map((json) => ({ json })), item: { json: data[n]![0] } };
  };
  const input = (rows: J[]) => ({ first: () => ({ json: rows[0] }), all: () => rows.map((json) => ({ json })), item: { json: rows[0] } });

  it("generated files on disk are up to date with core.ts", () => {
    const disk = readdirSync(fileURLToPath(new URL("../../n8n/week5/", import.meta.url))).filter((f) => f.endsWith(".node.js")).sort();
    expect(disk).toEqual(Object.keys(files).sort());
    for (const f of disk) expect(onDisk(f), f).toBe(files[f]);
  });
  it("Validate → Corpus → Prepare → Split produce the planned runs with exact messages", () => {
    const v = (node("validate-experiment.node.js")($({ "W5 · Experiment Request": [{ body: { ...REQ } }] }), input([{}])) as { json: J }[])[0]!.json;
    expect(v).toMatchObject({ valid: true, total_runs: 30 });
    const c = (node("build-prompt-corpus.node.js")($({}), input([v])) as { json: J }[])[0]!.json;
    const p = (node("prepare-test-runs.node.js")($({}), input([c])) as { json: { experiment: J; runs: PlannedRun[] } }[])[0]!.json;
    expect(p.experiment).toMatchObject({ status: "RUNNING", requested_runs: 30, prompt_set_version: "w5-p1" });
    const split = node("split-runs.node.js")($({ "W5 · Prepare Test Runs": [p as unknown as J] }), input([{}])) as { json: J }[];
    expect(split).toHaveLength(30);
    expect(split[0]!.json.user_message).toBe(userMessage(p.runs[0]!));
  });
  it("Validate refuses with 400/409 bodies (no model call path)", () => {
    const bad = (node("validate-experiment.node.js")($({ "W5 · Experiment Request": [{ body: { kind: "CONTEXT", prompt: "free text" } }] }), input([{}])) as { json: J }[])[0]!.json;
    expect(bad).toMatchObject({ valid: false, http_status: 400 });
  });
  it("Parse → Code Run Outcome → Aggregate round-trip equals the core result", () => {
    const run = { ...planRuns("w5x_test01_abcdef", REQ)[0]!, experiment_id: "w5x_test01_abcdef", started_ms: Date.now() - 50, started_at: "2026-11-14T00:00:00Z" };
    const res = { candidates: [{ content: { parts: [{ text: answer(run.prompt_id, [cand("ActionReady", 1, "SHORTLISTED", ["capacity_check"])]) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 } };
    const parsed = (node("parse-recommendation.node.js")($({ "W5 · Stamp Call": [run as unknown as J] }), input([res])) as { json: J }).json;
    expect(parsed).toMatchObject({ parse_success: true, tokens_in: 900 });
    const row = (node("code-run-outcome.node.js")($({}), input([parsed])) as { json: RunRow }).json;
    expect(row).toMatchObject({ run_key: run.run_key, ar_mentioned: true, ar_shortlisted: true, ar_claims: "capacity_check" });
    const exp = { experiment: { experiment_id: "w5x_test01_abcdef", requested_runs: 1 } };
    const agg = (node("aggregate-visibility.node.js")($({ "W5 · Prepare Test Runs": [exp] }), input([row as unknown as J])) as { json: J }[])[0]!.json;
    expect(agg).toMatchObject({ status: "COMPLETE", valid_runs: 1, failed_runs: 0 });
    const audit = (node("agent-readability-audit.node.js")($({}), input([agg])) as { json: J }[])[0]!.json;
    expect(audit.readability_score).toBe(100);
  });
  it("Aggregate marks PARTIAL / FAILED honestly", () => {
    const exp = { experiment: { experiment_id: "w5x_test01_abcdef", requested_runs: 2 } };
    const r = rowFor(planRuns("w5x_test01_abcdef", REQ)[0]!, "bad");
    const agg = (node("aggregate-visibility.node.js")($({ "W5 · Prepare Test Runs": [exp] }), input([r as unknown as J])) as { json: J }[])[0]!.json;
    expect(agg).toMatchObject({ status: "FAILED", valid_runs: 0, failed_runs: 2 });
    expect(String(agg.error_detail)).toMatch(/not stored/);
  });
  it("28. Build Detail recomputes metrics from stored runs; bad ids are refused", () => {
    const runs = planRuns("w5x_test01_abcdef", REQ).slice(0, 3).map((r) => rowFor(r, answer(r.prompt_id, [cand("ActionReady", 1, "SHORTLISTED")])));
    const out = (node("build-detail.node.js")($({ "W5 · Detail Request": [{ query: { id: "w5x_test01_abcdef" } }], "W5 · Read Experiment": [{ experiment_id: "w5x_test01_abcdef", status: "COMPLETE" }] }), input(runs as unknown as J[])) as { json: { http_status: number; response_body: { metrics: unknown } } }[])[0]!.json;
    expect(out.http_status).toBe(200);
    expect(out.response_body.metrics).toEqual(JSON.parse(JSON.stringify(aggregate(runs))));
    const bad = (node("build-detail.node.js")($({ "W5 · Detail Request": [{ query: { id: "../../x" } }], "W5 · Read Experiment": [{}] }), input([{}])) as { json: J }[])[0]!.json;
    expect(bad.http_status).toBe(400);
  });
});

describe("branch graph isolation", () => {
  const { nodes, connections } = buildBranch() as { nodes: { name: string; type: string; parameters: J }[]; connections: { source: string; target: string }[] };
  const names = new Set(nodes.map((n) => n.name));
  it("27. every connection stays inside the Week 5 branch", () => {
    for (const c of connections) {
      expect(names.has(c.source), c.source).toBe(true);
      expect(names.has(c.target), c.target).toBe(true);
    }
  });
  it("29/30. no Gmail, Sheets, HTTP, Execute-Workflow or sub-workflow node can be reached", () => {
    for (const n of nodes) expect(n.type).not.toMatch(/gmail|googleSheets|httpRequest|executeWorkflow|toolWorkflow/i);
  });
  it("31. data-table nodes only touch AR_W5_Experiments / AR_W5_Runs", () => {
    for (const n of nodes.filter((x) => x.type === "n8n-nodes-base.dataTable")) expect(String((n.parameters.dataTableId as { cachedResultName: string }).cachedResultName)).toMatch(/^AR_W5_(Experiments|Runs)$/);
  });
  it("28. GET endpoints are read-only: no write node reachable from them", () => {
    const reach = (start: string) => {
      const seen = new Set([start]);
      const q = [start];
      while (q.length) for (const c of connections.filter((x) => x.source === q.shift())) if (!seen.has(c.target)) (seen.add(c.target), q.push(c.target));
      return seen;
    };
    for (const hook of ["W5 · List Request", "W5 · Detail Request"]) {
      for (const n of reach(hook)) {
        const node = nodes.find((x) => x.name === n)!;
        expect(node.type).not.toMatch(/googleGemini|lmChat/);
        if (node.type === "n8n-nodes-base.dataTable") expect(node.parameters.operation).toBe("get");
      }
    }
  });
  it("models are pinned by exact ID, Google Search is off, and routes match the core model list", () => {
    expect(MODEL_ROUTES.map((m: { id: string }) => m.id)).toEqual(MODELS.map((m) => m.id));
    for (const n of nodes.filter((x) => x.type.includes("googleGemini"))) {
      expect((n.parameters.modelId as { value: string }).value).toMatch(/^models\/gemini-3\.5-flash(-lite)?$/);
      expect(n.parameters.builtInTools).toEqual({});
    }
  });
  it("no Code node that reads $input.all() runs with executeOnce (it would only see the first item)", () => {
    const { settings } = buildBranch() as { settings: Record<string, { executeOnce?: boolean }> };
    for (const n of nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
      if (String(n.parameters.jsCode).includes("$input.all()")) expect(settings[n.name]?.executeOnce, n.name).not.toBe(true);
    }
  });
  it("webhooks use header auth", () => {
    for (const n of nodes.filter((x) => x.type === "n8n-nodes-base.webhook")) expect(n.parameters.authentication).toBe("headerAuth");
  });
});

describe("26. synthetic demo fixture", () => {
  const s = syntheticSample();
  it("is labelled synthetic, runs through the real pipeline and includes visible failures", () => {
    expect(s.synthetic).toBe(true);
    expect(s.experiment.experiment_id).toMatch(/synthetic/);
    expect(s.metrics.totals.failed).toBe(2);
    expect(s.metrics.contexts.COPY && s.metrics.contexts.STRUCTURED && s.metrics.cold).toBeTruthy();
    expect(s.metrics).toEqual(aggregate(s.runs));
  });
});
