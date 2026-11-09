// Plan a tracker publication from STORED records only. A task is published only when its approval is evidenced by a
// SENT dispatch for this exact version: the owner's own draft, or the team summary (which covers every task).
// Task ID = <case>-<action id>: stable across versions, so a task is counted once and a re-sync updates its row.
const req = $('Validate Tracker Request').first().json;
const S = req.settings;
const rows = (n) => $(n).all().map((i) => i.json || {});
const respond = (http, code, message) => [{ json: { action: 'RESPOND', http_status: http, response_body: { schema_version: '1', job_id: req.job_id, version: req.version, tracker_status: 'REFUSED', error: { code, message } } } }];
const jobRows = rows('Read Tracker Job'), caseRows = rows('Read Tracker Case'), verRows = rows('Read Tracker Versions'), dispRows = rows('Read Tracker Dispatches');
if ([...jobRows, ...caseRows, ...verRows, ...dispRows].some((r) => r.error)) return respond(503, 'STORAGE_UNAVAILABLE', 'Case records could not be read. Nothing was published.');
const jobs = jobRows.filter((r) => r.job_id === req.job_id);
if (jobs.length !== 1) return respond(404, 'JOB_NOT_FOUND', 'No single stored job has this ID.');
const job = jobs[0];
const cases = caseRows.filter((r) => job.case_id && r.case_id === job.case_id);
if (cases.length !== 1) return respond(404, 'CASE_NOT_FOUND', 'No single stored case for this job.');
const c = cases[0];
const versions = verRows.filter((r) => r.case_id === c.case_id && typeof r.version === 'number').sort((a, b) => a.version - b.version);
const latest = versions[versions.length - 1];
if (!latest || latest.version !== req.version || c.latest_version !== req.version) return respond(409, 'VERSION_NOT_CURRENT', 'Only the current version can be published.');
if (String(latest.gate) !== 'PASS' || c.readiness_status !== 'READY') return respond(409, 'NOT_APPROVABLE', 'Only a version that passed AI review and is READY can be published.');
const sent = dispRows.filter((d) => d.job_id === req.job_id && d.version === req.version && d.status === 'SENT');
if (!sent.length) return respond(409, 'NOT_APPROVED', 'No approved message for this version has been sent yet, so no task is approved for the tracker.');
let cand = null;
try {
  cand = JSON.parse(latest.evaluated_candidate_json || 'null');
} catch (e) {
  cand = null;
}
const clean = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const title = clean(cand && cand.meeting_title, 150) || clean(c.meeting_title, 150) || 'Meeting';
const teamSent = sent.some((d) => !d.employee);
const byEmployee = {};
for (const d of sent) {
  if (!d.employee) continue;
  const k = String(d.employee).toLowerCase();
  (byEmployee[k] = byEmployee[k] || []).push(d);
}
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Due date only when the wording names exactly one unambiguous calendar date; otherwise blank (the wording is kept).
function dueDate(text) {
  const t = String(text || '');
  const iso = t.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const named = [...t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi)];
  if (iso.length + named.length !== 1) return '';
  if (iso.length) return iso[0];
  // "3 or 4 November 2026", "3-4 November": more than one day number or month means the date is ambiguous.
  const days = t.match(/\b\d{1,2}(?:st|nd|rd|th)?\b/g) || [];
  const months = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi) || [];
  if (days.length !== 1 || months.length !== 1) return '';
  const m = named[0];
  const mm = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  const dd = Number(m[1]);
  const d = new Date(Date.UTC(Number(m[3]), mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return '';
  return m[3] + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
}
const now = new Date().toISOString();
const tasks = [];
for (const a of (cand && Array.isArray(cand.actions) ? cand.actions : []).slice(0, 30)) {
  const owner = clean(a && a.owner, 120);
  const task = clean(a && a.task, 300);
  const id = clean(a && a.id, 20);
  if (!owner || !task || !id) continue;
  const own = byEmployee[owner.toLowerCase()] || [];
  if (!own.length && !teamSent) continue; // not approved yet: never published
  tasks.push({
    task_id: c.case_id + '-' + id,
    meeting: title,
    owner,
    email: own.length ? String(own[own.length - 1].recipients || '') : '',
    task,
    due_text: clean(a.due_text, 120),
    due_date: dueDate(a.due_text),
    estimate: typeof a.estimated_hours === 'number' && isFinite(a.estimated_hours) ? a.estimated_hours : '',
    case_id: c.case_id,
    version: req.version,
    approval_state: 'Approved (v' + req.version + ')',
    email_state: own.length ? 'Sent - Gmail accepted' : 'Included in team email',
    last_synced: now,
  });
}
if (!tasks.length) return respond(409, 'NO_APPROVED_TASKS', 'No reviewed action items are covered by a sent approval.');
// Tab: meeting date (first recorded, in the configured timezone) + meeting name, sheet-safe characters only.
let date = now.slice(0, 10);
try {
  date = new Intl.DateTimeFormat('en-CA', { timeZone: S.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(c.first_recorded_at || job.accepted_at || now));
} catch (e) {
  date = now.slice(0, 10);
}
const tab = (date + ' · ' + title).replace(/[\[\]:*?\/\\']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + S.spreadsheet_id;
return [{ json: { action: 'PUBLISH', job_id: req.job_id, case_id: c.case_id, version: req.version, tab, tasks, meta_url: base + '?fields=sheets.properties(sheetId%2Ctitle)', base, settings: S } }];
