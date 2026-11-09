# ActionReady 4.0: Meeting-to-Execution Coordinator (Week 4 build brief)

**The Week 4 question:** Week 3 asked "Is this action plan accurate and feasible?". Week 4 asks "Who needs to act next, who can approve it, and how does approved work reach the team?"

The goal is role-based routing and human-controlled follow-through. Adding agents for appearance is not the goal.

## Non-negotiable boundaries

- **One canvas:** all n8n work stays on workflow `KTQmpWghSB2jid1T`. That includes every new trigger, route, approval lane, Sheets operation and dispatch step. No replacement workflows, no sub-workflows, and no dependency on the Yellowdig Newsletter project.
- **Week 3 stays as it is:** keep the agents, models, guards, tool evidence, null-capacity handling, empty-result parser, version controls and recorded tests.
- **Frontend:** extend the existing decision-first workspace. Do not rewrite it or the landing page.
- **Live actions need authorization:** real sends, spreadsheet writes, n8n publishing, spreadsheet-sharing changes and merges to `main` all wait for the owner's explicit authorization of that stage.
- **Cost:** use offline fixtures and mocked providers during development. Never run a model just to test routing, the UI, Sheet mapping or approval logic.

## Roles

| Role | Responsibility |
|---|---|
| Requester | Supplies complete meeting notes and answers clarification questions |
| Writer / Reviewer (AI) | Extract the plan, then verify it against the notes (Week 3) |
| Coordinator | Routes each official result to the next responsible role, using fixed rules |
| Technical reviewer | Holds results whose AI output or evidence could not be validated |
| Manager | Resolves capacity conflicts (BLOCKED) |
| Data steward | Fixes missing, stale or ambiguous business records |
| Approver | Approves the exact tasks, message and recipients for one version |
| Dispatcher | Publishes approved tasks and sends the approved message (a guarded step) |
| Employee | Updates task status and progress notes in the tracker, and nothing else |

## Coordinator routing

The Coordinator is fixed-rule code followed by an n8n Switch node. It is not another generative agent. It reads only the validated official result and never an invented confidence score.

| Condition | Next role | Behaviour |
|---|---|---|
| Missing owner, deadline or other needed fact | Requester | Ask for clarification |
| AI output fails validation | Technical reviewer | Hold the case and publish nothing |
| Workload exceeds capacity | Manager | Explain the overload and request a decision |
| Capacity cannot be verified | Data steward | Request the missing record; never assume availability |
| AI review passes and readiness is current and READY | Approver | Open the exact task and email preview |
| Exact version approved and dispatch confirmed | Dispatcher | Publish the tasks and send the approved message |

## Architecture

| Component | Responsibility |
|---|---|
| Vercel / Next.js | Interface, authenticated sessions, server-side API adapter |
| Supabase (Auth + Postgres) | Accounts, workspace membership, case ownership, immutable approvals, dispatch records |
| n8n (`KTQmpWghSB2jid1T`) | AI processing, evidence checks, routing, guarded external actions |
| Google Sheets | Employee-facing task tracker |
| Gmail | Delivery of approved messages |

**Durable storage first:** real accounts and sending need durable ownership and approval records. Vercel's `/tmp` is scratch space and must not hold them. The public synthetic demo can stay open, but its routes must never reach real email or tracker writes.

**Sign-in and Gmail are separate:**
- Google sign-in identifies the user. Gmail access is a separate authorization.
- The pilot has one authorized organizer, one Gmail credential connected in n8n, one workspace and one tracker.
- Do not advertise "anyone can sign in and send from their Gmail".
- Request the narrowest scope, preferring send-only (`gmail.send` is a sensitive scope, `gmail.compose` is restricted). Inspect the real credential scopes rather than assuming them.

## Task tracker (the existing Google Sheet, "ActionReady — Weekly Tasks Tracker")

**Structure:** a `Tasks` tab and a `Lists` tab for dropdown values. Do not create a new spreadsheet every week.

**Columns:** Task ID · Meeting · Owner · Email · Task · Due wording · Due date · Estimate (h) · Status · Update note · Case ID · Version · Approval state · Email state · Last synced.

**Dates:** keep the due wording exactly as the meeting said it. Fill Due date only when that wording normalizes unambiguously.

**Employee edits:** employees may change only Status (Not started, In progress, Blocked, Completed, Cancelled) and Update note. Protect the other columns.

**Authorization lives in the backend, never in the Sheet:**
- A Sheet cell saying "Approved" never authorizes anything.
- Sheet protection is not a confidentiality boundary, so share only with named, trusted collaborators.

**Publishing** happens only after approval:
1. Assign a stable task ID.
2. Append or update the row, matched on that task ID, never on a row number.
3. Read the row back and verify it.
4. Record the publication result.

Write values as RAW, so meeting text is never read as a formula. Never overwrite an employee's status when syncing other fields.

**Reconciliation branch** (same canvas):
- It accepts only permitted status and note changes, for a valid task ID, and records each one.
- It never re-runs the AI and never sends email.
- It records an update as received from Google Sheets unless a verified editor identity is available.

## Review & Send

The order is: prepare the draft, enter the recipients, review the exact content and recipients, approve, then send. **The recipients are part of what is approved.** Changing the recipient, message, sender or included tasks invalidates the approval.

The message is built from validated action records using a fixed template, so no extra AI call is needed.

**The backend requires all of these before sending:** a valid AI review, a current READY result, the exact approved version, an authorized sender, and explicit send confirmation. The browser is never the only place these are enforced.

