// Plan the row writes. Rows are located by Task ID (column A) at read time, never by a remembered row number.
// Existing rows: only workflow-owned columns are rewritten (A-H, K-O). Status (I) and Update note (J) belong to
// the employee and are NEVER overwritten. New rows start as "Not started". All values are written RAW, so
// meeting text can never be read as a formula.
const plan = $('Plan Tracker Publication').first().json;
const tab = $('Ensure Tracker Tab').first().json;
const r = $input.first().json || {};
const fail = (message) => [{ json: { action: 'RESPOND', http_status: 502, response_body: { schema_version: '1', job_id: plan.job_id, version: plan.version, tracker_status: 'FAILED', error: { code: 'SHEET_UNAVAILABLE', message } } } }];
if (r.error || r.statusCode !== 200 || !r.body) return fail('The tracker tab could not be read' + (r.statusCode ? ' (HTTP ' + r.statusCode + ')' : '') + '. Nothing was published.');
const values = Array.isArray(r.body.values) ? r.body.values : [];
const q = "'" + plan.tab + "'!";
const rowOf = {};
const duplicates = [];
values.forEach((row, i) => {
  if (i === 0) return;
  const id = String((row && row[0]) || '').trim();
  if (!id) return;
  if (rowOf[id]) duplicates.push(id);
  else rowOf[id] = i + 1; // 1-based sheet row
});
let next = Math.max(values.length, 1) + 1;
const data = [];
let added = 0;
let updated = 0;
for (const t of plan.tasks) {
  const at = rowOf[t.task_id];
  if (at) {
    const existing = values[at - 1] || [];
    const email = t.email || String(existing[3] || '');
    data.push({ range: q + 'A' + at + ':H' + at, values: [[t.task_id, t.meeting, t.owner, email, t.task, t.due_text, t.due_date, t.estimate]] });
    data.push({ range: q + 'K' + at + ':O' + at, values: [[t.case_id, t.version, t.approval_state, t.email_state, t.last_synced]] });
    updated += 1;
  } else {
    data.push({ range: q + 'A' + next + ':O' + next, values: [[t.task_id, t.meeting, t.owner, t.email, t.task, t.due_text, t.due_date, t.estimate, 'Not started', '', t.case_id, t.version, t.approval_state, t.email_state, t.last_synced]] });
    next += 1;
    added += 1;
  }
}
return [{ json: { action: 'WRITE', write_url: plan.base + '/values:batchUpdate', read_url: tab.read_url, request_body: { valueInputOption: 'RAW', data }, added, updated, duplicates } }];
