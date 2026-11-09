// WEEK 4 TEAM (shared helpers, embedded verbatim in the Team Code nodes). The configured roster below MIRRORS
// Week 3 Configuration (read-only here); web/tests/team-nodes.test.ts fails if the two drift apart.
const CONFIGURED_ROSTER = [
  { owner_id: 'maya', display_name: 'Maya', match_names: ['maya'] },
  { owner_id: 'li_chen', display_name: 'Li Chen', match_names: ['li chen', 'li'] },
  { owner_id: 'sam_okafor', display_name: 'Sam Okafor', match_names: ['sam okafor', 'sam'] },
  { owner_id: 'sam_kim', display_name: 'Sam Kim', match_names: ['sam kim', 'sam'] },
];
const PROJECT_ID = 'DEMO_ATLAS';
const tnorm = (x) => String(x === null || x === undefined ? '' : x).toLowerCase().replace(/[‐-―−]/g, '-').replace(/[,.;:()]/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
const NAME_RE = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'-]{0,58}[A-Za-zÀ-ɏ.]$/;
const slug = (x) => tnorm(x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const aliasesOf = (row) => String(row.match_names || '').split(',').map(tnorm).filter(Boolean);

// Validate a Team-page change sent by the website (approver already checked by the website session).
// Adds/updates ONE person and, optionally, their available hours for ONE planning period. The notes never do this.
const body = ($('Website Team Change').first().json || {}).body;
const fail = (http, code, message) => [{ json: { valid: false, http_status: http, response_body: { schema_version: '1', team_status: 'REFUSED', error: { code, message } } } }];
if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_BODY', 'Body must be a JSON object.');
const ALLOWED = ['owner_id', 'display_name', 'aliases', 'period_start', 'period_end', 'available_hours', 'active'];
const extra = Object.keys(body).filter((k) => !ALLOWED.includes(k));
if (extra.length) return fail(400, 'UNKNOWN_FIELDS', 'Unexpected field(s): ' + extra.join(', ').slice(0, 120));
const rows = $('Read Team For Change').all().map((i) => i.json || {});
if (rows.some((r) => r.error !== undefined && r.owner_id === undefined)) return fail(503, 'STORAGE_UNAVAILABLE', 'The team list could not be read. Nothing was changed.');
const team = rows.filter((r) => r.project_id === PROJECT_ID && r.owner_id);
const display = typeof body.display_name === 'string' ? body.display_name.replace(/\s+/g, ' ').trim() : '';
if (!NAME_RE.test(display)) return fail(422, 'INVALID_NAME', 'Name must be 2-60 letters (spaces, hyphens, apostrophes and dots allowed).');
const configured = CONFIGURED_ROSTER.find((r) => r.owner_id === body.owner_id);
const owner_id = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : slug(display);
if (!/^[a-z0-9_]{2,40}$/.test(owner_id)) return fail(422, 'INVALID_OWNER_ID', 'Could not derive a stable ID from this name.');
const existingTeam = team.find((r) => r.owner_id === owner_id);
if (typeof body.owner_id === 'string' && body.owner_id && !configured && !existingTeam) return fail(404, 'OWNER_NOT_FOUND', 'No person with this ID exists to update.');
if (!body.owner_id && (CONFIGURED_ROSTER.some((r) => r.owner_id === owner_id) || existingTeam)) return fail(409, 'OWNER_EXISTS', 'Someone with this name already exists. Edit that person instead.');
const rawAliases = Array.isArray(body.aliases) ? body.aliases : [];
if (rawAliases.length > 6) return fail(422, 'TOO_MANY_ALIASES', 'At most 6 other names per person.');
for (const a of rawAliases) if (typeof a !== 'string' || !NAME_RE.test(a.replace(/\s+/g, ' ').trim())) return fail(422, 'INVALID_ALIAS', 'Each other name must be 2-60 letters.');
// Names already used by OTHER people (configured roster + Team page). A shared name would make notes ambiguous.
const taken = new Map();
for (const r of CONFIGURED_ROSTER) for (const n of r.match_names) if (r.owner_id !== owner_id) taken.set(tnorm(n), r.display_name);
for (const r of team) if (r.owner_id !== owner_id) for (const n of aliasesOf(r)) taken.set(n, r.display_name || r.owner_id);
const explicit = [...new Set([display, ...rawAliases].map(tnorm))];
const clash = explicit.find((n) => taken.has(n));
if (clash) return fail(409, 'NAME_TAKEN', '"' + clash + '" is already used for ' + taken.get(clash) + '. Use a more specific name (for example the full name).');
// The first name is added automatically when nobody else uses it, so notes can say just "Priya".
const first = tnorm(display).split(' ')[0];
const names = [...explicit];
if (first && first.length >= 2 && !taken.has(first) && !names.includes(first)) names.push(first);
if (configured) for (const n of configured.match_names) if (!names.includes(tnorm(n))) names.push(tnorm(n));
const active = body.active !== false;
let capacity = null;
const hasPeriod = body.period_start !== undefined || body.period_end !== undefined || body.available_hours !== undefined;
if (hasPeriod) {
  if (!isDay(body.period_start) || !isDay(body.period_end) || body.period_end < body.period_start) return fail(422, 'INVALID_PERIOD', 'Planning period must be two real dates (YYYY-MM-DD), end not before start.');
  if ((Date.parse(body.period_end) - Date.parse(body.period_start)) / 86400000 > 31) return fail(422, 'PERIOD_TOO_LONG', 'Planning periods are limited to 31 days.');
  const h = body.available_hours;
  if (typeof h !== 'number' || !isFinite(h) || h < 0 || h > 80 || Math.round(h * 4) !== h * 4) return fail(422, 'INVALID_HOURS', 'Available hours must be a number from 0 to 80 (quarter hours allowed).');
  capacity = { capacity_id: 'CAP-' + owner_id + '-' + body.period_start + '-' + body.period_end, owner_id, period_start: body.period_start, period_end: body.period_end, available_hours: h };
}
const now = new Date().toISOString();
return [{ json: { valid: true, now, project_id: PROJECT_ID, member: { owner_id, display_name: configured ? configured.display_name : display, match_names: names.slice(0, 8).join(','), active, configured: !!configured, created: !existingTeam && !configured }, capacity } }];
