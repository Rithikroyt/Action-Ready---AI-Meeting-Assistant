// @core
// W5 · Aggregate Visibility — metrics recomputed from the stored runs (never from model output).
const exp = $('W5 · Prepare Test Runs').first().json.experiment;
const all = $input.all().map((i) => i.json || {}).filter((r) => r.experiment_id === exp.experiment_id && r.run_key);
const keys = new Set(all.map((r) => r.run_key));
const m = aggregate(all);
const missing = exp.requested_runs - keys.size;
const status = m.totals.valid === exp.requested_runs && missing === 0 ? 'COMPLETE' : m.totals.valid > 0 ? 'PARTIAL' : 'FAILED';
const problems = [];
if (missing > 0) problems.push(missing + ' run(s) were not stored');
if (keys.size !== all.length) problems.push('duplicate run keys found');
if (m.totals.failed > 0) problems.push(m.totals.failed + ' run(s) failed: ' + Object.entries(m.totals.errors).map(([k, n]) => k + ' ' + n).join(', '));
return [{ json: { experiment_id: exp.experiment_id, status, valid_runs: m.totals.valid, failed_runs: exp.requested_runs - m.totals.valid, completed_at: new Date().toISOString(), error_detail: problems.join('; ').slice(0, 1000) } }];
