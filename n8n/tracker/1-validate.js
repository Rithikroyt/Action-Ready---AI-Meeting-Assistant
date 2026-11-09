// WEEK 4 TRACKER SETTINGS + VALIDATION. Publishes APPROVED tasks (a SENT dispatch is the approval evidence) to the
// Google Sheet "ActionReady - Weekly Tasks Tracker": one tab per meeting, named "<meeting date> · <meeting name>".
// The Sheet never authorizes anything; a cell saying "Approved" means nothing to this workflow.
const settings = {
  enabled: true,
  spreadsheet_id: '1Qa3RPemjyNnN-2Pj8lMqsbmHlGjXtEwOrxXzCFHnKvs',
  timezone: 'America/Phoenix',
  statuses: ['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'],
};
const body = ($input.first().json || {}).body;
const fail = (code, message, http = 422) => [{ json: { valid: false, http_status: http, response_body: { schema_version: '1', tracker_status: 'REFUSED', error: { code, message } } } }];
if (!settings.enabled) return fail('TRACKER_DISABLED', 'Tracker publishing is switched off in Week 4 Tracker Settings.', 403);
if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_BODY', 'Body must be a JSON object.', 400);
const extra = Object.keys(body).filter((k) => !['job_id', 'version'].includes(k));
if (extra.length) return fail('UNKNOWN_FIELDS', 'Unexpected field(s): ' + extra.join(', ').slice(0, 200));
const jobId = String(body.job_id || '').trim().toLowerCase();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) return fail('INVALID_JOB_ID', 'job_id must be a job ID returned by the meetings endpoint.');
if (!Number.isInteger(body.version) || body.version < 1 || body.version > 20) return fail('INVALID_VERSION', 'version must be the approved integer version.');
return [{ json: { valid: true, job_id: jobId, version: body.version, settings } }];
