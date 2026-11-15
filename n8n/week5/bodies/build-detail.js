// @core
// W5 · Build Detail — one experiment, its runs, and metrics RECOMPUTED from those runs (read-only).
const id = String(($('W5 · Detail Request').first().json.query || {}).id || '');
if (!/^w5x_[a-z0-9]{4,14}_[a-z0-9]{6}$/.test(id)) return [{ json: { http_status: 400, response_body: { schema_version: '1', error: { code: 'INVALID_ID', message: 'Unknown experiment id format.' } } } }];
const exp = $('W5 · Read Experiment').all().map((i) => i.json || {}).find((r) => r.experiment_id === id);
if (!exp) return [{ json: { http_status: 404, response_body: { schema_version: '1', error: { code: 'NOT_FOUND', message: 'No such experiment.' } } } }];
const runs = $input.all().map((i) => i.json || {}).filter((r) => r.experiment_id === id && r.run_key).sort((a, b) => Number(a.run_index) - Number(b.run_index));
const metrics = aggregate(runs);
const rubric = readability(agentProfile());
const slim = runs.map((r) => ({ ...r, raw_output: String(r.raw_output || '').slice(0, 4000) }));
return [{ json: { http_status: 200, response_body: { schema_version: '1', experiment: exp, runs: slim, metrics, readability: rubric, recommendations: recommendations(metrics, rubric) } } }];
