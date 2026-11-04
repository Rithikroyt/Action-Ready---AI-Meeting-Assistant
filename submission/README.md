# ActionReady — Week 3 submission

## Files

| File | What it is |
|---|---|
| `ActionReady_Week3_Sanitized_Submission.json` | The complete n8n workflow (141 nodes, all connections and sticky notes), exported from the live published version `3ccd52ea`, with personal and instance-specific values redacted. |
| [`../fixtures/AR_Commitments.seed.csv`](../fixtures/AR_Commitments.seed.csv) | Synthetic commitment register. All rows are `SYNTHETIC_DEMO`. |
| [`../fixtures/AR_Capacity.seed.csv`](../fixtures/AR_Capacity.seed.csv) | Synthetic capacity records. All rows are `SYNTHETIC_DEMO`. |

The live tests used only Maya's rows: commitment `CMT-ATLAS-0007` (6 h, open, confirmed) and capacity `CAP-ATLAS-maya-2026W45` (8 h), both for project `DEMO_ATLAS` and the period 2026-11-02 to 2026-11-06. These IDs are rows in the data tables, so they appear in the execution evidence below rather than in the workflow file.

## Week 3 architecture in the workflow

- **Agent 1 - Meeting Writer** (gpt-4o-mini) extracts actions, with source quotes, from the notes. Its TEAM CAPACITY RULE requires missing capacity to be `null`, never 0.
- **Agent 2 - Evidence Reviewer** (gpt-5-mini) has three tools:
  - `Source_Evidence`: the original notes
  - `Commitment_Register`: a lookup in AR_Commitments
  - `Capacity_Lookup`: a lookup in AR_Capacity
- **Evaluate Reviewer and Gate** contains the evidence-boundary guards:
  - `REVIEWER_SOURCE_EVIDENCE_INVALID`
  - `REVIEWER_BUSINESS_CONTEXT_AS_MEETING_FACT`: register rows are business context, never meeting facts.
- **Operational Readiness Check** applies fixed rules to give READY, BLOCKED, UNKNOWN or NOT_CHECKED.
  - Tool use counts only when it is observed in the agent's recorded steps.
  - An empty Data Table result counts as a successful lookup with 0 rows, not a failed call.
- **Website Meeting Request** and **Website Job Status** are the website's webhooks, both protected by header authentication.
- **Safety flags:** `enable_gmail: false`, `enable_approval: false`, `dev_phase_lock: true`. AI review, readiness and human approval are kept as three separate states.

## Live evidence (synthetic data)

| Test | Execution | Case | Result |
|---|---|---|---|
| A — overload | 821 | AR2-821 | AI review PASS · **BLOCKED** · 6 h existing + 4 h new = 10 h vs 8 h, margin −2 h · all three tools called |
| B — missing capacity | 848 | AR2-848 | AI review PASS · **UNKNOWN** (`CAPACITY_MISSING`) · capacity and margin null · `Capacity_Lookup` called and EMPTY · `TOOL_EVIDENCE_MISSING` = NO |

## What was redacted

| Item | Replaced with |
|---|---|
| Test recipient email address (2×, in `Approval Settings`) | `redacted-test-recipient@example.com` |
| Gmail OAuth2 and Header Auth credential IDs and names | `REDACTED` plus a "connect your own" label (the credential type is kept) |
| 6 webhook IDs | `00000000-0000-4000-8000-00000000000N` |
| 6 data-table IDs | `REPLACE_WITH_<TABLE>_ID` (table names kept) |
| Workflow ID mentioned in the "Read Me" sticky note | `REDACTED_WORKFLOW_ID` |

**How the redaction was checked:** putting each original value back in place of its placeholder reproduces the live nodes byte for byte. No secret, token, API key or real email address remains.

**Before importing:** reconnect the two credentials, set the six table IDs, then copy the new **Website Job Status** production path into the website's `N8N_JOB_STATUS_PATH`.
