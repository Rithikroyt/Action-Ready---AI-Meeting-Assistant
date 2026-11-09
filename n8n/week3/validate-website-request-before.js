// WEBSITE API v1 - strict request validation (server-to-server; authenticated by Header Auth on the webhook).
// The client may send ONLY these fields. Project, owner, approval, recipients, table IDs and workflow ID are fixed server-side.
const API = {
  schema_version: '1',
  project_id: 'DEMO_ATLAS', // TRUSTED: never from the client or the notes.
  owner_id: 'maya',         // TRUSTED single demo owner (no multi-user authorization is claimed).
  supported_period: { start: '2026-11-02', end: '2026-11-06' }, // Must match Week 3 Configuration.
  min_chars: 20, max_chars: 12000, min_words: 4, // Same limits as Prepare Input.
};
const ALLOWED = ['request_id', 'notes', 'period_start', 'period_end', 'timezone'];
const FORBIDDEN = ['project_id', 'owner_id', 'user_id', 'approved', 'approval', 'enable_approval', 'enable_gmail', 'recipient', 'reviewer_email', 'draft_recipient', 'table_id', 'dataTableId', 'workflow_id', 'credential', 'credentials', 'case_id', 'job_id'];
const req = $input.first().json || {};
const headers = req.headers || {};
const body = req.body;
const fail = (http_status, code, message) => [{ json: { valid: false, http_status, response_body: { error: { code, message }, schema_version: API.schema_version } } }];
const ctype = String(headers['content-type'] || '').toLowerCase();
if (!ctype.includes('application/json')) return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_JSON', 'Request body must be a JSON object.');
const keys = Object.keys(body);
const forbidden = keys.filter((k) => FORBIDDEN.includes(k));
if (forbidden.length) return fail(400, 'FORBIDDEN_FIELD', 'These fields are controlled by the server and must not be sent: ' + forbidden.join(', ') + '.');
const unknown = keys.filter((k) => !ALLOWED.includes(k));
if (unknown.length) return fail(400, 'UNKNOWN_FIELD', 'Unsupported field(s): ' + unknown.slice(0, 5).join(', ') + '.');
for (const k of ALLOWED) if (typeof body[k] !== 'string') return fail(400, 'MISSING_OR_INVALID_FIELD', 'Field ' + k + ' is required and must be a string.');
const request_id = body.request_id.trim();
if (!/^[A-Za-z0-9._:-]{8,100}$/.test(request_id)) return fail(400, 'INVALID_REQUEST_ID', 'request_id must be 8-100 characters: letters, digits, dot, underscore, colon or hyphen.');
const notes = body.notes.trim();
if (!notes.length) return fail(422, 'EMPTY_INPUT', 'No meeting notes were received.');
if (notes.length < API.min_chars || notes.split(/\s+/).length < API.min_words) return fail(422, 'TOO_SHORT', 'The notes are too short to be meeting notes.');
if (notes.length > API.max_chars) return fail(413, 'TOO_LONG', 'The notes are ' + notes.length + ' characters; the limit is ' + API.max_chars + '. Nothing was truncated.');
const isDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
const period_start = body.period_start.trim(), period_end = body.period_end.trim();
if (!isDate(period_start) || !isDate(period_end)) return fail(400, 'INVALID_DATE', 'period_start and period_end must be real calendar dates in YYYY-MM-DD format.');
if (period_end < period_start) return fail(400, 'INVALID_PERIOD', 'period_end must not be before period_start.');
const timezone = body.timezone.trim();
let tzOk = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(timezone) || timezone === 'UTC';
if (tzOk) { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); } catch (e) { tzOk = false; } }
if (!tzOk) return fail(400, 'INVALID_TIMEZONE', 'timezone must be a valid IANA time zone such as America/Phoenix.');
if (period_start !== API.supported_period.start || period_end !== API.supported_period.end) return fail(422, 'PERIOD_NOT_SUPPORTED', 'This demo deployment only analyses the configured planning period ' + API.supported_period.start + ' to ' + API.supported_period.end + '.');
// Reject explicit period ranges in the notes that contradict the requested period (no inference from today's date).
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const ranges = [];
const reIso = /(\d{4}-\d{2}-\d{2})\s*(?:to|through|until|-|\u2013|\u2014)\s*(\d{4}-\d{2}-\d{2})/gi;
let m;
while ((m = reIso.exec(notes)) !== null) ranges.push([m[1], m[2]]);
const reDm = /\b(\d{1,2})\s*(?:to|through|-|\u2013|\u2014)\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi;
while ((m = reDm.exec(notes)) !== null) { const mo = MONTHS[m[3].toLowerCase().slice(0, 3)]; ranges.push([m[4] + '-' + pad(mo) + '-' + pad(m[1]), m[4] + '-' + pad(mo) + '-' + pad(m[2])]); }
const reMd = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\s*(?:to|through|-|\u2013|\u2014)\s*(\d{1,2}),?\s+(\d{4})\b/gi;
while ((m = reMd.exec(notes)) !== null) { const mo = MONTHS[m[1].toLowerCase().slice(0, 3)]; ranges.push([m[4] + '-' + pad(mo) + '-' + pad(m[2]), m[4] + '-' + pad(mo) + '-' + pad(m[3])]); }
const conflicting = ranges.filter((r) => r[0] !== period_start || r[1] !== period_end);
if (conflicting.length) return fail(422, 'PERIOD_CONFLICT', 'The notes state a planning period (' + conflicting[0][0] + ' to ' + conflicting[0][1] + ') that differs from the requested period.');
const canonical = JSON.stringify(['ar-v1', request_id, notes, period_start, period_end, timezone]);
return [{ json: { valid: true, request_id, notes, period_start, period_end, timezone, canonical, trusted: { project_id: API.project_id, owner_id: API.owner_id, schema_version: API.schema_version } } }];
