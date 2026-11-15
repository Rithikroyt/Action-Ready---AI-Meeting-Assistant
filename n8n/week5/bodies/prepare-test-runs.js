// @core
// W5 · Prepare Test Runs — every (model × context × prompt × rep) run with a seeded, paired dossier order.
const v = $input.first().json;
const runs = planRuns(v.experiment_id, v.request);
const now = new Date().toISOString();
const experiment = {
  experiment_id: v.experiment_id,
  created_at: now,
  completed_at: '',
  status: 'RUNNING',
  kind: v.request.kind,
  prompt_ids: [...v.request.prompt_ids, ...v.request.cold_prompt_ids.map((p) => 'COLD:' + p)].join(','),
  prompt_set_version: W5.corpusVersion,
  contexts: [...v.request.contexts, ...(v.request.cold_prompt_ids.length ? ['COLD'] : [])].join(','),
  models: v.request.models.join(','),
  reps_per_cell: v.request.reps,
  requested_runs: runs.length,
  valid_runs: 0,
  failed_runs: 0,
  profile_version: W5.profileVersion,
  profile_fingerprint: v.corpus.profile_fingerprint,
  seed: v.request.seed,
  requested_by_hash: v.request.requested_by_hash || '',
  readability_score: null,
  readability_json: '',
  advisor_text: '',
  error_detail: '',
};
if (runs.length !== v.total_runs) throw new Error('Run plan mismatch: ' + runs.length + ' vs ' + v.total_runs);
return [{ json: { experiment, runs } }];
