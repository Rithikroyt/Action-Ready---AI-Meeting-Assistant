// Read-back verification: a task counts as published only if the tab now holds exactly one row with its Task ID
// and the expected owner, task text and version. Anything else is reported, never assumed.
const plan = $('Plan Tracker Publication').first().json;
const tab = $('Ensure Tracker Tab').first().json;
const w = $('Plan Tracker Writes').first().json;
const wrote = $('Sheets · Write Tracker Rows').first().json || {};
const r = $input.first().json || {};
const sheet_url = 'https://docs.google.com/spreadsheets/d/' + plan.settings.spreadsheet_id + '/edit#gid=' + tab.sheet_id;
const out = (status, http, extra) => [{ json: { job_id: plan.job_id, version: plan.version, tracker_status: status, tab: plan.tab, synced_at: new Date().toISOString(), http_status: http, response_body: { schema_version: '1', job_id: plan.job_id, version: plan.version, tracker_status: status, tab: plan.tab, sheet_url, tab_created: tab.action === 'CREATE', ...extra } } }];
if (wrote.error || wrote.statusCode !== 200) return out('FAILED', 502, { error: { code: 'WRITE_FAILED', message: 'Google Sheets rejected the write' + (wrote.statusCode ? ' (HTTP ' + wrote.statusCode + ')' : '') + '. Some rows may be missing; re-sync to retry.' } });
if (r.error || r.statusCode !== 200 || !r.body) return out('UNVERIFIED', 502, { error: { code: 'READ_BACK_FAILED', message: 'The rows were written but could not be read back to verify them. Re-sync to check.' } });
const values = Array.isArray(r.body.values) ? r.body.values : [];
const problems = [];
for (const t of plan.tasks) {
  const hits = values.slice(1).filter((row) => String((row && row[0]) || '') === t.task_id);
  if (hits.length !== 1) problems.push(t.task_id + (hits.length ? ' appears ' + hits.length + ' times' : ' is missing'));
  else if (String(hits[0][2] || '') !== t.owner || String(hits[0][4] || '') !== t.task || String(hits[0][11] || '') !== String(t.version)) problems.push(t.task_id + ' does not match the approved record');
}
if (problems.length) return out('UNVERIFIED', 502, { verified: false, problems: problems.slice(0, 10), rows_added: w.added, rows_updated: w.updated });
return out('PUBLISHED', 200, {
  verified: true,
  rows_added: w.added,
  rows_updated: w.updated,
  task_ids: plan.tasks.map((t) => t.task_id),
  note: 'Approved tasks are in the tracker. Employees may change only Status and Update note; re-syncing never overwrites them.',
});
