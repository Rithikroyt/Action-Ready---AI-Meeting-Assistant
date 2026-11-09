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

// Read-only Team view for the website: configured roster + Team-page people, with their recorded capacity periods.
// No emails, no notes. Capacity rows are listed exactly as stored (including their freshness).
const rows = (n) => $(n).all().map((i) => i.json || {});
const team = rows('Read Team Members');
const caps = rows('Read Team Capacity');
if ([...team, ...caps].some((r) => r.error !== undefined && r.owner_id === undefined)) return [{ json: { http_status: 503, response_body: { schema_version: '1', error: { code: 'STORAGE_UNAVAILABLE', message: 'The team list could not be read.' } } } }];
const people = new Map();
for (const r of CONFIGURED_ROSTER) people.set(r.owner_id, { owner_id: r.owner_id, display_name: r.display_name, names: [...r.match_names], source: 'CONFIGURED', active: true, capacity: [] });
for (const r of team.filter((x) => x.project_id === PROJECT_ID && /^[a-z0-9_]{2,40}$/.test(String(x.owner_id || '')))) {
  const p = people.get(r.owner_id);
  if (p) p.names = [...new Set([...p.names, ...aliasesOf(r)])];
  else people.set(r.owner_id, { owner_id: r.owner_id, display_name: String(r.display_name || r.owner_id).slice(0, 60), names: aliasesOf(r), source: 'TEAM_PAGE', active: r.active !== false, capacity: [], updated_at: r.updated_at || null });
}
for (const c of caps.filter((x) => x.project_id === PROJECT_ID)) {
  const p = people.get(c.owner_id);
  if (!p) continue;
  p.capacity.push({ capacity_id: String(c.capacity_id || '').slice(0, 80), period_start: String(c.period_start || '').slice(0, 10), period_end: String(c.period_end || '').slice(0, 10), available_hours: typeof c.available_hours === 'number' ? c.available_hours : null, updated_at: c.updated_at ? new Date(c.updated_at).toISOString() : null, provenance: String(c.data_provenance || '').slice(0, 40) });
}
const list = [...people.values()].map((p) => ({ ...p, capacity: p.capacity.sort((a, b) => b.period_start.localeCompare(a.period_start)).slice(0, 12) }));
return [{ json: { http_status: 200, response_body: { schema_version: '1', project_id: PROJECT_ID, freshness_days: 14, people: list } } }];
