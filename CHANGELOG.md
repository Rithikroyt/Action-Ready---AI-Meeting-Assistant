# Changelog

## 0.3.2 — 2026-11-02 (targeted repair of audit criticals C1–C3)
- **C1 (n8n, workflow `KTQmpWghSB2jid1T`, node `Prepare Final Job State` only):** the saved check now uses `const saved = r.verified === true;` (the output of `Verify Saved Records`). Before, it read a `persistence` object that is only built later in `Restore Chat Reply`, so every website job was finalized FAILED. No other node or connection changed, and the workflow was not published or executed.
- **C2 (web):** the status webhook path is configurable through the new server-only `N8N_JOB_STATUS_PATH`, because n8n prefixes path-parameter webhooks with a webhook ID. `statusUrl()` and `normalizeStatusPath()` handle slashes, a pasted `:job_id` suffix, and unsafe paths. The POST path is unchanged, and live mode is Disconnected if the path is missing.
- **C3 (web):** `normalizeJob()` also accepts the live `Build Job Result` shape:
  - nested `operational_readiness`, with severity mapping BLOCKED→BLOCKING and WARNING→NOTICE;
  - `workload_by_owner` and the single `workload` object, with field renames and null preserved;
  - `ai_review` and `human_approval`;
  - `evidence.business_records` → `tool_evidence`, where a descriptive `retrieved_at` is kept as `retrieved_note` rather than a date;
  - ID-only `records`, and `evidence.actions` excerpts attached by `action_id`;
  - the `stale` flag.

  The demo contract is unchanged.
- UI: ID-only records make no counted/excluded claim; a descriptive retrieval time is shown as text; What-If treats `CAPACITY_OVERLOAD` as the simulated overload.
- Docs: `WEBSITE_INTEGRATION.md` now documents the real endpoints and response shape.
- Tests: +19 (live shape 16, status URL 3). 102 total passing.

## 0.3.1 — 2026-11-02 (web-only helpers)
- **Pre-submit Notes Check** (`web/src/lib/preflight.ts`, `PreflightPanel`). Local heuristic only; not AI verification.
  - ERROR (blocks): empty or too-short notes, missing or invalid planning period.
  - WARNING (never blocks): no obvious action, owner, deadline or effort estimate.
  - One "Submitting now may use an AI run and could return Needs Clarification." confirmation per distinct submission, with Submit anyway / Review notes.
- **What-If Workspace** (`web/src/lib/whatif.ts`, `WhatIf`). Local non-mutating simulation; official readiness remains the n8n result.
  - Adjust new effort or capacity, with suggested single changes and Reset to official. In-memory only, no network.
  - Shares `compareLoad()` with `readiness.ts`, so the simulation and the official rules use one calculation.
- `WorkloadBar` gains a `compact` option. No change to auth, API routes, n8n adapter, or secret handling.
- Tests: +24 (preflight 14, what-if 10). 83 total passing.

## 0.3.0 — 2026-11-02 (Week 3, website and supporting work)
- **Audit:** read-only inspection of live workflow `KTQmpWghSB2jid1T` → `docs/BASELINE_AUDIT.md`. Found a same-named duplicate (`cisiwLtNtjuegt6m`), approval enabled with personal inboxes, a missing approval request-and-wait node, and Gmail nodes that are not actually disabled. No live changes were made.
- **Web app (`web/`):** Next.js 16.4.4, React 19.3, TypeScript 6.0, zod 4.
  - Single-owner signed-cookie login, same-origin checks, job-ownership checks, no-store responses, security headers.
  - Server-only n8n adapter: 202-and-poll, no automatic resubmission, ambiguous-timeout handling with the same request_id.
  - Overview, New meeting (paste or .txt upload, explicit period, synthetic-example loader), and Case workspace (status trio, blocking callout, action table, evidence with transient note highlighting, workload bar, review/tool timeline).
  - Clearly labeled DEMO mode that never fabricates tool calls or AI reviews.
- **Readiness reference rules** (`web/src/lib/readiness.ts`) with 15 synthetic scenarios.
- **Fixtures:** `fixtures/AR_Commitments.seed.csv`, `AR_Capacity.seed.csv`, `scenarios.json`.
- **Docs:** integration contract with a follow-up AI Builder prompt, test plan, submission checklist, `CLAUDE.md`.
- **Tests:** 52 OFFLINE/MOCKED and 7 LOCAL-SERVER passing. LIVE tests NOT_RUN, pending the n8n build.
