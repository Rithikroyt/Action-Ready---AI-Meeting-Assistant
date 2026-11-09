// WEEK 4 EMPLOYEE DRAFTS (shared): one fixed-template email per action owner, built ONLY from the reviewed
// version's validated actions. No model call. Identical copies live in Build Job Result and Authorize Dispatch,
// so the website previews exactly what the dispatcher will accept. Parity: web/src/lib/employeeDrafts.ts.
function employeeDrafts(cand, caseId, version) {
  const clean = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const title = clean(cand && cand.meeting_title, 150) || 'our recent meeting';
  const acts = (cand && Array.isArray(cand.actions) ? cand.actions : []).slice(0, 30);
  const groups = [];
  for (const a of acts) {
    const owner = clean(a && a.owner, 120);
    const task = clean(a && a.task, 300);
    if (!owner || !task) continue;
    let g = groups.find((x) => x.key === owner.toLowerCase());
    if (!g) groups.push((g = { key: owner.toLowerCase(), employee: owner, items: [] }));
    g.items.push({ id: clean(a.id, 20) || null, task, due: clean(a.due_text, 120), hours: typeof a.estimated_hours === 'number' && isFinite(a.estimated_hours) ? a.estimated_hours : null });
  }
  return groups.slice(0, 12).map((g) => {
    const n = g.items.length;
    const known = g.items.filter((i) => i.hours !== null);
    const total = Math.round(known.reduce((s, i) => s + i.hours, 0) * 100) / 100;
    const lines = g.items.map((i) => '- ' + i.task + (i.due ? ' (due: ' + i.due + ')' : ' (no due date given)') + (i.hours !== null ? ', estimated ' + i.hours + ' h' : ''));
    const body = [
      'Hi ' + g.employee.split(' ')[0] + ',',
      '',
      (n === 1 ? 'Here is the action item assigned to you' : 'Here are the ' + n + ' action items assigned to you') + ' in ' + title + ':',
      '',
      ...lines,
      '',
      known.length === n ? 'Total estimated effort: ' + total + ' h.' : 'Estimated effort is known for ' + known.length + ' of ' + n + ' items (' + total + ' h so far).',
      '',
      'These items were taken from the meeting notes, checked by ActionReady (AI review plus a capacity check), and approved by the organizer before this email was sent. If anything is wrong or unclear, please reply to this email.',
      '',
      'Reference: ' + caseId + ', version ' + version,
    ].join('\n');
    return { employee: g.employee, subject: 'Your action items: ' + title, body, action_ids: g.items.map((i) => i.id).filter(Boolean), action_count: n };
  });
}

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
let expected = { subject: c.latest_subject, body: c.latest_body };
if (req.employee !== null) {
  let cand = null;
  try { cand = JSON.parse(latest.evaluated_candidate_json || 'null'); } catch (e) { cand = null; }
  const d = employeeDrafts(cand, c.case_id, c.latest_version).find((x) => x.employee.toLowerCase() === req.employee.toLowerCase());
  if (!d) return refuse('EMPLOYEE_NOT_IN_DRAFT', 'No reviewed action items belong to ' + req.employee.slice(0, 60) + ' in this version.');
  expected = d;
}
if (expected.subject !== req.subject || expected.body !== req.body) return refuse('CONTENT_CHANGED', 'The message differs from the reviewed draft for this version. Reload and approve again.');
const today = new Date().toISOString().slice(0, 10);
const usedToday = disp.filter((r) => ['SENT', 'SENDING', 'UNCERTAIN'].includes(r.status) && String(r.approved_at || '').slice(0, 10) === today).reduce((n, r) => n + (typeof r.recipient_count === 'number' ? r.recipient_count : 1), 0);
if (usedToday + req.recipients.length > (S.daily_send_cap || 0)) return refuse('DAILY_LIMIT_REACHED', 'The daily send limit (' + S.daily_send_cap + ' recipients) would be exceeded. Nothing was sent.', 429);
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
      employee: req.employee || '',
      recipients: req.recipients.join(', '),
      recipient_count: req.recipients.length,
      subject: req.subject,
      body: req.body,
      dispatch_key: req.dispatch_key,
      approved_at: now,
    },
  },
];
