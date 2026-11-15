# Week 5 screenshot guide

Website screenshots 03–07 in `screenshots/` were captured automatically from `/visibility` rendering the REAL stored runs (`live-results.json`, exported read-only from n8n) — not the synthetic sample.
n8n canvas/execution screenshots need your logged-in n8n editor — take them by hand (steps below).

**Before every capture:** crop or hide the browser address bar on n8n (it shows the private instance host);
make sure no email address, header name or credential is visible.

| # | File | Where | What must be visible |
|---|---|---|---|
| 01 | `01-n8n-week5-canvas.png` | n8n → ActionReady workflow → scroll to the **WEEK 5 · AI MARKET VISIBILITY & AGENT READINESS** sticky (below the Week 4 Team branch) | the sticky note, Validate → Prompt Corpus → Prepare Runs → Loop → Model Switch → Gemini A/B → Parse → Code Run Outcome → Persist, and Aggregate / Readability Audit |
| 02 | `02-n8n-week5-execution.png` | n8n → Executions → the CONTEXT experiment execution → open **W5 · Parse Recommendation** (or Code Run Outcome) | one run's prompt, model, the structured JSON and the coded outcome (`ar_mentioned`, `ar_recommended`, `ar_unsupported`) |
| 03 | `03-visibility-dashboard.png` | website `/visibility` (top) | KPI cards with *k of n*, the funnel |
| 04 | `04-before-after-agent-profile.png` | `/visibility` → “Before → after: structured profile” | COPY vs STRUCTURED dumbbells |
| 05 | `05-prompt-sensitivity.png` | `/visibility` → “Prompt sensitivity” | Open / Constrained / Delegated rows |
| 06 | `06-agent-readability-scorecard.png` | `/visibility` → scorecard + “What should improve” | the deterministic score, sections, rule-based improvements |
| 07 | `07-negative-capability-P08.png` | `/visibility` → “Cold recall & negative control”, or Run Explorer filtered to P08 | ActionReady rejected for transcription / auto-send |
