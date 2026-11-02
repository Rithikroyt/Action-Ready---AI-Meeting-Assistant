# ActionReady — Week 3 Baseline Audit (Phase 0, read-only)

- **Audit date:** 2026-11-02
- **Method:** read-only n8n MCP calls (`search_workflows`, `get_workflow_details`, `get_workflow_history`, `search_workflow_executions` metadata only, `search_data_tables`, `search_nodes`, `get_node_types`).
- **Not done:** no executions, model calls, table writes, workflow updates, publishes, Gmail actions. No case rows or execution data were read.
- **Private backups:** `private/live_KTQmpWghSB2jid1T_2026-11-02_details.json` and `private/live_cisiwLtNtjuegt6m_2026-11-02_details.json` (git-ignored).
- **Local export:** `private/ActionReady - Week 2 Yellowdig FINAL.json` was **not present** in this repository (the repo was empty). The brief's claims about "the export" were therefore checked against the **live** workflow, not against a local file.

## 1. Target workflow — confirmed

| Field | Live value |
|---|---|
| ID | `KTQmpWghSB2jid1T` ✅ matches brief |
| Name | `ActionReady - Week 2 Yellowdig FINAL` |
| Nodes | 91 ✅ |
| `active` / `activeVersionId` | `false` / `null` — never published |
| `availableInMCP` | `true` |
| versionId (baseline for drift checks) | `fa8e19bf-71c6-4005-90bb-ee92a7375b21` |
| updatedAt | 2026-10-28T20:32:42.309Z |
| History entries | 1 (autosaved) |
| Triggers | Chat Trigger; `Report Request` webhook (GET, path `actionready-week2-yellowdig-final`, `authentication: n8nOAuth2`, respond via node); `Start Saved-Case Approval` (manual) |
| Pinned data | none |

**Drift rule:** before every live write, re-fetch and compare `versionId` with `fa8e19bf-…`. Stop on mismatch.

## 2. ⚠️ Same-named duplicate exists

`cisiwLtNtjuegt6m` has the **identical name**, was created ~80 min after the target (2026-10-27T20:54Z), and differs:

| | KTQmpWghSB2jid1T (target) | cisiwLtNtjuegt6m (duplicate) |
|---|---|---|
| Nodes | 91 | 92 — adds **`Gmail - Request Approval`** |
| Gmail credentials | attached to 2 Gmail nodes | none attached |
| `Approval Settings`, `Send Approval Enabled?` | — | parameters differ |
| Connections | approval request path incomplete | differs (includes request node) |
| Executions | 21, all manual, ~0.05–2.5 s | 7, manual, several 10–26 s |

The target's runs are all ≤2.5 s, which is consistent with dashboard/approval-lane runs, not two-agent chat runs. The duplicate's 10–26 s runs look like real AI runs. **The Week 2 Gmail test may have been done on the duplicate.** Execution data was not opened (it contains notes), so this is an inference — needs owner confirmation.

Seven other older ActionReady workflows also exist (`9nZYR2DD1MopjADC`, `CpDDxOvOyMHOnlZI`, `6GppJi4b6wj5LTW0`, `6duT5tY07uiOhP8F`, `eH1yvVwvEuu3tKmL`, `rC4WIDAobWsgn5y4`, `wEBPnttxGKd2rxu4`). None will be touched.

## 3. Brief findings — verification against live

| # | Brief claim | Live result |
|---|---|---|
| 1 | 91 nodes, `active:false`, `availableInMCP:true` | ✅ Confirmed. Not published. |
| 2 | Approval Settings enables approval and has personal inbox addresses | ✅ Confirmed: `enable_approval: true`, `reviewer_email` and `draft_recipient` populated (not reproduced here), `case_id: 'AR2-21'`. Contradicts `Approval Lane` note ("defaults to read-only preview"). |
| 3 | `Confirm Request Record` → `Read Approval Decision` directly; no request-and-wait | ✅ Confirmed. `Read Approval Decision` reads `$input.first().json.data.approved`; it receives the stored event row, so it resolves to `INVALID_RESPONSE`. **Fails safe** (never produces APPROVED) but **no approval request is ever sent**. The missing node exists only in the duplicate. |
| 4 | Only two Gmail nodes | ✅ Confirmed: `Gmail - Create Approved Draft` (resource draft), `Gmail - Collect Feedback` (sendAndWait, freeText). `Approval Lane` note says "three grey Gmail nodes" — wrong for this workflow. |
| 5 | Report is HTML, not JSON API | ✅ Confirmed (`Render Report` → `Respond with Report`). |
| 6 | Persistence excludes complete notes and raw tool transcripts | ✅ Confirmed: `Normalize Persistence Records` is an explicit allowlist (`allowlist-v2`), stores tool *summaries* only, and throws if any field contains the complete notes. |

## 4. Additional findings

