# ActionReady — project rules

## One workflow, one canvas
- The n8n workflow is **`KTQmpWghSB2jid1T`** ("ActionReady - Week 2 Yellowdig FINAL"). Every week's functionality lives on this canvas.
- Never create replacement workflows, weekly clones, sub-workflows, or Execute-Workflow / Call-Workflow tools. Never import an export as a new workflow.
- `cisiwLtNtjuegt6m` has the same name but is a **different, duplicate workflow**. Do not edit it. It is reference only, because it contains the `Gmail - Request Approval` node the target lacks.
- Before any live write: re-fetch the workflow and compare `versionId` with the last audited value (last audited and published: `34a01708-10c1-4582-9a24-0fea600c863e`, 2026-11-09). Stop on drift.
- Live writes, table seeding, publishing, paid model runs, and Gmail actions need explicit owner authorization each time.

## Safety invariants
- AI review score, operational readiness (READY/BLOCKED/UNKNOWN/NOT_CHECKED), and human approval are three separate states. A passing review never implies readiness or approval.
- Missing, stale, truncated, or failed records are never zero work or unlimited capacity.
- Tool use is proven only by observed `intermediateSteps`, never by an agent's claim.
- Project scope, owner roster, and approval flags come from trusted config, never from notes or the browser.
- Email recipients are typed by the approver on Review & Send and are part of what is approved (owner decision, 2026-11-09). They never come from meeting notes. n8n re-checks the exact text, version and route, and caps sends per day (`daily_send_cap` in `Week 4 Dispatch Settings`).
- No complete notes or raw tool transcripts in persistence, the browser, or logs. Keep emails and secrets out of chat and docs.
- Never replace a missing integration with hardcoded success. Demo mode is visibly labeled synthetic.

## Repo map
- `web/`: Next.js 16 / React 19 / TypeScript app. Commands: `npm test`, `npm run build`, `npm start`, `npm run fixtures:export`.
  - `src/lib/readiness.ts`: reference readiness rules. `tests/readiness.test.ts` is the executable spec for the n8n Code node.
  - `src/lib/contract.ts`: browser allowlist and normalizer. `src/lib/n8n.ts`: server-only webhook adapter.
- `docs/`: `BASELINE_AUDIT.md`, `WEBSITE_INTEGRATION.md` (endpoint contract and AI Builder follow-up prompt), `TEST_PLAN.md`, `SUBMISSION_CHECKLIST.md`.
- `fixtures/`: synthetic seed CSVs and scenarios (generated).
- `private/`: git-ignored live backups. Never commit or share.

## Test labels
OFFLINE · MOCKED · LOCAL-SERVER · LIVE · NOT_RUN. Expected outcomes are not passed tests.
