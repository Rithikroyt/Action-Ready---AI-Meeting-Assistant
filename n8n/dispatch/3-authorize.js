// Authorize a send for the EXACT current version. Every rule is enforced here, server-side; the browser is never
// the only check. A repeated dispatch_key returns the recorded outcome and never sends again.
const req = $('Validate Dispatch Request').first().json;
const S = req.settings;
const rows = (n) => $(n).all().map((i) => i.json || {});
const respond = (http, body) => [{ json: { action: 'RESPOND', http_status: http, response_body: { schema_version: '1', job_id: req.job_id, version: req.version, ...body } } }];
const refuse = (code, message, http = 409) => respond(http, { dispatch_status: 'REFUSED', error: { code, message } });
const disp = rows('Find Existing Dispatch');
if (disp.some((r) => r.error)) return refuse('STORAGE_UNAVAILABLE', 'Dispatch records could not be read. Nothing was sent.', 503);
const prior = disp.filter((r) => r.dispatch_key === req.dispatch_key).sort((a, b) => (a.id || 0) - (b.id || 0));
if (prior.length)
  return respond(200, {
    dispatch_status: prior[0].status || 'UNKNOWN',
    gmail_message_id: prior[0].gmail_message_id || null,
    recipient_count: typeof prior[0].recipient_count === 'number' ? prior[0].recipient_count : null,
    replay: true,
    note: 'This exact approval was already processed; nothing was sent again.',
  });
const jobRows = rows('Read Dispatch Job');
const caseRows = rows('Read Dispatch Case');
const verRows = rows('Read Dispatch Versions');
if ([...jobRows, ...caseRows, ...verRows].some((r) => r.error)) return refuse('STORAGE_UNAVAILABLE', 'Case records could not be read. Nothing was sent.', 503);
const jobs = jobRows.filter((r) => r.job_id === req.job_id);
if (jobs.length !== 1) return refuse('JOB_NOT_FOUND', 'No single stored job has this ID.', 404);
const job = jobs[0];
if (job.execution_status !== 'SUCCEEDED') return refuse('JOB_NOT_FINAL', 'The analysis has not finished successfully.');
const cases = caseRows.filter((r) => job.case_id && r.case_id === job.case_id);
if (cases.length !== 1) return refuse('CASE_NOT_FOUND', 'No single stored case for this job.', 404);
const c = cases[0];
const versions = verRows.filter((r) => r.case_id === c.case_id && typeof r.version === 'number').sort((a, b) => a.version - b.version);
const latest = versions[versions.length - 1];
if (!latest || latest.version !== req.version || c.latest_version !== req.version)
  return refuse('VERSION_NOT_CURRENT', 'Approval applies only to the current version' + (latest ? ' (v' + latest.version + ')' : '') + '. Reload and review again.');
if (String(latest.gate) !== 'PASS') return refuse('AI_REVIEW_NOT_PASSED', 'Only a version that passed AI review can be sent.');
if (c.readiness_status !== 'READY') return refuse('NOT_READY', 'Operational readiness is ' + (c.readiness_status || 'unknown') + '. Only READY plans can be sent.');
let rd = null;
try {
  rd = JSON.parse(c.readiness_json || 'null');
} catch (e) {
  rd = null;
}
if (!rd || Number(rd.checked_version) !== req.version) return refuse('READINESS_NOT_CURRENT', 'The readiness check does not belong to this version.');
if (rd.routing && rd.routing.route_id !== 'APPROVAL') return refuse('NOT_ROUTED_TO_APPROVAL', 'The Coordinator routed this case to ' + (rd.routing.label || rd.routing.route_id) + ', not to approval.');
if (c.latest_subject !== req.subject || c.latest_body !== req.body) return refuse('CONTENT_CHANGED', 'The message differs from the reviewed draft for this version. Reload and approve again.');
if (S.send_enabled !== true)
  return respond(403, {
    dispatch_status: 'SEND_DISABLED',
    recipient_count: req.recipients.length,
    error: { code: 'SEND_DISABLED', message: 'All checks passed, but sending is switched off in Week 4 Dispatch Settings. Nothing was sent.' },
  });
const now = new Date().toISOString();
return [
  {
    json: {
      action: 'SEND',
      claim_id: 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
      job_id: req.job_id,
      case_id: c.case_id,
      version: req.version,
      recipients: req.recipients.join(', '),
      recipient_count: req.recipients.length,
      subject: req.subject,
      body: req.body,
      dispatch_key: req.dispatch_key,
      approved_at: now,
    },
  },
];
