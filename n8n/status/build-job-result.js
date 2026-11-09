// WEEK 4 EMPLOYEE DRAFTS (shared): one fixed-template email per action owner, built ONLY from the reviewed
// version's validated actions. No model call. Identical copies live in Build Job Result and Authorize Dispatch,
// so the website previews exactly what the dispatcher will accept. Parity: web/src/lib/employeeDrafts.ts.
function employeeDrafts(cand, caseId, version) {
  const clean = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const title = clean(cand && cand.meeting_title, 150) || 'our recent meeting';
  const acts = (cand && Array.isArray(cand.actions) ? cand.actions : []).slice(0, 30);
  const groups = [];
  for (const a of acts) {
    const owner = clean(a && a.owner, 120);
    const task = clean(a && a.task, 300);
    if (!owner || !task) continue;
    let g = groups.find((x) => x.key === owner.toLowerCase());
    if (!g) groups.push((g = { key: owner.toLowerCase(), employee: owner, items: [] }));
    g.items.push({ id: clean(a.id, 20) || null, task, due: clean(a.due_text, 120), hours: typeof a.estimated_hours === 'number' && isFinite(a.estimated_hours) ? a.estimated_hours : null });
  }
  return groups.slice(0, 12).map((g) => {
    const n = g.items.length;
    const known = g.items.filter((i) => i.hours !== null);
    const total = Math.round(known.reduce((s, i) => s + i.hours, 0) * 100) / 100;
    const lines = g.items.map((i) => '- ' + i.task + (i.due ? ' (due: ' + i.due + ')' : ' (no due date given)') + (i.hours !== null ? ', estimated ' + i.hours + ' h' : ''));
    const body = [
      'Hi ' + g.employee.split(' ')[0] + ',',
      '',
      (n === 1 ? 'Here is the action item assigned to you' : 'Here are the ' + n + ' action items assigned to you') + ' in ' + title + ':',
      '',
      ...lines,
      '',
      known.length === n ? 'Total estimated effort: ' + total + ' h.' : 'Estimated effort is known for ' + known.length + ' of ' + n + ' items (' + total + ' h so far).',
      '',
      'These items were taken from the meeting notes, checked by ActionReady (AI review plus a capacity check), and approved by the organizer before this email was sent. If anything is wrong or unclear, please reply to this email.',
      '',
      'Reference: ' + caseId + ', version ' + version,
    ].join('\n');
    return { employee: g.employee, subject: 'Your action items: ' + title, body, action_ids: g.items.map((i) => i.id).filter(Boolean), action_count: n };
  });
}

