// Resolve owners and the planning period against the TRUSTED roster/config.
// No date inference from today's date; deadline wording is preserved untouched.
const s = $input.first().json;
const w = s.week3;
const norm = (x) => String(x === null || x === undefined ? '' : x).toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[,.;:()]/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
const cand = s.candidate || {};
const actions = Array.isArray(s.validation && s.validation.actions) ? s.validation.actions : [];
const notes = ' ' + norm(s.raw_notes) + ' ';
// Project is chosen by configuration. Notes can only confirm (or fail to confirm) that they concern it.
const projectConfirmed = w.project_aliases.some((a) => notes.includes(' ' + norm(a) + ' '));
const wording = typeof cand.planning_period === 'string' && cand.planning_period.trim() ? cand.planning_period.trim() : null;
let periodStatus;
if (wording === null) periodStatus = 'MISSING';
else if (!notes.includes(' ' + norm(wording) + ' ') && !notes.includes(norm(wording))) periodStatus = 'NOT_IN_NOTES';
else if (w.planning_period.accepted_wording.map(norm).includes(norm(wording))) periodStatus = 'MATCHED';
else periodStatus = 'NOT_MATCHED';
const owners = new Map();
const ambiguous = [];
const unresolved = [];
for (const a of actions) {
  if (a.owner === null || a.owner === undefined || String(a.owner).trim() === '') { unresolved.push({ action_id: a.id, owner_text: null, reason: 'NO_OWNER' }); continue; }
  const n = norm(a.owner);
  const hits = w.owner_roster.filter((r) => r.match_names.map(norm).includes(n));
  if (hits.length === 1) {
    const id = hits[0].owner_id;
    if (!owners.has(id)) owners.set(id, { owner_id: id, display_name: hits[0].display_name, action_ids: [] });
    owners.get(id).action_ids.push(a.id);
  } else if (hits.length > 1) ambiguous.push({ action_id: a.id, owner_text: String(a.owner).slice(0, 80), candidates: hits.map((h) => h.owner_id) });
  else unresolved.push({ action_id: a.id, owner_text: String(a.owner).slice(0, 80), reason: 'NOT_IN_ROSTER' });
}
const matched = periodStatus === 'MATCHED';
const week3_scope = {
  project_id: w.project_id,
  project_confirmed_in_notes: projectConfirmed,
  period: { wording, status: periodStatus, period_start: matched ? w.planning_period.period_start : null, period_end: matched ? w.planning_period.period_end : null },
  owners: [...owners.values()],
  ambiguous_owners: ambiguous,
  unresolved_owners: unresolved,
  action_count: actions.length,
  version: s.version,
  resolved_at: new Date().toISOString(),
};
return [{ json: { ...s, week3_scope }, pairedItem: { item: 0 } }];
