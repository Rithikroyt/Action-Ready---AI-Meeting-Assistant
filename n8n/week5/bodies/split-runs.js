// @core
// W5 · Split Runs — one item per planned run, with the exact system + user messages sent to the model.
const p = $('W5 · Prepare Test Runs').first().json;
return p.runs.map((run) => ({ json: { ...run, experiment_id: p.experiment.experiment_id, system_message: systemMessage(run.context), user_message: userMessage(run) } }));
