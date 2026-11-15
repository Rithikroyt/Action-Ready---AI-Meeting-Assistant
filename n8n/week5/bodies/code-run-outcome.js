// @core
// W5 · Code Run Outcome — deterministic coding of the parsed answer into the stored run row. Runs once per item.
const x = $input.item.json;
const row = runRow(x.run, x.run.experiment_id, x.call);
return { json: { ...row, tokens_in: x.tokens_in, tokens_out: x.tokens_out } };
