# Week 3 Submission Checklist (due 2026-11-03)

## Evidence to capture
- [ ] **Canvas screenshot** of `KTQmpWghSB2jid1T`, showing the labeled regions: intake and writer · Week 3 business context · reviewer and readiness · persistence · dashboard · website API · human approval (disabled).
- [ ] **Execution capture** of the LIVE overload run: Agent 2's `Commitment_Register` and `Capacity_Lookup` tool calls with returned record IDs, plus the readiness node output (10 h vs 8 h → BLOCKED). Include the n8n execution ID.
- [ ] **Failure capture:** the same notes with the capacity row deleted → UNKNOWN / CAPACITY_MISSING.
- [ ] **Website screenshots:** the case workspace for both runs (status trio, workload bar, evidence tab). Use LIVE mode for the submission, and label any DEMO screenshot as synthetic.

## Sanitized export
- [ ] Export the workflow and set `enable_approval: false` in `Approval Settings`.
- [ ] Remove the reviewer and recipient email addresses. Clear pinned data and execution data.
- [ ] Replace data-table IDs, credential IDs and webhook IDs with placeholders, and note them in rebinding instructions.
- [ ] Remove the Header Auth credential reference value (it should be a name only).
- [ ] State that the export **does not run without setup**: tables, credentials, models, Header Auth.

## Post content
- [ ] Tool and data source: `Commitment_Register` and `Capacity_Lookup`, read-only Data Table tools scoped by trusted project and period.
- [ ] Why they're needed: the notes alone show 4 h; only the register reveals the 6 h already committed.
- [ ] What they add beyond the model: deterministic arithmetic, record IDs and freshness, and blocking enforced in routing.
- [ ] Test and observed result: copy the real execution output, not the expected values.
- [ ] One risk or failure: missing capacity → UNKNOWN rather than a false READY.
- [ ] One improvement: a commitment-change comparison, for example "the register says Thursday, the notes say Friday".

## Before posting
- [ ] Nothing in the post or export contains personal inboxes, secrets, or real meeting content.
- [ ] Results are labeled LIVE / OFFLINE / DEMO accurately.