**No duplicate or misleading sends:**
- **One send per request:** a durable dispatch record with a unique request key and a conditional state change means a double-click returns the existing dispatch instead of sending again.
- **Report each outcome separately:** for example "Tracker: Published" and "Email: Failed — needs attention".
- **Timeouts:** if Gmail times out, the status is "Delivery status uncertain — check before retrying". Never resend automatically.
- **Honest labels:** record Gmail's message receipt, but never call a message "delivered" or "read".
- **No undo:** no "Undo send" unless a durable, cancellable delay is actually implemented.

## UI priorities (keep the current visual identity)

1. A "Needs your attention" queue, grouped by the next responsible role, with the reason each case is there.
2. The next responsible role on every case, with a "Why this route?" evidence drawer.
3. A focused Review & Send preview: recipients list, exact message, readiness and approval summary. Use a modal only for the final approval.
4. A Task Tracker that is honest about synchronization, with task status, readiness, approval and email state shown separately.
5. Separate indicators for Google sign-in, Gmail connection and Sheets connection.

Use GPI (granti-rouge.vercel.app) as a reference for narrative hierarchy and evidence presentation only: no assets, and no claims about interactions nobody tested.

## Safeguards carried forward

- Business records never become meeting facts.
- Missing capacity is unknown, never zero.
- An empty tool result is distinct from a failed or missing call.
- Rejected versions stay visibly unvalidated.
- Approval applies only to the exact current version.
- **New rule:** approved tasks that become confirmed commitments get stable IDs and are counted once. A later readiness re-check must never count the same task as both existing and new work.

## Stages

**A. Coordinator and role-based queues.** This is the graded Week 4 core. Test routing over the recorded Week 3 cases, and label those as routing tests over recorded evidence, not new AI runs.

**B. Google sign-in and durable ownership.** This replaces the single password and local `jobs.json` for the authenticated pilot. The public synthetic demo stays separate.

**C. Approved task publication.** The fixed Sheet schema and dropdowns, publication with read-back, and constrained status reconciliation.

**D. Reviewed email sending.** Exact-message approval through the single organizer's Gmail connection. Sending stays disabled until the authorization checks and offline tests pass.

**E. Finish the new screens.** Review & Send, the attention queue, the Task Tracker and Connections. Do not redesign the homepage.

### Bounded live acceptance (after D)

- A valid READY plan routes to approval. An explicit approval then publishes exactly one task and sends exactly one message, to an inbox the owner controls.
- A BLOCKED or UNKNOWN plan routes to manager or data review, and no email is sent.
- An invalid or stale approval, or a duplicate click, is rejected or returns the existing dispatch. Nothing is sent twice.
- One permitted Sheet status update is reconciled without re-running the AI.
- Do not use the overloaded 6 + 4 vs 8 case to demonstrate a successful send. Use a genuinely feasible, newly reviewed case.
- Keep the 2–6 November fixtures, but remove the assumption that every case uses that single week.

## Current status (updated 2026-11-08)

| Stage | Status |
|---|---|
| A | **Done and live.** The n8n Coordinator was published as version `2a6ac61a` on 2026-11-09, and the website queue and route panel are deployed. |
| D | **Built, with sending switched off.** The guarded `actionready/v1/dispatch` branch, the `AR_Dispatches` table, and the website's Review & Send page and API are in place. The n8n branch is an unpublished draft (`9d7d2661`). |
| B, C, E | Not started. C needs a Google Sheets credential in n8n. B and the Vercel live mode are below. |

**Before the first real send:**
1. Publish the n8n draft.
2. Set the allowed recipients in `Week 4 Dispatch Settings`, then set `send_enabled: true`.
3. Run one live analysis of a genuinely feasible (READY) meeting, then send exactly one message to an inbox the owner controls.

**One limit:** on Vercel, live-mode ownership still relies on the app's temporary job registry. Until Stage B lists cases from n8n, Review & Send for live cases is dependable only when the app runs locally or on a host with a persistent disk.

**What Stage A includes:**
- **Routing rules:** `web/src/lib/coordinator.ts` is the reference implementation and executable spec for the n8n Coordinator node. `web/tests/coordinator.test.ts` covers every synthetic scenario, the recorded live shapes (AR2-821, AR2-848, AR2-837 and AR2-832), and an exhaustive check that only a passing review with a READY result reaches the Approver.
- **UI:** the "Needs your attention" queue on `/dashboard`, and the next-responsible-role strip with its "Why this route?" drawer on each case.
- **Labelling:** routes are computed by the app from the official result, and the drawer says so. The website should switch to the workflow-recorded route once the n8n Coordinator is deployed.

**Blockers:**
- **n8n draft drift:** the workflow's draft (`63b4421f`, saved 2026-11-04) differs from the published version (`3ccd52ea`). The workflow name changed too. Publishing any Week 4 node would also publish those changes, so the owner must review them first.
- **Missing Google Sheets credential:** n8n has no Google Sheets credential. The only Google credentials are a Gmail OAuth2 connection and a Gemini key.
- **No Supabase project:** none exists yet. Stage B needs one, plus a Google OAuth client, both created by the owner.
- **Sheet not inspected:** the Google Sheet hasn't been read yet, because no Sheets connector or credential is available.
- **Fixed planning period:** n8n's `Validate Website Request` still accepts only 2026-11-02 to 2026-11-06.
