// @core
// W5 · Agent Readability Audit — deterministic 0–100 rubric over the published ActionReady profile.
const r = readability(agentProfile());
return [{ json: { ...$input.first().json, readability_score: r.score, readability_json: JSON.stringify(r) } }];
