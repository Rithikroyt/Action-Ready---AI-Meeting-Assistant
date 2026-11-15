# ActionReady — Week 5: AI Visibility & Delegation Lab

**Question:** *Can an AI agent understand ActionReady well enough to recommend it — and where must it stop before acting?*

ActionReady is a CIS 515 graduate class project, not a commercial product. In Week 5 it becomes the **brand being evaluated**:
brand-side AI visibility, recommendation eligibility, AEO/GEO and agent readability (primary), plus FOD prompting,
delegation boundaries and human control (secondary). No shopping, cart or UCP features were added.

## Two experiments, never mixed

| | A — Asking AI cold | B — Agent read the pages (main) |
|---|---|---|
| Question | Does the model already know ActionReady? | Given product information, is ActionReady understood, compared, represented accurately and recommended appropriately? |
| Material sent | none | 4 product dossiers: ActionReady + Tool A/B/C (**synthetic**) in a seeded, recorded random order |
| Conditions | COLD | **COPY**: comparable marketing copy for all four · **STRUCTURED**: the same copy **plus the same structured profile schema for all four** |
| Read as | public model familiarity — **not product quality** | before/after effect of *structure*, not of extra text about ActionReady |

The balanced STRUCTURED condition gives every product the same schema, so an improvement cannot simply come from ActionReady
receiving more text. COPY and STRUCTURED runs use the identical dossier order (paired design).

## Synthetic comparison products (not real)

| | Strength | Weakness | Should win |
|---|---|---|---|
| Tool A — transcription-first | joins Zoom/Teams/Meet, records, transcribes, transcript-timestamp evidence | no capacity check, auto-distributed summaries | P01, P08 |
| Tool B — automated follow-up-first | per-owner drafts, scheduled automatic sending, reminders, CRM | no capacity check, review off by default | convenience prompts |
| Tool C — task-management-first | boards, per-person workload heatmap, Jira/Slack | no independent evidence review, no email | capacity prompts |

## Prompt corpus `w5-p1` (FOD = Filter, Objective, Delegation)

| ID | Segment | F | O | D | Purpose |
|---|---|---|---|---|---|
| P01 | OPEN | category only | general usefulness | show options | default salience |
| P02 | OPEN | category + team size | fit | show options | broad fit |
| P03 | CONSTRAINED | evidence | accuracy | compare | evidence representation |
| P04 | CONSTRAINED | capacity | feasibility | compare | capacity representation |
| P05 | CONSTRAINED | approval | control | compare | human-control representation |
| P06 | DELEGATED | evidence + capacity + approval | trustworthy follow-through | recommend one | recommendation eligibility |
| P07 | DELEGATED | automation | least effort | recommend one | ActionReady *should* lose (approval is a cost) |
| P08 | DELEGATED | Zoom join + transcription + auto-send | hands-off | recommend one | **negative control**: ActionReady should NOT win |

Prompts never name ActionReady. The lab's delegation stops at **recommend** — it can never send, approve or publish.

## Code calculates, AI observes

* The model must answer a strict JSON contract (`ar.w5.rec.v1`): candidates with rank, status (RECOMMENDED / SHORTLISTED /
  MENTIONED / REJECTED), reasons and capability keys from a fixed 20-key vocabulary. No scores or percentages.
* **Parser** (no retries — failures are observations): `PROVIDER_ERROR, TIMEOUT, NOT_JSON, SCHEMA_INVALID, WRONG_CONTRACT,
  WRONG_PROMPT_ID, MULTI_RECOMMEND, NO_RECOMMEND`; flags `EXTRA_FIELDS, UNKNOWN_CAPABILITY, DUPLICATE, RANK_REPAIRED, TEXT_MENTION`.
* **Coding:** mentioned / shortlisted / recommended / rank / ranked-first, capability claims checked against truth tables
  for all four products, P08 correct rejection. A free-text mention is not an appearance.
* **Metrics** (V = valid runs, M = valid runs listing ActionReady): appearance, shortlist, recommendation, top position = k/V;
  capability accuracy = correct ÷ (correct + unsupported) claims; unsupported-claim rate = runs with ≥1 false claim ÷ M;
  parse failure = (R − V)/R. Missing denominators are **null, never 0**. Every rate is shown as *k of n* with a 95% Wilson range;
  headline slices need V ≥ 10. P08 is excluded from the success funnel and reported as correct rejection.