// Allowlisted, read-only job result. Never returns notes, full evidence, prompts, raw model/tool output, credentials or approval links.
const STALE_MINUTES = 20;
const jobId = $('Validate Job Lookup').first().json.job_id;
const err = (http_status, code, message) => [{ json: { http_status, response_body: { error: { code, message }, job_id: jobId, schema_version: '1' } } }];
const jobItems = $('Read Job Record').all().map((i) => i.json || {});
if (jobItems.some((r) => r.error)) return err(503, 'STORAGE_UNAVAILABLE', 'Job storage could not be read. Retry later.');
const jobs = jobItems.filter((r) => r.job_id === jobId);
if (jobs.length === 0) return err(404, 'JOB_NOT_FOUND', 'No job with this ID exists for this deployment.');
if (jobs.length > 1) return err(500, 'DUPLICATE_JOB_RECORDS', 'More than one stored job has this ID. Operator review is required.');
const j = jobs[0];
const caseItems = $('Read Job Case').all().map((i) => i.json || {});
const verItems = $('Read Job Versions').all().map((i) => i.json || {});
const caseReadFailed = caseItems.some((r) => r.error) || verItems.some((r) => r.error);
const cases = caseItems.filter((r) => j.case_id && r.case_id === j.case_id);
const c = cases.length === 1 ? cases[0] : null;
const versions = verItems.filter((r) => j.case_id && r.case_id === j.case_id && typeof r.version === 'number').sort((a, b) => a.version - b.version);
const parse = (s) => { if (typeof s !== 'string' || !s) return null; try { return JSON.parse(s); } catch (e) { return null; } };
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const s = (x, n) => (typeof x === 'string' && x !== '' ? x.slice(0, n) : null);
const iso = (x) => { if (!x) return null; const d = new Date(x); return isNaN(d.getTime()) ? null : d.toISOString(); };
// Execution state (separate from business readiness). Overdue non-final jobs are reported UNKNOWN (stale).
let execution_status = ['ACCEPTED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(j.execution_status) ? j.execution_status : 'UNKNOWN';
let stale = false;
if (['ACCEPTED', 'RUNNING'].includes(execution_status)) {
  const since = new Date(j.started_at || j.accepted_at || 0).getTime();
  if (!since || Date.now() - since > STALE_MINUTES * 60000) { stale = true; execution_status = 'UNKNOWN'; }
}
const latest = versions.length ? versions[versions.length - 1] : null;
const cand = latest ? parse(latest.evaluated_candidate_json) : null;
const rd = c ? parse(c.readiness_json) : null;
const readinessStatus = c ? (['READY', 'BLOCKED', 'UNKNOWN', 'NOT_CHECKED'].includes(c.readiness_status) ? c.readiness_status : 'UNKNOWN') : null;
const owners = rd && Array.isArray(rd.owners) ? rd.owners : [];
const wl = (o) => ({ owner_id: s(o && o.owner_id, 60), existing_hours: num(o && o.existing_hours), new_hours: num(o && o.proposed_new_hours), projected_hours: num(o && o.projected_load), capacity_hours: num(o && o.available_hours), margin_hours: num(o && o.capacity_margin) });
const primary = owners.find((o) => o && o.owner_id === j.owner_id) || (owners.length === 1 ? owners[0] : null);
const actions = cand && Array.isArray(cand.actions) ? cand.actions : [];
const businessEvidence = (rd && Array.isArray(rd.tool_evidence) ? rd.tool_evidence : []).map((t) => ({
  source_type: 'DATA_TABLE_LOOKUP', tool_name: s(t.tool, 40), project_id: s(rd.project_id, 60),
  owner_id: t.validated_arguments ? s(t.validated_arguments.owner_id, 60) : null,
  period_start: t.validated_arguments ? s(t.validated_arguments.period_start, 10) : null,
  period_end: t.validated_arguments ? s(t.validated_arguments.period_end, 10) : null,
  record_ids: Array.isArray(t.returned_record_ids) ? t.returned_record_ids.slice(0, 50).map((x) => String(x).slice(0, 80)) : [],
  record_count: num(t.result_count), retrieved_at: s(t.retrieval_time, 120), updated_at: s(t.source_update_newest, 40), success: t.success === true,
}));
const body = {
  schema_version: '1', job_id: j.job_id, case_id: s(j.case_id, 60), execution_status, stale,
  stored_execution_status: s(j.execution_status, 20),
  timestamps: { accepted_at: iso(j.accepted_at), started_at: iso(j.started_at), completed_at: iso(j.completed_at), updated_at: iso(j.status_updated_at), case_updated_at: c ? iso(c.updated_at) : null },
  error: j.error_code ? { code: s(j.error_code, 60), message: s(j.error_detail, 300) } : null,
  result_available: !!c,
  result_note: c ? null : (caseReadFailed ? 'Stored case could not be read; values are unknown (null).' : 'No stored case result yet; values are unknown (null).'),
  ai_review: { status: c ? s(c.review_status, 60) : null, gate: latest ? s(latest.gate, 40) : null, score: c ? num(c.latest_score) : null, version: c ? num(c.latest_version) : null },
  operational_readiness: {
    status: readinessStatus,
    reasons: rd && Array.isArray(rd.reasons) ? rd.reasons.slice(0, 20).map((r) => ({ severity: s(r.severity, 20), code: s(r.code, 60), owner_id: s(r.owner_id, 60), message: s(r.message, 400) })) : [],
    questions: rd && Array.isArray(rd.questions) ? rd.questions.slice(0, 10).map((q) => String(q).slice(0, 300)) : [],
    checked_version: rd ? num(rd.checked_version) : null, data_kind: c ? s(c.business_data_kind, 30) : null,
  },
  routing: rd && rd.routing && typeof rd.routing === 'object' ? { route_id: s(rd.routing.route_id, 30), role: s(rd.routing.role, 40), label: s(rd.routing.label, 60), why: Array.isArray(rd.routing.why) ? rd.routing.why.slice(0, 8).map((x) => String(x).slice(0, 300)) : [], next: s(rd.routing.next, 300), not_done: s(rd.routing.not_done, 200), also: Array.isArray(rd.routing.also) ? rd.routing.also.slice(0, 4).map((a) => ({ route_id: s(a && a.route_id, 30), role: s(a && a.role, 40), label: s(a && a.label, 60), reason: s(a && a.reason, 300) })) : [], codes: Array.isArray(rd.routing.codes) ? rd.routing.codes.slice(0, 20).map((x) => String(x).slice(0, 60)) : [], rules_version: s(rd.routing.rules_version, 40), source: 'WORKFLOW_COORDINATOR' } : null, // Week 4 Coordinator
  human_approval: { status: c ? (s(c.approval_status, 30) || 'NOT_REQUESTED') : null },
  external_actions: { status: 'DISABLED_DEV_PHASE' },
  actions: actions.slice(0, 30).map((a) => ({ id: s(a.id, 20), task: s(a.task, 300), owner: s(a.owner, 120), due_text: s(a.due_text, 120), estimated_hours: num(a.estimated_hours) })),
  draft: { subject: c ? s(c.latest_subject, 300) : null, body: c ? s(c.latest_body, 6000) : null },
  employee_drafts: c && cand ? employeeDrafts(cand, c.case_id, c.latest_version) : [], // Week 4: one fixed-template draft per action owner
  workload: primary ? wl(primary) : { owner_id: null, existing_hours: null, new_hours: null, projected_hours: null, capacity_hours: null, margin_hours: null },
  workload_by_owner: owners.slice(0, 10).map(wl),
  evidence: {
    actions: actions.slice(0, 30).map((a) => ({ action_id: s(a.id, 20), source_type: 'MEETING_NOTES_EXCERPT', source_quote: s(a.source_quote, 160) })),
    business_records: businessEvidence,
  },
  review_history: versions.map((v) => ({ version: num(v.version), gate: s(v.gate, 40), score: num(v.score), created_at: iso(v.created_at) })),
};
return [{ json: { http_status: 200, response_body: body } }];
