# Synthetic Week 3 data (Demo Atlas)

All records are **invented** (`data_provenance = SYNTHETIC_DEMO`). They exist to demonstrate proprietary-data retrieval without real company information. The files are generated from `web/src/lib/fixtures.ts`; regenerate with `cd web && npm run fixtures:export`.

| File | Use |
|---|---|
| `AR_Commitments.seed.csv` | Rows for the `AR_Commitments` Data Table |
| `AR_Capacity.seed.csv` | Rows for the `AR_Capacity` Data Table |
| `scenarios.json` | Test notes, synthetic extraction and expected outcome for every scenario |

## Table setup in n8n

Create both tables in the same project as `AR_YD_Cases`. Column types:

- **AR_Commitments:** `commitment_id`, `project_id`, `owner_id`, `task`, `due_text`, `period_start`, `period_end`, `task_status`, `confirmation_state`, `source_ref`, `data_provenance` are **string**. `remaining_hours` is **number**. `updated_at` is **date**.
- **AR_Capacity:** `capacity_id`, `project_id`, `owner_id`, `period_start`, `period_end`, `capacity_basis`, `source_ref`, `data_provenance` are **string**. `available_hours` is **number**. `updated_at` is **date**.

`period_start` and `period_end` are `YYYY-MM-DD` strings, so equality filters are exact.

Seed only the rows in these CSVs. Do not copy Week 2 drafts into `AR_Commitments`: an unapproved draft is not a confirmed commitment.

**Freshness:** rows are stamped `2026-10-30`. With the 14-day freshness policy they count as current until about 2026-11-13. After that, live runs will correctly report STALE_RECORD unless `updated_at` is refreshed.

**Failure demonstration:** delete the `CAP-ATLAS-maya-2026W45` row and run the overload notes again. The website's demo mode uses a separately labeled example for this.
