# Week 5 — measured results

Live runs on 2026-11-14 (Arizona time). The cold experiment ran on n8n workflow version 1aef0c61 and the context
experiment on 42285488. One model: Gemini `gemini-3.5-flash`.
Google Search was off, JSON mode was on, there were no retries, and the AI advisor was not used.
**36 model calls in total, which is the planned maximum.** No second model was run.

Every number below was recomputed from the stored `AR_W5_Runs` rows using the same `aggregate()` function that n8n runs
(`node --experimental-strip-types web/scripts/week5-results.mjs submission/week5/live-results.json`). The recomputed
numbers match what the website shows. Rates are given as *k of n*. "n/a" means nothing valid was measured; it is not zero.

## Experiment A: asking the AI cold (`w5x_mwh9bq69_y36q5z`)

| | Result |
|---|---|
| Runs | P01 and P06, 3 each, so **6 of 6 valid** |
| ActionReady appeared | **0 of 6** (95% range 0–39%) |
| What Gemini named instead | Otter.ai (recommended in all 3 P01 runs), Gong, Fireflies.ai, Fellow.app |
| Consistency across repeats | 1.00 |
| Tokens | 2,388 in · 1,933 out |

**How to read this:** ActionReady is a private class project, so a model cannot know it from training data. Cold recall
measures how familiar the public is with a product. It does not measure product quality.

The stored summary row says `PARTIAL 1/6`. That figure was written before a fix to the aggregator (see "Bugs found
during the live run" below). All 6 runs are stored and valid, and the website and the detail endpoint recompute **6/6**.
They show the stored value next to it as `stored_status`.

## Experiment B: the agent reads product pages (`w5x_mwh9f0df_9ohxz3`)

Prompts P01, P04, P05, P06 and P08 were each run 3 times under COPY and under STRUCTURED, which makes **30 runs. 16 were valid.**
Failures: `PROVIDER_ERROR` 13 (Gemini rate limit, HTTP 429) and `NO_RECOMMEND` 1.

| Prompt | COPY valid | STRUCTURED valid |
|---|---|---|
| P01 open | 3 / 3 | 0 / 3 |
| P04 capacity | 3 / 3 | 0 / 3 |
| P05 approval | 3 / 3 | 0 / 3 |
| P06 delegated | 2 / 3 | 1 / 3 |
| P08 negative control | 2 / 3 | 2 / 3 |

The rate limit started at run 16 of 30, which was the first STRUCTURED call. Because of that, the failures fall almost
entirely on one condition.

### Copy only (P08 excluded; headline sample: 11 valid runs)

| Metric | Result |
|---|---|
| Appearance | **11 of 11** (100%) |
| Shortlist | 11 of 11 |
| Recommendation | **9 of 11** (82%, 95% range 52–95%) |
| Ranked #1 | 9 of 11 |
| Capability accuracy (ActionReady) | 121 of 121 claims correct |
| Runs with an unsupported claim | 0 of 11 |

| Segment | Appeared | Recommended |
|---|---|---|
| OPEN (P01) | 3 of 3 | **1 of 3**. Tool B (automated follow-up) won the other two. |
| CONSTRAINED (P04, P05) | 6 of 6 | 6 of 6 |
| DELEGATED (P06) | 2 of 2 | 2 of 2 |

### Negative control P08 (transcription and auto-send requested; ActionReady should lose)

| | Correct rejection |
|---|---|
| COPY | **2 of 2** (Tool A recommended in one run; all four rejected in the other) |
| STRUCTURED | **2 of 2** |

### Copy plus structured profile

There was only 1 valid non-P08 run (P06: appeared, recommended, #1, 11 of 11 claims correct).
**The before/after comparison is not measurable.** Each side needs at least 10 valid runs, so this run makes no
claim about the effect of the structured profile. The website shows an "Insufficient evidence" banner for it.

### Other observations

* **Peer accuracy** (claims about the synthetic tools): Tool A 74 of 75, Tool B 88 of 88, Tool C 86 of 86. The one
  wrong claim was about Tool A, in a P04 COPY run.
* **Consistency across repeats:** 0.94 mean agreement over 6 prompt × context groups.
* **Tokens:** 16,973 in · 8,151 out.

## Agent readability (`/agent-profile.json`)

The deterministic rubric scores it **100 of 100**: capability 25/25, comparability 20/20, evidence/trust 20/20,
safety & approval 20/20, metadata 15/15. This score shows the profile is complete and machine-readable. It does not
show that agents recommend ActionReady more because of it. Measuring that is the before/after experiment, which is
still open.

## Bugs found during the live run

1. **`executeOnce` on aggregate Code nodes.** Nodes that read `$input.all()` saw only the first item. As a result,
   the cold experiment was summarised as 1 of 6 valid. This was fixed in published version 42285488, and a regression
   test was added.
2. **Gemini free-tier rate limit.** The spacing between calls was 5 seconds, which caused 13 HTTP 429 errors. The
   spacing was raised to 13 seconds in published version 305653b5. The failed runs were not retried, because a retry
   inside a measurement would hide the failure and break the 36-call budget.
3. **Rule-based recommendations** now cover provider failures, contract failures and an insufficient before/after
   sample (published version e68623a9).

## Before/after: inconclusive (final)

The owner decided on 2026-11-14 not to re-run. The COPY → STRUCTURED comparison is reported as **inconclusive
because of provider rate limiting**. The failed runs are kept as observations and were not retried for a better
result. A future re-run would be 15 calls (STRUCTURED: P01, P04, P05, P06 and P08, 3 each) at the 13-second spacing.
