# ActionReady UI architecture (v0.4, decision-first)

> From meeting notes to verified, feasible action.

The website displays, explains, filters and simulates. The n8n workflow is authoritative for the writer and reviewer output, tool evidence, operational readiness, workload numbers, approval state, case history and any side effect. The frontend never upgrades a status, fills a missing number, marks anything approved, or substitutes demo data when live mode fails.

## Route map
| Route | Purpose | Data |
|---|---|---|
| `/login` | Single-owner passphrase sign-in | server action |
| `/` | Overview: counts, search, filters, sort, recent cases with the primary reason | server: `overview()` → `toCaseRow()`; client: `CaseList` (pure filtering) |
| `/meetings/new` | Notes (paste or `.txt`), explicit period, read-only project, synthetic examples, pre-submit check | POST `/api/meetings` |
| `/cases/[jobId]` | Decision-first case workspace | server first render; client polls GET `/api/jobs/:id` until the job is final |
| `/api/meetings`, `/api/jobs/[jobId]` | Server-only adapters to n8n (secret stays on the server) | unchanged in v0.4 |

## Case workspace hierarchy
1. **Case header**: title or a safe fallback, environment, case ID, execution status, official version, period, updated time. The job ID is under *Technical details*.
2. **Three official status cards**: AI review · Operational readiness · Human approval. They are never merged.
3. **Decision card** (`lib/decision.ts`): the official conclusion in plain language, why, and the decision needed. When the AI review is invalid, the readiness conclusion still appears separately ("decided independently").
4. **Workload calculation**: existing + new = projected vs recorded project capacity, with an accessible bar and formulas. Unknown values read *Not verified* or *Not available*, never 0.
5. **Extracted actions** (a table, or stacked cards under 640 px) and the **draft** ("Reviewed draft — not sent"). If the review gate rejected the version, both carry an **Unvalidated version** warning.
6. **Tabs**: Evidence (meeting excerpt, business records, tool calls), Workload (commitments, new work, formulas, reasons), Review history (recorded versions only).
7. **What-If simulation**: local and non-mutating. The official pane has a solid border, the simulation a dashed one.
8. **Technical details** (collapsed): job ID, schema version, provenance, timestamps.

## Component map
| Component | File | Notes |
|---|---|---|
| `AppShell` | `components/AppShell.tsx` | sidebar, top bar with the always-visible environment badge, demo and disconnected banners |
| `StatusBadge`, `StatusSummary`, `StatusGlyph` | `components/StatusBadge.tsx` | icon + text + screen-reader phrase |
| `ReadinessBadge`, `ReviewBadge`, `ApprovalBadge`, `ModeBadge` | `components/Badges.tsx` | thin wrappers over `lib/status.ts`; `ModeBadge` covers Synthetic demo, Live n8n and Disconnected |
| `DecisionCard` | `components/DecisionCard.tsx` | primary and secondary conclusions, recorded reasons, workflow questions |
| `WorkloadBar`, `workloadFormulas` | `components/WorkloadBar.tsx` | existing, new, overflow, capacity marker; null-safe labels |
| `WhatIf` | `components/WhatIf.tsx` | unchanged behaviour; uses display names |
| `RelTime`, `LocalTime` | `components/Time.tsx` | render after mount, so server HTML and hydration match |
| `CaseList` | `app/CaseList.tsx` | search, filters, sort, empty and no-result states |
| `CaseWorkspace` (+ `CaseHeader`, `Processing`, `ActionList`, `DraftPanel`, `EvidencePanel`, `WorkloadDetail`, `History`, `TechnicalDetails`) | `app/cases/[jobId]/CaseWorkspace.tsx` | polling logic unchanged |

## Status definitions (`lib/status.ts`, the single source)
| Family | States |
|---|---|
| Execution | Accepted · Running · Analysis complete · Failed · Status unknown (stale) |
| AI review | Pass · Revision limit reached · Needs clarification · Technical review · Pending · Not run |
| Operational readiness | Ready · Blocked · Unknown · Not checked |
| Human approval | Not requested · Pending · Approved · Changes requested · Rejected · Expired · Draft created · Unknown |

Each state has a label, tone, icon, description and screen-reader phrase. A rubric score is shown as official only when the review passed: "Reviewer rubric score: 5.0 / 5 — a rubric, not a probability of correctness."

## Design tokens
Canvas `#F7F7F5` · surface `#FFFFFF` · text `#171A23` · secondary `#667085` · border `#E4E7EC` · indigo `#4F46E5` / hover `#4338CA` · ready `#0F766E` · blocked `#B42318` · unknown `#A16207` · neutral `#475467`, with soft backgrounds for each tone. Numbers use tabular numerals, and IDs use monospace.

## Accessibility and responsive behaviour
- **Structure:** semantic landmarks and a skip link; one `h1` per page.
- **Status meaning:** every badge has an icon, visible text and screen-reader text. Colour is never the only signal.
- **Keyboard:** ARIA tabs support ←/→/Home/End; the action table supports ↑/↓/Enter; focus rings are visible.
- **Live regions:** filters announce the shown count; the decision card and processing state are `aria-live`.
- **Workload bar:** has a full `aria-label` sentence.
- **Motion:** `prefers-reduced-motion` reduces animation to effectively zero.
- **Widths tested:** 1440, 1280, 1024, 768, 390 and 360 px, all with 0 px horizontal overflow. Status cards stack and actions become cards on phones.

## Known limitations
- Live responses return record IDs only (no labels or hours) and no `meeting_title` or `period`, so the UI shows "Record detail is limited" and safe fallbacks.
- The live response doesn't report the `Source_Evidence` call, so the Evidence tab says "Not reported in this response" rather than claiming it.
- The Overview lists only jobs submitted through this app (local registry).
