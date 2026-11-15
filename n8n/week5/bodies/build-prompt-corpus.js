// @core
// W5 · Build Prompt Corpus — the versioned corpus (w5-p1), product dossiers and the ActionReady profile used by this experiment.
const v = $input.first().json;
const ids = [...new Set([...v.request.prompt_ids, ...v.request.cold_prompt_ids])];
const corpus = {
  version: W5.corpusVersion,
  prompts: PROMPTS.filter((p) => ids.includes(p.prompt_id)),
  products: PRODUCTS.map((p) => ({ id: p.id, name: p.name, synthetic: p.synthetic, position: p.position })),
  profile_version: W5.profileVersion,
  profile_fingerprint: hashString(JSON.stringify(agentProfile())).toString(16),
  dossier_fingerprint: hashString(JSON.stringify(PRODUCTS.map((p) => [p.copy, dossierProfile(p)]))).toString(16),
};
return [{ json: { ...v, corpus } }];
