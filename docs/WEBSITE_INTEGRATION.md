# Website ↔ n8n Integration Contract (schema_version 1)

This file describes the **implemented** integration as verified on 2026-11-02 against workflow `KTQmpWghSB2jid1T`.

The website (`web/`) is a Next.js server. It calls **two webhooks on the same ActionReady canvas**. The browser never calls n8n directly and never receives the n8n secret.

```
Browser ─▶ /api/meetings (session + same-origin) ─▶ POST {N8N_WEBHOOK_BASE}/actionready/v1/meetings              (Header Auth)
Browser ─▶ /api/jobs/:id  (session + ownership)  ─▶ GET  {N8N_WEBHOOK_BASE}/{N8N_JOB_STATUS_PATH}/{job_id}        (Header Auth)
```

## 1. Server configuration (`web/.env.local`, server-only)

| Variable | Value |
|---|---|
| `ACTIONREADY_MODE` | `live` (`demo` runs local synthetic examples only) |
| `N8N_WEBHOOK_BASE` | `https://<instance>.app.n8n.cloud/webhook` (production; `/webhook-test` is refused) |
| `N8N_WEBHOOK_HEADER_NAME` | `X-ActionReady-Key` |
| `N8N_WEBHOOK_SECRET` | the value stored in the n8n Header Auth credential "ActionReady Website API" |
| `N8N_JOB_STATUS_PATH` | status webhook path **without** the job ID, e.g. `102388a4-df67-43ee-8af5-75fd76f9b81d/actionready/v1/jobs` |

**The n8n GET production path contains an instance- and webhook-specific prefix, and it is configurable.**

n8n prefixes any webhook whose path has a parameter (`:job_id`) with that webhook's ID. The production URL is therefore `…/webhook/<webhook-id>/actionready/v1/jobs/:job_id`, not `…/webhook/actionready/v1/jobs/:job_id`. Copy the part between `/webhook/` and `/:job_id` from the **Website Job Status** node's Production URL. If the webhook node is ever recreated, its ID changes, and this value must be updated too.

The app trims slashes and a pasted `/:job_id` suffix, and it rejects `..`, schemes and query strings. If any live setting is missing, every page shows **Disconnected** and submission is disabled. The app never falls back to demo data.

## 2. POST `actionready/v1/meetings` (n8n: `Website Meeting Request` → `Validate Website Request` …)

Request: exactly `request_id`, `notes`, `period_start`, `period_end` and `timezone`, as JSON with `Content-Type: application/json`.

n8n rejects:
- unknown fields, and forbidden fields such as `project_id`, `owner_id`, approval, recipient, `table_id`, `workflow_id`, `case_id` or `job_id`;
- periods other than the configured **2026-11-02 to 2026-11-06** (`PERIOD_NOT_SUPPORTED`);
- notes that state a different period (`PERIOD_CONFLICT`).

| n8n response | Meaning to the app |
|---|---|
| **202** `{"job_id":"<uuid v4>","execution_status":"ACCEPTED","schema_version":"1"}` | Sent only after `Insert Job Record` and a verified read-back. The app opens the case page. |
| 200 `{"job_id", "execution_status", "idempotent_replay": true}` | Same `request_id` and same SHA-256 input fingerprint: the existing job, with no new model run. |
| 409 `REQUEST_ID_CONFLICT` | Same `request_id`, different input. |
| 400 / 413 / 415 / 422 `{"error":{code,message}}` | Validation failure. The message is shown to the user. |
| 503 `JOB_NOT_ACCEPTED` / `STORAGE_UNAVAILABLE` | Nothing was accepted. |
| timeout | The app shows "acceptance not confirmed" and never auto-retries. **Check again** re-sends the same `request_id`. |

After the 202, the same execution continues: `Mark Job Running` → `Prepare Website Pipeline Input` → `Workflow Settings`, into the shared writer / reviewer / readiness / persistence path.

The job is finalized in `Prepare Final Job State`. Its status is `SUCCEEDED` when `Verify Saved Records` returned `verified: true`, and `FAILED` otherwise. Business readiness (READY / BLOCKED / UNKNOWN) is stored separately, so `SUCCEEDED` + `BLOCKED` is a normal result.

## 3. GET status (n8n: `Website Job Status` → `Build Job Result`; read-only, no models or tools)

Actual response (`Cache-Control: no-store`; 400 for an invalid ID, 404 for an unknown job):

