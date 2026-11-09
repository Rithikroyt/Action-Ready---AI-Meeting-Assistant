// Validate a Review & Send request. Strict allowlist of fields; nothing in the body can change scope or settings.
const { settings, body } = $input.first().json;
const fail = (code, message, http = 422) => [{ json: { valid: false, http_status: http, response_body: { schema_version: '1', dispatch_status: 'REFUSED', error: { code, message } } } }];
if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_BODY', 'Body must be a JSON object.', 400);
const ALLOWED = ['job_id', 'version', 'employee', 'recipients', 'subject', 'body', 'dispatch_key', 'confirm'];
const extra = Object.keys(body).filter((k) => !ALLOWED.includes(k));
if (extra.length) return fail('UNKNOWN_FIELDS', 'Unexpected field(s): ' + extra.join(', ').slice(0, 200));
const jobId = String(body.job_id || '').trim().toLowerCase();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) return fail('INVALID_JOB_ID', 'job_id must be a job ID returned by the meetings endpoint.');
if (!Number.isInteger(body.version) || body.version < 1 || body.version > 20) return fail('INVALID_VERSION', 'version must be the integer version being approved.');
if (body.confirm !== true) return fail('NOT_CONFIRMED', 'Sending requires explicit confirmation of the exact message and recipients.', 400);
if (!/^[0-9a-f]{64}$/.test(String(body.dispatch_key || ''))) return fail('INVALID_DISPATCH_KEY', 'dispatch_key must be a SHA-256 hex digest.');
if (typeof body.subject !== 'string' || !body.subject.trim() || body.subject.length > 300) return fail('INVALID_SUBJECT', 'subject must be the reviewed draft subject.');
if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 6000) return fail('INVALID_MESSAGE', 'body must be the reviewed draft body.');
// employee: null/absent = the team summary draft; otherwise the action owner whose per-employee draft is approved.
const employee = body.employee === undefined || body.employee === null ? null : typeof body.employee === 'string' && body.employee.trim() && body.employee.length <= 120 ? body.employee.trim() : undefined;
if (employee === undefined) return fail('INVALID_EMPLOYEE', 'employee must be null or an action owner name from the reviewed draft.');
if (!Array.isArray(body.recipients) || body.recipients.length < 1) return fail('NO_RECIPIENTS', 'Add at least one recipient.');
if (body.recipients.length > settings.max_recipients) return fail('TOO_MANY_RECIPIENTS', 'At most ' + settings.max_recipients + ' recipients per message.');
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const list = [...new Set(body.recipients.map((r) => String(r || '').trim().toLowerCase()))];
if (list.some((r) => !EMAIL.test(r) || r.length > 254)) return fail('INVALID_RECIPIENT', 'Each recipient must be a single plain email address.');
const allowedDomains = settings.allowed_recipient_domains.map((d) => String(d).toLowerCase());
const allowedAddresses = settings.allowed_recipient_addresses.map((a) => String(a).toLowerCase());
const outside = settings.allow_any_recipient === true ? [] : list.filter((r) => !allowedAddresses.includes(r) && !allowedDomains.includes(r.split('@')[1]));
if (outside.length) return fail('RECIPIENT_NOT_ALLOWED', outside.length + ' recipient(s) are outside the allowed domains or addresses in Week 4 Dispatch Settings. Nothing was sent.', 403);
return [{ json: { valid: true, job_id: jobId, version: body.version, employee, recipients: list.sort(), subject: body.subject, body: body.body, dispatch_key: body.dispatch_key, settings } }];
