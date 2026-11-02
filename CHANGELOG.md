# Changelog

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
