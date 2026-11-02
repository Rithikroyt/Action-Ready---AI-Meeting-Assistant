# ActionReady — Commitment Control Center

ActionReady turns meeting notes into an action plan, then checks a question the notes alone can't answer:

> Are these commitments consistent with what the team already committed to, and is there enough recorded capacity?

- **Week 1:** extract commitments.
- **Week 2:** verify the draft against the notes.
- **Week 3:** check the plan against the commitment register and capacity records, and block it when the records don't support it.

## Pieces
| Part | Where |
|---|---|
| AI orchestration (writer, evidence reviewer, `Commitment_Register` / `Capacity_Lookup` tools, readiness, persistence) | n8n workflow `KTQmpWghSB2jid1T` (single canvas) |
| Web app (overview, new meeting, case workspace) | [`web/`](web/) |
| Endpoint contract | [`docs/WEBSITE_INTEGRATION.md`](docs/WEBSITE_INTEGRATION.md) |
| Tests and results | [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) |
| Synthetic data | [`fixtures/`](fixtures/) |

## Local helper features (not graded tool execution)
These run entirely in the browser. They make no n8n, model or tool call and never change the official result:
- **Pre-submit Notes Check** (New meeting): local heuristic only; not AI verification. It flags missing notes or period as errors, and a missing owner, deadline or estimate as warnings, before an AI run is spent. Warnings never block submission.
- **What-If Workspace** (Case page): local non-mutating simulation; official readiness remains the n8n result. You adjust new effort or capacity and see a hypothetical READY/BLOCKED, shown beside the unchanged official result.

The graded Week 3 tool evidence (`Commitment_Register`, `Capacity_Lookup`) comes only from the n8n workflow execution.

## Run the web app
```bash
cd web
cp .env.example .env.local   # fill in APP_PASSWORD and SESSION_SECRET; keep ACTIONREADY_MODE=demo to start
npm ci
npm test
npm run build && npm start   # http://localhost:3000
```
Demo mode runs only the labeled synthetic examples, locally, and says so on every page. Live mode calls the n8n webhooks; see the integration doc.

Private single-owner demonstration. Not a production multi-tenant system.
