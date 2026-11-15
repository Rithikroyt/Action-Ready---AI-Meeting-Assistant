// @core
// W5 · Validate Experiment — allowlisted corpus prompts only, run cap, one RUNNING experiment at a time.
const request = $('W5 · Experiment Request').first().json;
const existing = $input.all().map((i) => i.json || {}).filter((r) => r.experiment_id);
const v = validateExperiment(request.body, existing);
if (!v.ok) return [{ json: { valid: false, http_status: v.http, response_body: { schema_version: '1', error: { code: v.code, message: v.message } } } }];
const experiment_id = 'w5x_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
return [{ json: { valid: true, experiment_id, request: v.request, total_runs: v.total_runs } }];
