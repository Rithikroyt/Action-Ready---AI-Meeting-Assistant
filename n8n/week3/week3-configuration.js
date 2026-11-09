// WEEK 3 TRUSTED CONFIGURATION - Commitment Control Center (owner-edited constants only).
// Meeting notes, retrieved records and model output can NEVER change these values.
// Data Table IDs are bound directly on the Data Table nodes/tools; names below are for display only.
const s = $input.first().json;
const week3 = {
  config_version: 'ar-w3-config-v1',
  phase: 'DEVELOPMENT',
  enable_gmail: false,     // Development guard: must stay false in this phase.
  enable_approval: false,  // Development guard: must stay false in this phase.
  project_id: 'DEMO_ATLAS',
  project_label: 'Project Atlas (synthetic demo project)',
  project_aliases: ['project atlas'],
  data_kind_expected: 'SYNTHETIC_DEMO',
  owner_roster: [
    { owner_id: 'maya', display_name: 'Maya', match_names: ['maya'] },
    { owner_id: 'li_chen', display_name: 'Li Chen', match_names: ['li chen', 'li'] },
    { owner_id: 'sam_okafor', display_name: 'Sam Okafor', match_names: ['sam okafor', 'sam'] },
    { owner_id: 'sam_kim', display_name: 'Sam Kim', match_names: ['sam kim', 'sam'] },
  ],
  planning_period: {
    period_start: '2026-11-02',
    period_end: '2026-11-06',
    accepted_wording: ['2-6 november 2026', '2 to 6 november 2026', '2-6 nov 2026', 'november 2-6 2026', 'nov 2-6 2026', '2 november 2026-6 november 2026', '2 november-6 november 2026', '2026-11-02 to 2026-11-06', '2026-11-02-2026-11-06'],
  },
  freshness: { max_record_age_hours: 336, policy: 'A register or capacity record whose updated_at is missing or older than 336 hours (14 days) at check time is STALE; readiness becomes UNKNOWN.' },
  limits: { register_read_limit: 50, capacity_read_limit: 50, max_business_tool_calls: 8, tool_row_limit: 50 },
  capacity_definition: 'available_hours = project-allocated usable hours for this owner, project and period BEFORE subtracting commitments in the register. It does not prove overall availability across other projects or calendars.',
  tables: { commitments: 'AR_Commitments', capacity: 'AR_Capacity' },
  external_action_status: 'DISABLED_DEV_PHASE',
};
if (week3.enable_gmail !== false || week3.enable_approval !== false) throw new Error('Development guard: enable_gmail and enable_approval must both be false in the Week 3 phase.');
if (!s.settings || s.settings.enable_gmail !== false) throw new Error('Development guard: Workflow Settings enable_gmail must be false.');
return [{ json: { ...s, week3, week3_scope: null, operational_context: null, readiness: null }, pairedItem: { item: 0 } }];
