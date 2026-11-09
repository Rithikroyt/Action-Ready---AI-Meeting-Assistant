
// Report the Team change honestly: each write is reported, and a failed write is never shown as saved.
const v = $('Validate Team Change').first().json;
const out = (n) => { try { return $(n).all().map((i) => i.json || {}); } catch (e) { return null; } };
const m = out('Upsert Team Member');
const c = v.capacity ? out('Upsert Team Capacity') : [];
const bad = (rows) => rows === null || rows.length === 0 || rows.some((r) => r.error !== undefined);
const memberSaved = !bad(m);
const capacitySaved = v.capacity ? !bad(c) : null;
const ok = memberSaved && capacitySaved !== false;
return [{ json: { http_status: ok ? 200 : 502, response_body: {
  schema_version: '1',
  team_status: ok ? 'SAVED' : 'FAILED',
  owner_id: v.member.owner_id,
  display_name: v.member.display_name,
  names: v.member.match_names.split(','),
  member_saved: memberSaved,
  capacity_saved: capacitySaved,
  capacity: v.capacity,
  note: ok ? 'Saved. The next analysis uses this roster and capacity; existing cases are not re-checked automatically.' : 'Not everything was saved. Try again; nothing was assumed.',
} } }];