* **Agent-readability rubric (100):** capability completeness 25 · comparability 20 · evidence/trust 20 · safety & approval 20 ·
  metadata 15 — every point is a pass/fail rule over `/agent-profile.json`.

Single source of truth: `web/src/lib/visibility/core.ts`. The n8n Code nodes are generated from it
(`npm run week5:nodes`); tests fail if they drift.

## n8n (same ActionReady canvas, isolated branch)

`POST actionready/v1/visibility/experiments` → Read Running Experiments → **Validate Experiment** (corpus prompts only, ≤ 60 runs,
one at a time) → **Build Prompt Corpus** → **Prepare Test Runs** → Create Experiment + read-back → **202** → **Loop Over Runs** →
Stamp Call → **Model Switch** → **Gemini A / Gemini B** (Google Search off, JSON mode) → **Parse Recommendation** →
**Code Run Outcome** → Persist Run (upsert) + read-back → Rate-limit Spacing → loop → Read Experiment Runs →
**Aggregate Visibility** → **Agent Readability Audit** → Finalize Experiment.
Read-only: `GET actionready/v1/visibility/experiments` (list), `GET actionready/v1/visibility/experiment?id=` (detail, metrics recomputed).

Isolation: the deployed diff against the pre-Week-5 baseline shows **0 nodes removed/modified, 38 added, 37 connections — all
inside the Week 5 branch**; no Gmail, Sheets, HTTP or Execute-Workflow nodes; only the two `AR_W5_*` tables.

### Data tables (create these before importing the export)

**AR_W5_Experiments:** experiment_id, created_at, completed_at, status, kind, prompt_ids, prompt_set_version, contexts, models
(strings); reps_per_cell, requested_runs, valid_runs, failed_runs, seed, readability_score (numbers); profile_version,
profile_fingerprint, requested_by_hash, readability_json, advisor_text, error_detail (strings).

**AR_W5_Runs:** run_key, experiment_id, prompt_id, segment, model_id, context, order_json, started_at, provider_status,
parse_error, parsed_json, ar_claims, ar_unsupported, peer_json, flags, raw_output (strings); run_index, latency_ms, ar_rank,
candidates_count, tokens_in, tokens_out (numbers); parse_success, ar_mentioned, ar_shortlisted, ar_recommended (booleans).

## Importing the sanitized export

`submission/ActionReady_Week5_Sanitized_Submission.json` contains only the Week 5 branch. Replace the `REPLACE_WITH_YOUR_…`
placeholders (two table IDs, a header-auth credential, a Google Gemini credential). It contains no real data, IDs, emails,
URLs of the private n8n instance, or secrets.

## Website

`/visibility` (Visibility tab): experiment builder with FOD, exact call count and approver-only confirmation; KPI cards (k of n);
recommendation funnel; COPY → STRUCTURED dumbbells; prompt sensitivity; cold recall + P08; Gemini model comparison
("insufficient evidence" unless both models have enough runs); run explorer with raw JSON; readability scorecard;
rule-based improvements; delegation ladder. Demo mode shows a labelled **synthetic sample — not a measurement**; a live failure
shows "Disconnected / experiment unavailable", never the sample. `/agent-profile.json` is public and crawlable.

## Live vs synthetic — what is what

* **Live, measured:** the experiments listed in `RESULTS.md` (Gemini `gemini-3.5-flash`, existing n8n Gemini credential).
* **Synthetic:** Tool A/B/C profiles; the demo-mode sample on the website.
* **Model-generated:** only the raw candidate lists inside each run.
* **Deterministic:** parsing, coding, every metric, the readability score, the improvement recommendations.

## Sanitization checklist

- [x] export built from placeholders, scanned for credential/table/workflow IDs, instance host, emails, header name
- [x] agent profile contains no emails, IDs, secrets or private URLs (tested)
- [x] screenshots: crop the browser address bar on n8n; no emails or headers visible
- [x] no `.env*`, credentials or personal exports committed
