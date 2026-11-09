// WEEK 4 COORDINATOR (deterministic; no model, no confidence score, no side effects).
// Routes this version's official result to the next responsible role and attaches it as readiness.routing.
// Port of web/src/lib/coordinator.ts (the executable spec). The item is otherwise passed through unchanged,
// so the Week 3 gate (Route Quality Result) behaves exactly as before.
const s = $input.first().json;
const ROUTES = {
  PROCESSING: { role: 'System', label: 'Processing', next: 'Wait for the workflow to record the official result. Nobody needs to act yet.' },
  TECHNICAL_REVIEW: { role: 'Technical reviewer', label: 'Technical review', next: 'Inspect the workflow run and its evidence before anyone relies on this case. Nothing is published while it is held here.' },
  CLARIFICATION: { role: 'Requester', label: 'Needs clarification', next: 'Answer the recorded questions and resubmit complete notes. Missing facts are never guessed.' },
  MANAGER_REVIEW: { role: 'Manager', label: 'Manager review', next: 'Decide which task, estimate, deadline or capacity record should change. Rewriting the email does not resolve a capacity conflict.' },
  DATA_REVIEW: { role: 'Data steward', label: 'Data review', next: 'Record or correct the missing or untrusted business record, then re-check readiness. Missing capacity is not zero.' },
  APPROVAL: { role: 'Approver', label: 'Ready for approval', next: 'Review the exact tasks, message and recipients for this version, then approve or request changes.' },
};
const MANAGER_RE = /^(CAPACITY_OVERLOAD|OVER_CAPACITY|REGISTER_CONFLICT)$/;
const CLARIFY_RE = /^(PROJECT_NOT_CONFIRMED|PERIOD_[A-Z_]+|OWNER_[A-Z_]+|NO_PROPOSED_ACTIONS|NO_ACTIONS|NO_RESOLVED_OWNERS|PROPOSED_ESTIMATE_MISSING|ESTIMATE_MISSING|CHANGED_DEADLINE|DEADLINE_CHANGE|POSSIBLE_DUPLICATE_OF_COMMITMENT|POSSIBLE_DUPLICATE)$/;
const DATA_RE = /^(CAPACITY_[A-Z_]+|COMMITMENT_[A-Z_]+|DUPLICATE_COMMITMENT_ID|POSSIBLE_DUPLICATE_COMMITMENT|REMAINING_MISSING|STALE_RECORD|READ_FAILED|READ_LIMIT_REACHED|RETRIEVAL_FAILED|TRUNCATED_READ|SCOPE_VIOLATION|SCOPE_MISMATCH)$/;
const group = (code, severity) => (severity === 'BLOCKED' || severity === 'BLOCKING' || MANAGER_RE.test(code) ? 'manager' : CLARIFY_RE.test(code) ? 'clarification' : DATA_RE.test(code) ? 'data' : 'technical');
const h = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1)) + ' h';
let routing;
try {
  const rd = s.readiness && typeof s.readiness === 'object' ? s.readiness : null;
  const status = rd && ['READY', 'BLOCKED', 'UNKNOWN', 'NOT_CHECKED'].includes(rd.status) ? rd.status : 'NOT_CHECKED';
  const issues = (rd && Array.isArray(rd.reasons) ? rd.reasons : []).filter((i) => i && i.severity !== 'WARNING' && i.severity !== 'NOTICE');
  const msg = (i) => String(i.message || i.code || '').slice(0, 300);
  const clar = issues.filter((i) => group(String(i.code || ''), i.severity) === 'clarification');
  const data = issues.filter((i) => group(String(i.code || ''), i.severity) === 'data');
  const tech = issues.filter((i) => group(String(i.code || ''), i.severity) === 'technical');
  const owners = rd && Array.isArray(rd.owners) ? rd.owners : [];
  const over = owners.find((o) => o && o.capacity_margin !== null && o.capacity_margin !== undefined && o.capacity_margin < 0 && o.projected_load !== null && o.available_hours !== null);
  const overloadWhy = over ? (over.display_name || over.owner_id) + "'s projected workload is " + h(over.projected_load) + ' against ' + h(over.available_hours) + ' of recorded capacity — a shortfall of ' + h(-over.capacity_margin) + '.' : null;
  const gate = String(s.gate || '');
  const make = (id, why) => {
    const also = [];
    if (clar.length) also.push({ route_id: 'CLARIFICATION', reason: msg(clar[0]) });
    if (status === 'BLOCKED') also.push({ route_id: 'MANAGER_REVIEW', reason: overloadWhy || 'A confirmed commitment conflict blocks this plan.' });
    if (data.length) also.push({ route_id: 'DATA_REVIEW', reason: msg(data[0]) });
    if (tech.length) also.push({ route_id: 'TECHNICAL_REVIEW', reason: msg(tech[0]) });
    return {
      route_id: id, role: ROUTES[id].role, label: ROUTES[id].label, why: why.slice(0, 8), next: ROUTES[id].next,
      not_done: 'No task assignment has been published and no email has been sent.',
      also: also.filter((a) => a.route_id !== id).map((a) => ({ ...a, role: ROUTES[a.route_id].role, label: ROUTES[a.route_id].label })),
      codes: [...new Set(issues.map((i) => String(i.code || '')))].slice(0, 20),
      rules_version: 'week4-coordinator-v1', routed_version: s.version === undefined ? null : s.version,
    };
  };
  if (gate === 'REVISE') routing = make('PROCESSING', ['The reviewer requested a revision; a new version is being prepared.']);
  else if (gate === 'STOP' || gate === 'TECHNICAL' || !['PASS', 'CLARIFY'].includes(gate))
    routing = make('TECHNICAL_REVIEW', [gate === 'STOP' ? 'The draft reached the revision limit without passing review.' : "The reviewer result could not be validated, so this version's actions and draft are unvalidated."]);
  else if (gate === 'CLARIFY' || clar.length) {
    const qs = rd && Array.isArray(rd.questions) ? rd.questions.slice(0, 3) : [];
    const why = [...(gate === 'CLARIFY' ? ['The reviewer found facts the plan needs that the notes lack or contradict.'] : []), ...clar.map(msg), ...qs.map((q) => 'Question recorded: ' + String(q).slice(0, 250))];
    routing = make('CLARIFICATION', why.length ? why : ['The notes need clarification.']);
  } else if (status === 'BLOCKED') routing = make('MANAGER_REVIEW', [overloadWhy || 'A confirmed commitment conflict blocks this plan.', 'Approval is closed until a manager decides what changes.']);
  else if (status === 'NOT_CHECKED') routing = make('TECHNICAL_REVIEW', ['The commitment and capacity checks did not run for this result, so feasibility is unknown.']);
  else if (status === 'UNKNOWN') {
    if (tech.length) routing = make('TECHNICAL_REVIEW', ['The evidence behind the readiness check is incomplete or untrusted.', ...tech.map(msg)]);
    else if (data.length) routing = make('DATA_REVIEW', ['A business record the readiness check needs is missing, stale or ambiguous.', ...data.map(msg)]);
    else routing = make('TECHNICAL_REVIEW', ['Readiness is unknown but no recognised reason was recorded.']);
  } else routing = make('APPROVAL', ['The AI review passed for this version.', 'Recorded workload is within capacity and the records are current.', 'No person has approved it yet.']);
} catch (e) {
  routing = { route_id: 'TECHNICAL_REVIEW', role: 'Technical reviewer', label: 'Technical review', why: ['The Coordinator could not route this result: ' + String((e && e.message) || e).slice(0, 200)], next: ROUTES.TECHNICAL_REVIEW.next, not_done: 'No task assignment has been published and no email has been sent.', also: [], codes: [], rules_version: 'week4-coordinator-v1', routed_version: s.version === undefined ? null : s.version };
}
const readiness = s.readiness && typeof s.readiness === 'object' ? { ...s.readiness, routing } : s.readiness;
const history = Array.isArray(s.history) ? s.history.map((v, i, a) => (i === a.length - 1 && v && v.readiness && typeof v.readiness === 'object' ? { ...v, readiness: { ...v.readiness, routing } } : v)) : s.history;
return [{ json: { ...s, readiness, history, routing }, pairedItem: { item: 0 } }];
