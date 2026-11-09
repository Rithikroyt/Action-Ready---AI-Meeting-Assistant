// WEEK 4 STAGE B: read-only case list for the website's Overview (one shared project workspace), so case
// history survives serverless hosts. Allowlisted summary fields only: never notes, drafts, evidence, emails or
// tool output. One execution serves the whole Overview; the full case is still read from the job-status endpoint.
const LIMIT = 30;
const STALE_MINUTES = 20;
const rows = (n) => $(n).all().map((i) => i.json || {});
const jobs = rows('Read Recent Jobs');
const cases = rows('Read Case Summaries');
if ([...jobs, ...cases].some((r) => r.error)) return [{ json: { http_status: 503, response_body: { schema_version: '1', error: { code: 'STORAGE_UNAVAILABLE', message: 'Case storage could not be read. Retry later.' } } } }];
const parse = (x) => { if (typeof x !== 'string' || !x) return null; try { return JSON.parse(x); } catch (e) { return null; } };
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const s = (x, n) => (typeof x === 'string' && x !== '' ? x.slice(0, n) : null);
const iso = (x) => { if (!x) return null; const d = new Date(x); return isNaN(d.getTime()) ? null : d.toISOString(); };
const byCase = {};
for (const c of cases) if (c.case_id) byCase[c.case_id] = c;
const list = jobs
  .filter((j) => /^[0-9a-f-]{36}$/.test(String(j.job_id || '')))
  .sort((a, b) => String(iso(b.accepted_at) || '').localeCompare(String(iso(a.accepted_at) || '')))
  .slice(0, LIMIT)
  .map((j) => {
    let execution_status = ['ACCEPTED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(j.execution_status) ? j.execution_status : 'UNKNOWN';
    let stale = false;
    if (['ACCEPTED', 'RUNNING'].includes(execution_status)) {
      const since = new Date(j.started_at || j.accepted_at || 0).getTime();
      if (!since || Date.now() - since > STALE_MINUTES * 60000) { stale = true; execution_status = 'UNKNOWN'; }
    }
    const c = j.case_id ? byCase[j.case_id] || null : null;
    const rd = c ? parse(c.readiness_json) : null;
    const rt = rd && rd.routing && typeof rd.routing === 'object' ? rd.routing : null;
    return {
      job_id: j.job_id,
      case_id: s(j.case_id, 60),
      execution_status,
      stale,
      meeting_title: c ? s(c.meeting_title, 200) : null,
      period: j.period_start && j.period_end ? { start: s(j.period_start, 10), end: s(j.period_end, 10), timezone: s(j.timezone, 60) } : null,
      timestamps: { accepted_at: iso(j.accepted_at), started_at: iso(j.started_at), completed_at: iso(j.completed_at), updated_at: iso(j.status_updated_at) },
      error: j.error_code ? { code: s(j.error_code, 60), message: s(j.error_detail, 300) } : null,
      ai_review: { status: c ? s(c.review_status, 60) : null, score: c ? num(c.latest_score) : null, version: c ? num(c.latest_version) : null },
      operational_readiness: {
        status: c ? (['READY', 'BLOCKED', 'UNKNOWN', 'NOT_CHECKED'].includes(c.readiness_status) ? c.readiness_status : 'UNKNOWN') : null,
        reasons: rd && Array.isArray(rd.reasons) ? rd.reasons.slice(0, 6).map((r) => ({ severity: s(r.severity, 20), code: s(r.code, 60), owner_id: s(r.owner_id, 60), message: s(r.message, 300) })) : [],
        checked_version: rd ? num(rd.checked_version) : null,
      },
      routing: rt ? { route_id: s(rt.route_id, 30), role: s(rt.role, 40), label: s(rt.label, 60), why: Array.isArray(rt.why) ? rt.why.slice(0, 3).map((x) => String(x).slice(0, 300)) : [], next: s(rt.next, 300), not_done: s(rt.not_done, 200), also: [], codes: Array.isArray(rt.codes) ? rt.codes.slice(0, 10).map((x) => String(x).slice(0, 60)) : [], rules_version: s(rt.rules_version, 40), source: 'WORKFLOW_COORDINATOR' } : null,
      human_approval: { status: c ? s(c.approval_status, 30) || 'NOT_REQUESTED' : null },
    };
  });
return [{ json: { http_status: 200, response_body: { schema_version: '1', jobs: list, limit: LIMIT } } }];