```json
{
  "schema_version": "1", "job_id": "<uuid>", "case_id": "AR2-123",
  "execution_status": "SUCCEEDED", "stale": false, "stored_execution_status": "SUCCEEDED",
  "timestamps": { "accepted_at": "…", "started_at": "…", "completed_at": "…", "updated_at": "…", "case_updated_at": "…" },
  "error": null, "result_available": true, "result_note": null,
  "ai_review": { "status": "AI_REVIEWED_NOT_HUMAN_APPROVED", "gate": "PASS", "score": 4.8, "version": 1 },
  "operational_readiness": {
    "status": "BLOCKED",
    "reasons": [{ "severity": "BLOCKED", "code": "CAPACITY_OVERLOAD", "owner_id": "maya", "message": "…" }],
    "questions": ["Decision needed for Maya: …"],
    "checked_version": 1, "data_kind": "SYNTHETIC_DEMO"
  },
  "human_approval": { "status": "NOT_REQUESTED" },
  "external_actions": { "status": "DISABLED_DEV_PHASE" },
  "actions": [{ "id": "A1", "task": "…", "owner": "Maya", "due_text": "by 6 November 2026", "estimated_hours": 4 }],
  "draft": { "subject": "…", "body": "…" },
  "workload": { "owner_id": "maya", "existing_hours": 6, "new_hours": 4, "projected_hours": 10, "capacity_hours": 8, "margin_hours": -2 },
  "workload_by_owner": [ { "...": "same shape" } ],
  "evidence": {
    "actions": [{ "action_id": "A1", "source_type": "MEETING_NOTES_EXCERPT", "source_quote": "…" }],
    "business_records": [{ "source_type": "DATA_TABLE_LOOKUP", "tool_name": "Commitment_Register", "project_id": "DEMO_ATLAS",
      "owner_id": "maya", "period_start": "2026-11-02", "period_end": "2026-11-06", "record_ids": ["CMT-ATLAS-0007"],
      "record_count": 1, "retrieved_at": "during reviewer run, this execution (…)", "updated_at": "2026-10-30T16:00:00.000Z", "success": true }]
  },
  "review_history": [{ "version": 1, "gate": "PASS", "score": 4.8, "created_at": "…" }]
}
```

### How the website normalizes it (`web/src/lib/contract.ts` → `normalizeJob()`)

The normalizer accepts **both** this live shape and the app's own demo shape.

| n8n field | Website field | Rule |
|---|---|---|
| `operational_readiness.status` | `operational_readiness` | READY / BLOCKED / UNKNOWN / NOT_CHECKED. A missing or invalid value becomes NOT_CHECKED, never READY. |
| `operational_readiness.reasons[]` | `issues[]` | Severity mapping: `BLOCKED`→BLOCKING, `UNKNOWN`→UNKNOWN, `WARNING`→NOTICE. |
| `operational_readiness.questions[]` | `clarification_questions[]` | |
| `workload_by_owner[]` (else the single `workload` object) | `workload[]` | `existing_hours`→`existing_open_hours`, `new_hours`→`new_proposed_hours`, `projected_hours`→`projected_load`, `capacity_hours`→`available_hours`, `margin_hours`→`capacity_margin`. **Null stays null.** Per-owner status: OVER_CAPACITY only if margin < 0; WITHIN only if margin ≥ 0 **and** the case is READY; otherwise UNKNOWN. |
| `ai_review.{status, gate, score, version}` | `review.*`, `version` | |
| `human_approval.status` | `approval_status` | `NOT_REQUESTED` is shown as **Not given**. Display only; no approval action exists in the app. |
| `external_actions.status` | `external_action` | Anything other than an explicit `PERMITTED` is shown as Not permitted. |
| `evidence.business_records[]` | `tool_evidence[]` | `tool_name`→`tool`, `record_ids`→`returned_ids`, `record_count`→`result_count`. `success` true gives `OK` (or `EMPTY` for 0 rows); false gives `ERROR`. Only the arguments n8n reported are kept. A `retrieved_at` that isn't an ISO timestamp becomes `retrieved_at: null`, with the text kept in `retrieved_note` and shown as text, never as a date. |
| `record_ids` | `records[]` (`id_only: true`) | Only IDs are returned live. Label, hours, status and `updated_at` are null and shown as "details not included". |
| `evidence.actions[].source_quote` | `actions[].source_quote` | Matched by `action_id` only, never by position. |
| `stale: true` | `stale` | Shown as "status unknown", not as success or failure. |
| `meeting_title`, `period` | — | Not returned live (non-blocking). The UI shows the case ID and "No period". |

## 4. Switching the website to live mode

1. Seed `AR_Commitments` and `AR_Capacity` from `fixtures/`, and publish the workflow so the production webhooks are active.
2. In `web/.env.local`, set `ACTIONREADY_MODE=live`, `N8N_WEBHOOK_BASE`, `N8N_WEBHOOK_HEADER_NAME`, `N8N_WEBHOOK_SECRET` and `N8N_JOB_STATUS_PATH`.
3. Run `npm run build && npm start`.
4. Submit the **Overload** example notes (period 2026-11-02 to 2026-11-06). Gmail and approval stay disabled by the workflow guards.

## 5. Frontend display rules (v0.4)
The website displays and explains the official result; see `docs/UI_ARCHITECTURE.md`.
- `human_approval.status` maps to Not requested / Pending / Approved / Changes requested / Rejected / Expired / Draft created. Unknown values show as *Unknown*.
- A rubric score is shown only when the review passed, labeled as a rubric and not a probability.
- If the review gate rejected the latest version (`TECHNICAL_REVIEW` / revision limit), its actions and draft are marked **Unvalidated**.
- The `Source_Evidence` call is not reported by the GET response, so the UI says so instead of claiming it.

## 6. Known limitations (private single-owner demo)

- One owner, password login, 8-hour signed cookie. This is not multi-tenant authorization.
- The job registry is a local JSON file (`web/.data/jobs.json`) with serialized in-process writes, so it needs a persistent disk.
- Idempotency (both the app registry and AR_Jobs lookup-then-insert) is serialized-demo protection, not atomic exactly-once.
- Uncaught errors after `Mark Job Running` can leave a job RUNNING. GET then reports it as stale or UNKNOWN after 20 minutes, and the app after 10. It is never shown as success.
- The Overview lists only jobs submitted through this app. Older chat-path cases remain in the n8n HTML report.
