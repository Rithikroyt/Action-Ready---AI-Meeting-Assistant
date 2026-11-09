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