| Severity | Finding |
|---|---|
| High | **Gmail nodes are not disabled** (`disabled` flag absent) despite notes saying "OFF by default". With `enable_approval: true`, safety currently rests on (a) the manual trigger and (b) the broken request path. Before any Week 3 work, set `enable_approval: false` and rely on explicit routing guards. |
| Medium | **Model nodes (`Writer Model`, `Reviewer Model`, gpt-4o-mini, temp 0) have no credential attached.** `search_nodes` reports `lmChatOpenAi` is covered by n8n gateway credits, which likely explains this. Verify in the editor that chat runs actually work on the target. |
| Medium | **Execution history retains full notes and raw tool steps** (Chat Trigger output, `Source_Evidence` `SOURCE` response, `history[].review.tool_steps`). Data Table persistence is clean; execution retention is a separate setting to review. |
| Medium | `Source_Evidence` and many nodes reference `$('Prepare Input')` by name. A website entry point **must flow through `Prepare Input`** (or a node with that name contract), or the reviewer tool breaks. |
| Low | `Prepare Input` rebuilds the item and only carries `settings` forward, so new config must live under `settings` (e.g. `settings.week3`) to survive. |
| Low | `Read Me` sticky still says "Import as NEW" — conflicts with the one-canvas rule. |
| Info | `Validate and Audit` already computes per-owner and team overload **from capacity stated in the notes** (`INDIVIDUAL_OVERLOAD`, `TEAM_OVERLOAD`, `CAPACITY_PERIOD_AMBIGUOUS`). Week 3 register/capacity context is a **different source**. It must stay separate and must not be merged into extracted facts. |
| Info | `Read Cases` uses `limit: 1000` and the metrics code warns at the limit. That is a good precedent for truncation detection. |

## 5. Current graph (summary)

```
Chat Trigger → Workflow Settings → Prepare Input → Input Usable?
  ├─ yes → Prepare Writer Input → Agent 1 (Writer Model, Calculator) → Capture Writer Version
  └─ no  ─────────────────────────────────────────────────────────────┐
Validate and Audit ← ───────────────────────────────────────────────────┘
 → Inspect Draft and Snapshot → Route Validated Record
     → Prepare Reviewer Input → Agent 2 (Reviewer Model, Source_Evidence) → Evaluate Reviewer and Gate
     → Route Quality Result: PASS | REVISE(→Prepare Revision→Prepare Writer Input) | CLARIFY | STOP | TECHNICAL×2
 → Set * Outcome → Build Evidence and Reply → Normalize Persistence Records → Read Prior Case State
 → Protect Approved Records → Upsert Case Record → Expand Version Rows → Has Version Rows? → Upsert Version Records
 → Read Back Saved Case → Read Back Saved Versions → Verify Saved Records → Restore Chat Reply
 (all persistence errors → Report Persistence Failure)

Report Request (GET, n8n OAuth) → Read Cases → Read Versions → Read Approval Events
 → Calculate Dashboard Metrics → Render Report → Respond with Report

Start Saved-Case Approval → Approval Settings → Get Approval Case/Versions/Events → Prepare Approval Snapshot
 → Send Approval Enabled? → Claim Pending Approval → Verify Pending Claim → Record Approval Requested
 → Confirm Request Record → [MISSING request-and-wait] → Read Approval Decision → Route Human Decision → …
```

Reviewer gate (`Evaluate Reviewer and Gate`) verifies tool use from `intermediateSteps`: it requires a `Source_Evidence` observation whose `case_id` and `notes` match the current case. Agent 2 has `returnIntermediateSteps: true`, `maxIterations: 6`. Week 3 tool evidence will use the same mechanism.

## 6. Existing Data Tables (project `Cm3kmaoTiBqyfNjk`)

`AR_YD_Cases` (`tTMvfqReKUhjRJWc`), `AR_YD_Versions` (`5QFOcewqEUFdEYlF`), `AR_YD_ApprovalEvents` (`CQGNKmuGNwgjshNR`). `AR_YD_Cases` already has `workload_valid`, `workload_reason`, `known_effort_hours`, `team_margin_hours`, `workload_json`. These hold **notes-derived** workload, not register-derived readiness. No `AR_Commitments`, `AR_Capacity`, or `AR_Jobs` tables exist yet. The `newsletter_*` and `dispatch_*` tables are unrelated and will not be touched.

## 7. Platform capability check

- `n8n-nodes-base.dataTableTool` v1.1 is installed, with operation `row/get`. Filter `keyName`/`condition`/`keyValue` accept expressions. `limit`, `orderBy`, and `matchType: allConditions` are supported. → **Native Data Table tools are viable.** Project/period/confirmation filters can be bound to trusted expressions, leaving only `owner_id` model-chosen.
- To verify on first build: expressions inside a tool sub-node can read `$('Prepare Reviewer Input')` (precedent: `Source_Evidence` reads `$('Prepare Input')`).

## 8. Open decisions for the owner

1. **Canonical workflow:** proceed on `KTQmpWghSB2jid1T` (recommended, matches brief) and treat `cisiwLtNtjuegt6m` as a reference only? Was the Week 2 Gmail test run on the duplicate?
2. **Authorize live writes** (each re-checked against `versionId`). See `NODE_CHANGE_PLAN.md` §5.
