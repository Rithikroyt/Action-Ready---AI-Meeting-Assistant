# Website ↔ n8n Integration Contract (schema_version 1)

The website (`web/`) is a Next.js server that calls **two webhooks on the same ActionReady canvas** (`KTQmpWghSB2jid1T`). The browser never calls n8n directly and never sees the n8n secret.

```
Browser ─▶ /api/meetings (session + same-origin) ─▶ POST {base}/actionready/v1/meetings   (Header Auth)
Browser ─▶ /api/jobs/:id  (session + ownership)  ─▶ GET  {base}/actionready/v1/jobs/:job_id (Header Auth)
```

## 1. Authentication

- An n8n **Header Auth** credential sits on both webhooks. Header name: `X-ActionReady-Key` (configurable). The value is a random string of 32+ characters.
- The same value goes in `web/.env.local` as `N8N_WEBHOOK_SECRET`. It is never put in a `NEXT_PUBLIC_` variable.
- `N8N_WEBHOOK_BASE` must be the **production** base, for example `https://YOUR-INSTANCE.app.n8n.cloud/webhook`. The app refuses `/webhook-test`.

## 2. POST `actionready/v1/meetings`

Request (the app sends exactly these five fields; anything else is rejected before n8n):

```json
{
  "request_id": "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  "notes": "Project Atlas weekly planning. ...",
  "period_start": "2026-11-02",
  "period_end": "2026-11-06",
  "timezone": "America/Phoenix"
}
```

| n8n response | Meaning to the app |
|---|---|
| **202** `{"job_id":"<opaque 8–80 chars [A-Za-z0-9_-]>","execution_status":"ACCEPTED","schema_version":"1"}`, sent only after the AR_Jobs row is saved and verified | Accepted → app opens the case page |
| 200 with the same body | Same `request_id` and same input → existing job, no new model run |
| 409 `{"error":{"code":"CONFLICT","message":"..."}}` | Same `request_id`, different input |
| 400 / 422 `{"error":{"code":"...","message":"..."}}` | Validation failure. The message is shown to the user, so keep it safe. |
| 401 / 403 | Header Auth mismatch → app shows "Disconnected" |
| timeout or no response | App shows "acceptance not confirmed" and never auto-retries. The user can press **Check again**, which re-sends the **same** `request_id`. |

## 3. GET `actionready/v1/jobs/:job_id` (read-only; must not call agents or write)

Return `application/json`, `Cache-Control: no-store`, 404 for unknown job IDs. Any field may be `null` or omitted. **Unknown values must be `null`, never `0`.** The app's normalizer (`web/src/lib/contract.ts`) also accepts JSON-encoded strings for nested fields, since n8n Code nodes often store them that way.

```json
{
  "schema_version": "1",
  "job_id": "job_8fK2...",
  "case_id": "AR2-1234",
  "execution_status": "SUCCEEDED",
  "meeting_title": "Project Atlas weekly planning",
  "period": { "start": "2026-11-02", "end": "2026-11-06", "timezone": "America/Phoenix" },

  "review_status": "AI_REVIEWED_NOT_HUMAN_APPROVED",
  "gate": "PASS",
  "review_score": 4.8,
  "quality_threshold": 4.5,
  "scores": { "factual_accuracy": 5, "completeness": 5, "clarity": 5, "tone": 4, "safety": 5 },
  "version": 1,
  "max_versions": 3,

  "operational_readiness": "BLOCKED",
  "approval_status": "NOT_REQUESTED",
  "external_action": "NOT_PERMITTED",

  "actions": [
    { "action_id": "A1", "task": "Prepare the customer-demo walkthrough", "owner": "Maya", "owner_id": "maya",
      "due_text": "by 6 November 2026", "estimated_hours": 4,
      "source_quote": "Maya will prepare the customer-demo walkthrough by 6 November 2026, estimated 4 hours." }
  ],
  "draft": { "subject": "…", "body": "…", "label": "Draft — not approved, not sent" },

  "workload": [
    { "owner_id": "maya", "owner_label": "Maya",
      "existing_open_hours": 6, "existing_commitment_ids": ["CMT-ATLAS-0007"],
      "new_proposed_hours": 4, "new_action_ids": ["A1"],
      "projected_load": 10, "available_hours": 8, "capacity_id": "CAP-ATLAS-maya-2026W45",
      "capacity_margin": -2, "status": "OVER_CAPACITY" }
  ],
  "issues": [
    { "code": "OVER_CAPACITY", "severity": "BLOCKING", "owner_id": "maya",
      "message": "Maya: 6 h confirmed open + 4 h new = 10 h against 8 h recorded capacity — 2 h short." }
  ],
  "clarification_questions": [
    "Maya is 2 h over recorded capacity. Which commitment, estimate, or capacity record should change? Nothing has been reassigned or rescheduled."
  ],

  "tool_evidence": [
    { "tool": "Commitment_Register", "args": { "owner_id": "maya" }, "returned_ids": ["CMT-ATLAS-0007", "CMT-ATLAS-0003"],
      "result_count": 2, "retrieved_at": "2026-11-02T18:01:12Z", "max_source_updated_at": "2026-10-30T16:00:00Z", "outcome": "OK" },
    { "tool": "Capacity_Lookup", "args": { "owner_id": "maya" }, "returned_ids": ["CAP-ATLAS-maya-2026W45"],
      "result_count": 1, "retrieved_at": "2026-11-02T18:01:13Z", "max_source_updated_at": "2026-10-30T16:00:00Z", "outcome": "OK" }
  ],
  "records": [
    { "kind": "commitment", "id": "CMT-ATLAS-0007", "owner_id": "maya", "label": "Update the customer onboarding checklist",
      "hours": 6, "status": "CONFIRMED · OPEN", "due_text": "by 5 November 2026", "updated_at": "2026-10-30T16:00:00Z", "provenance": "SYNTHETIC_DEMO" },
    { "kind": "capacity", "id": "CAP-ATLAS-maya-2026W45", "owner_id": "maya", "label": "Project allocation for the week",
      "hours": 8, "status": "2026-11-02 – 2026-11-06", "updated_at": "2026-10-30T16:00:00Z", "provenance": "SYNTHETIC_DEMO" }
  ],
  "review_history": [{ "version": 1, "gate": "PASS", "score": 4.8, "at": "2026-11-02T18:01:20Z" }],

  "timestamps": { "accepted_at": "…", "started_at": "…", "finished_at": "…", "updated_at": "…" },
  "error": null
}
```

