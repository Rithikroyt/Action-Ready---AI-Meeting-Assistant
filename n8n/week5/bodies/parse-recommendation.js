// @core
// W5 · Parse Recommendation — provider status + raw text, then the strict contract parser. No retries. Runs once per item.
const g = geminiText($input.item.json);
const run = $('W5 · Stamp Call').item.json;
const parse = parseModelOutput(g.text, run.prompt_id, g.status);
return { json: { run, call: { provider_status: g.status, raw: g.text, latency_ms: Date.now() - Number(run.started_ms || Date.now()), started_at: run.started_at }, parse_error: parse.parse_error, parse_success: parse.parse_success, tokens_in: g.tokens_in, tokens_out: g.tokens_out } };
