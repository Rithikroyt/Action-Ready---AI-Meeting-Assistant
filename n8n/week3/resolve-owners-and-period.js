// Resolve owners and the planning period against TRUSTED sources only (Week 4 Team page update):
//  - roster = Week 3 Configuration roster + people an APPROVER added on the website Team page (AR_Team, read just
//    before this node). Meeting notes never add people. A Team-page row may also add aliases to a configured owner.
//  - period = the period the website request asked for (any week), else the configured period (chat lane).
//    The notes must state that same period; wording is parsed to dates, never inferred from today's date.
// Deadline wording is preserved untouched.
const s = $('Week 3 Configuration').first().json;
const base = s.week3;
const norm = (x) => String(x === null || x === undefined ? '' : x).toLowerCase().replace(/[‐-―−]/g, '-').replace(/[,.;:()]/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
const loose = (x) => ' ' + norm(x).replace(/-/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;

// ---- roster: configured + Team page (approver-entered) ----
let teamOk = true;
let teamRows = [];
try {
  const rows = $('Read Team Roster').all().map((i) => i.json || {});
  if (rows.some((r) => r.error !== undefined && r.owner_id === undefined)) teamOk = false;
  else teamRows = rows.filter((r) => r && r.project_id === base.project_id && r.active !== false && /^[a-z0-9_]{2,40}$/.test(String(r.owner_id || '')));
} catch (e) {
  teamOk = false;
}
const aliasList = (r) => String(r.match_names || '').split(',').map(norm).filter(Boolean).slice(0, 8);
const roster = base.owner_roster.map((r) => ({ ...r, match_names: [...r.match_names], source: 'CONFIG' }));
for (const r of teamRows.slice(0, 60)) {
  const existing = roster.find((x) => x.owner_id === r.owner_id);
  if (existing) existing.match_names = [...new Set([...existing.match_names, ...aliasList(r)])];
  else roster.push({ owner_id: r.owner_id, display_name: String(r.display_name || r.owner_id).slice(0, 60), match_names: aliasList(r), source: 'TEAM_PAGE' });
}

// ---- period: requested (website) or configured (chat) ----
const rp = s.requested_period;
const fromRequest = !!(rp && isDate(rp.start) && isDate(rp.end) && rp.end >= rp.start);
const P0 = fromRequest ? rp.start : base.planning_period.period_start;
const P1 = fromRequest ? rp.end : base.planning_period.period_end;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const mon = (t) => MONTHS[String(t).slice(0, 3)];
const ymd = (y, m, d) => { const v = y + '-' + pad(m) + '-' + pad(d); return isDate(v) ? v : null; };
/** Every explicit date range written in the text, as [start, end] ISO dates. */
function ranges(text) {
  const t = String(text || '').toLowerCase().replace(/[‐-―−]/g, '-').replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  const M = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  const SEP = '\\s*(?:-|to|through|until|thru)\\s*';
  const out = [];
  const add = (a, b) => { if (a && b) out.push([a, b]); };
  let m;
  const r1 = /(\d{4}-\d{2}-\d{2})\s*(?:-|to|through|until|thru)\s*(\d{4}-\d{2}-\d{2})/g;
  while ((m = r1.exec(t)) !== null) add(isDate(m[1]) ? m[1] : null, isDate(m[2]) ? m[2] : null);
  const r2 = new RegExp('\\b(\\d{1,2})' + SEP + '(\\d{1,2})\\s+' + M + '\\s+(\\d{4})', 'g'); // 2-6 november 2026
  while ((m = r2.exec(t)) !== null) add(ymd(m[4], mon(m[3]), m[1]), ymd(m[4], mon(m[3]), m[2]));
  const r3 = new RegExp('\\b' + M + '\\s+(\\d{1,2})' + SEP + '(\\d{1,2})\\s+(\\d{4})', 'g'); // november 2-6 2026
  while ((m = r3.exec(t)) !== null) add(ymd(m[4], mon(m[1]), m[2]), ymd(m[4], mon(m[1]), m[3]));
  const r4 = new RegExp('\\b(\\d{1,2})\\s+' + M + '(?:\\s+(\\d{4}))?' + SEP + '(\\d{1,2})\\s+' + M + '\\s+(\\d{4})', 'g'); // 30 november - 4 december 2026
  while ((m = r4.exec(t)) !== null) add(ymd(m[3] || m[6], mon(m[2]), m[1]), ymd(m[6], mon(m[5]), m[4]));
  const r5 = new RegExp('\\b' + M + '\\s+(\\d{1,2})(?:\\s+(\\d{4}))?' + SEP + M + '\\s+(\\d{1,2})\\s+(\\d{4})', 'g'); // november 30 - december 4 2026
  while ((m = r5.exec(t)) !== null) add(ymd(m[3] || m[6], mon(m[1]), m[2]), ymd(m[6], mon(m[4]), m[5]));
  return out;
}
const cand = s.candidate || {};
const notesNorm = ' ' + norm(s.raw_notes) + ' ';
const wording = typeof cand.planning_period === 'string' && cand.planning_period.trim() ? cand.planning_period.trim() : null;
let periodStatus;
if (wording === null) periodStatus = 'MISSING';
else if (!notesNorm.includes(' ' + norm(wording) + ' ') && !notesNorm.includes(norm(wording))) periodStatus = 'NOT_IN_NOTES';
else if (ranges(wording).some((r) => r[0] === P0 && r[1] === P1)) periodStatus = 'MATCHED';
else if (!fromRequest && base.planning_period.accepted_wording.map(norm).includes(norm(wording))) periodStatus = 'MATCHED';
else periodStatus = 'NOT_MATCHED';

// ---- project: configured; the notes can only confirm it (dash- and punctuation-tolerant) ----
const projectConfirmed = base.project_aliases.some((a) => loose(s.raw_notes).includes(loose(a)));

// ---- owners ----
const actions = Array.isArray(s.validation && s.validation.actions) ? s.validation.actions : [];
const owners = new Map();
const ambiguous = [];
const unresolved = [];
for (const a of actions) {
  if (a.owner === null || a.owner === undefined || String(a.owner).trim() === '') { unresolved.push({ action_id: a.id, owner_text: null, reason: 'NO_OWNER' }); continue; }
  const n = norm(a.owner);
  const hits = roster.filter((r) => r.match_names.map(norm).includes(n));
  if (hits.length === 1) {
    const id = hits[0].owner_id;
    if (!owners.has(id)) owners.set(id, { owner_id: id, display_name: hits[0].display_name, action_ids: [] });
    owners.get(id).action_ids.push(a.id);
  } else if (hits.length > 1) ambiguous.push({ action_id: a.id, owner_text: String(a.owner).slice(0, 80), candidates: hits.map((h) => h.owner_id) });
  else unresolved.push({ action_id: a.id, owner_text: String(a.owner).slice(0, 80), reason: teamOk ? 'NOT_IN_ROSTER' : 'ROSTER_UNAVAILABLE' });
}
const matched = periodStatus === 'MATCHED';
// Two mandatory reviewer business calls per owner (+ headroom), bounded.
const toolLimit = Math.min(40, Math.max(base.limits.max_business_tool_calls, owners.size * 2 + 2));
const week3 = {
  ...base,
  owner_roster: roster.map(({ owner_id, display_name, match_names }) => ({ owner_id, display_name, match_names })),
  planning_period: { period_start: P0, period_end: P1, accepted_wording: fromRequest ? [] : base.planning_period.accepted_wording },
  limits: { ...base.limits, max_business_tool_calls: toolLimit },
  roster_sources: { configured: base.owner_roster.length, team_page: roster.filter((r) => r.source === 'TEAM_PAGE').length, team_page_read_ok: teamOk },
  period_source: fromRequest ? 'WEBSITE_REQUEST' : 'CONFIGURATION',
};
const week3_scope = {
  project_id: base.project_id,
  project_confirmed_in_notes: projectConfirmed,
  period: { wording, status: periodStatus, period_start: matched ? P0 : null, period_end: matched ? P1 : null },
  owners: [...owners.values()],
  ambiguous_owners: ambiguous,
  unresolved_owners: unresolved,
  action_count: actions.length,
  version: s.version,
  resolved_at: new Date().toISOString(),
};
return [{ json: { ...s, week3, week3_scope }, pairedItem: { item: 0 } }];