Enumerations:

- `execution_status`: `ACCEPTED | RUNNING | SUCCEEDED | FAILED`. The app marks ACCEPTED/RUNNING jobs with no update for 10 minutes as "status unknown".
- `operational_readiness`: `READY | BLOCKED | UNKNOWN | NOT_CHECKED`. A missing value is shown as `NOT_CHECKED`, never READY.
- `issues[].severity`: `BLOCKING | UNKNOWN | NOTICE`.
- `tool_evidence[].outcome`: `OK | EMPTY | ERROR | TRUNCATED`.
- `external_action`: only an explicit `"PERMITTED"` is shown as permitted.

For FAILED jobs: `"error": {"code":"PERSISTENCE_FAILED","message":"<safe text>"}`. Never include stack traces, raw model output, complete notes, approval links or credentials.

The readiness rules and codes match `web/src/lib/readiness.ts`. Its tests (`web/tests/readiness.test.ts`) are the executable specification for the n8n "Compute Operational Readiness" Code node.

## 4. Follow-up prompt for the n8n AI Builder

Paste this after Prompt 2 has been built, so the endpoints match the website exactly:

> Continue on the SAME ActionReady workflow (KTQmpWghSB2jid1T) and SAME canvas. Do not create workflows, sub-workflows or clones. Draft changes only; do not publish.
>
> Make the GET `actionready/v1/jobs/:job_id` response match this contract exactly (field names and enums), building it only from stored AR_Jobs / AR_YD_Cases / AR_YD_Versions data. Never call agents on this path: schema_version, job_id, case_id, execution_status, meeting_title, period{start,end,timezone}, review_status, gate, review_score, quality_threshold, scores, version, max_versions, operational_readiness, approval_status, external_action, actions[{action_id, task, owner, owner_id, due_text, estimated_hours, source_quote}], draft{subject, body, label}, workload[{owner_id, owner_label, existing_open_hours, existing_commitment_ids, new_proposed_hours, new_action_ids, projected_load, available_hours, capacity_id, capacity_margin, status}], issues[{code, severity, owner_id, message}], clarification_questions[], tool_evidence[{tool, args{owner_id}, returned_ids, result_count, retrieved_at, max_source_updated_at, outcome}], records[{kind, id, owner_id, label, hours, status, due_text, updated_at, provenance}], review_history[{version, gate, score, at}], timestamps{accepted_at, started_at, finished_at, updated_at}, error{code, message}|null.
>
> Rules: unknown numbers are null, not 0. Missing readiness on a legacy case is NOT_CHECKED. `source_quote` is a short excerpt only, never the full notes. `tool_evidence` comes only from observed `intermediateSteps` of Agent 2, never from the agent's own claims. `records` is a minimal summary of retrieved rows, not raw rows. Respond with Content-Type application/json and Cache-Control no-store; 404 for unknown job IDs. The POST must return 202 `{job_id, execution_status:"ACCEPTED", schema_version:"1"}` only after the AR_Jobs row is saved and read back; 200 with the same body for a repeated request_id with the same input fingerprint; 409 for the same request_id with different input. Update the "Website Integration Contract" sticky note with this shape.

## 5. Switching the website to live mode

1. In n8n, publish the workflow so the production webhook URLs are active.
2. In `web/.env.local`, set `ACTIONREADY_MODE=live`, `N8N_WEBHOOK_BASE`, `N8N_WEBHOOK_HEADER_NAME` and `N8N_WEBHOOK_SECRET`.
3. Restart with `npm run build && npm start`. If any setting is missing, every page shows **Disconnected** and submission is disabled. The app never falls back to demo data.
4. Run the overload notes (§6 of `docs/TEST_PLAN.md`) with Gmail and approval disabled in the workflow.

## 6. Known limitations (private single-owner demo)

- One owner, password login, 8-hour signed cookie. This is not multi-tenant authorization.
- The job registry is a local JSON file (`web/.data/jobs.json`) with serialized in-process writes. It needs a persistent disk, so it is not suitable for serverless or multi-instance hosting.
- Idempotency is checked in the app registry and, per Prompt 2, in AR_Jobs. Neither is an atomic, concurrency-safe guarantee. Public concurrent use would need a database with unique constraints.
- The Overview lists only jobs submitted through this app. Older chat-path cases remain in the n8n HTML report.
