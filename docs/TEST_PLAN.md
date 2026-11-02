# Week 3 Test Plan and Results

Labels: **OFFLINE** = pure code, no network · **MOCKED** = fake HTTP · **LOCAL-SERVER** = the real Next.js server in DEMO mode · **LIVE** = the real n8n workflow · **NOT_RUN** = specified but not executed.

Fixtures are synthetic test specifications (`web/src/lib/fixtures.ts`, exported to `fixtures/`). A fixture's expected outcome is not evidence that a test passed.

## 1. Executed on 2026-11-02

| Suite | Label | Result |
|---|---|---|
| `web/tests/readiness.test.ts` — 15 fixture scenarios plus guards | OFFLINE | 29 passed |
| `web/tests/contract.test.ts` — submission validation, response allowlist | OFFLINE | 12 passed |
| `web/tests/n8n-adapter.test.ts` — status mapping, secret handling, no retry | MOCKED | 11 passed (now 14, see below) |
| `web/tests/smoke.server.test.ts` — auth, origin, overload, failure, idempotency, 404, no-store | LOCAL-SERVER (DEMO) | 7 passed |
| Headless Edge walkthrough: login → example → submit → case tabs → overview → 390 px mobile | LOCAL-SERVER (DEMO) | 0 console errors, 0 px horizontal overflow |
| `web/tests/preflight.test.ts` — Pre-submit Notes Check (local heuristic only; not AI verification) | OFFLINE | 14 passed |
| `web/tests/whatif.test.ts` — What-If Workspace (local non-mutating simulation; official readiness remains the n8n result) | OFFLINE | 10 passed |
| Headless Edge: preflight panel, warning confirm, no API calls while typing; what-if 6+2→READY, cap 10→READY, −3→UNKNOWN, reset, 0 network requests while simulating, official stays BLOCKED | LOCAL-SERVER (DEMO) | all checks as expected |
| `web/tests/live-contract.test.ts` — the actual n8n `Build Job Result` shape (BLOCKED, UNKNOWN, in-flight), field mapping, severity mapping, null preservation, excerpt matching, what-if on the live shape | OFFLINE | 16 passed |
| `web/tests/n8n-adapter.test.ts` — status URL with the n8n webhook-ID prefix; path normalization and rejection (added to the existing suite) | OFFLINE / MOCKED | 14 passed (3 new) |
| `tsc --noEmit`, `next build` | OFFLINE | clean |

Live-shape fixtures are synthetic copies of the field structure produced by `Build Job Result` (audited 2026-11-02). They show the website can read that shape; they are not evidence that a live run produced those values.

Re-run: `cd web && npm test`. For the server smoke test, run `npm run build && npm start`, then `SMOKE_URL=http://localhost:3000 SESSION_SECRET=… npx vitest run tests/smoke.server.test.ts`.

Neither helper feature is part of the Week 3 graded tool execution. The graded evidence is the LIVE n8n run in §3.

### Helper-feature coverage (OFFLINE)
| # | Case | Expected |
|---|---|---|
| 1–2 | Empty notes / missing period | ERROR, cannot submit |
| 3 | Complete sample | no errors, no warnings |
| 4–5 | Missing hours / deadline | WARNING |
| 6 | Warnings only | submission allowed |
| 7 | Preflight | no `fetch` call |
| 8–10 | 6+4 vs 8 / 6+2 vs 8 / 6+4 vs 10 | BLOCKED / READY / READY |
| 11–12 | Missing capacity / negative input | UNKNOWN |
| 13 | Simulation | official object unchanged (frozen) |
| 14 | Simulation | no `fetch` call |
| 15 | Reset | returns official 4 h / 8 h |
| 16 | Demo overload after simulated READY | official still BLOCKED |

## 2. Scenario coverage (OFFLINE, against the reference rules)

| Scenario | Expected | Key code |
|---|---|---|
| overload: 6 + 4 vs 8 | BLOCKED, margin −2 | OVER_CAPACITY |
| within: 6 + 1 vs 8 | READY, margin +1 | — |
| missing-capacity | UNKNOWN, capacity null | CAPACITY_MISSING |
| stale-capacity | UNKNOWN | STALE_RECORD |
| wrong-period | UNKNOWN (empty register is a valid zero; capacity missing) | CAPACITY_MISSING |
| cross-project row | UNKNOWN, row discarded | SCOPE_MISMATCH |
| injection text in a record | BLOCKED (numbers unchanged) | OVER_CAPACITY |
| read-failed | UNKNOWN, not zero work | RETRIEVAL_FAILED |
| truncated read | UNKNOWN | TRUNCATED_READ |
| missing estimate | UNKNOWN | ESTIMATE_MISSING |
| lower-bound overload plus missing estimate | BLOCKED (the blocker survives the unknown) | OVER_CAPACITY |
| register-conflict (same ID, different hours) | BLOCKED | REGISTER_CONFLICT |
| possible duplicate | UNKNOWN, counted, not merged | POSSIBLE_DUPLICATE |
| stable-ID deadline change | UNKNOWN, not double-counted | DEADLINE_CHANGE |
| ambiguous owner | UNKNOWN | OWNER_AMBIGUOUS |
| tool calls absent / failed / mismatched (live rule) | UNKNOWN | TOOL_EVIDENCE_MISSING / CONTEXT_CHANGED |
| repeated submission | same job; different input → 409 | LOCAL-SERVER |
| browser-supplied `project_id` | rejected 422 | LOCAL-SERVER |

## 3. NOT_RUN — needs the live workflow (after the AI Builder changes)

Run with `enable_gmail=false` and `enable_approval=false`. Record the n8n execution ID for each.

1. **Overload (headline).** Seed `fixtures/AR_*.seed.csv` and submit the overload notes. Capture the Agent 2 `intermediateSteps` showing `Commitment_Register(owner_id=maya)` → CMT-ATLAS-0007 and `Capacity_Lookup(owner_id=maya)` → 8 h. The readiness node computes 10 h against 8 h, the result is BLOCKED, approval is NOT_GIVEN, and nothing is sent.
2. **Failure demo.** Delete Maya's AR_Capacity row and re-run the same notes. Expected: UNKNOWN / CAPACITY_MISSING, never zero, unlimited, or approved.
3. **Within capacity** (1 h task) → READY, still not approved.
4. **Missing deadline** in the notes → existing NEEDS_CLARIFICATION behaviour is retained.
5. **Writer omission** (`test_fixture: omit_last_action_line_v1`) → bounded revision, maximum 3 versions.
6. **Persistence failure** (temporarily point the readback at a wrong table) → FAILED, never SUCCEEDED.
7. **Repeated request_id**: same body → same job_id without a new execution; changed body → 409.
8. **Stale approval**: change a capacity row after a READY result, then start approval → blocked.
9. **Legacy case** from Week 2 displays NOT_CHECKED.
