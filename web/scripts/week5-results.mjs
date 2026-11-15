// Recomputes Week 5 metrics from a dump of stored AR_W5_Runs rows (independent check that the stored summary,
// the n8n detail endpoint and the website all agree with the raw runs).
//   node --experimental-strip-types scripts/week5-results.mjs <rows.json>   (rows.json = { rows | runs: [...] } or [...])
import { readFileSync } from "node:fs";
import { aggregate } from "../src/lib/visibility/core.ts";

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.runs);
const byExp = new Map();
for (const r of rows) byExp.set(r.experiment_id, [...(byExp.get(r.experiment_id) ?? []), r]);
const f = (r) => (r ? `${r.k}/${r.n}${r.rate === null ? " (n/a)" : ` = ${Math.round(r.rate * 100)}%`}` : "n/a");
for (const [id, rs] of byExp) {
  const m = aggregate(rs);
  console.log(`\n== ${id}: ${rs.length} runs, ${m.totals.valid} valid, errors ${JSON.stringify(m.totals.errors)}`);
  if (m.cold) console.log(`COLD appearance ${f(m.cold.appearance)} | recommendation ${f(m.cold.recommendation)}`);
  for (const [ctx, s] of Object.entries(m.contexts))
    console.log(`${ctx}: appearance ${f(s.appearance)} | shortlist ${f(s.shortlist)} | recommended ${f(s.recommendation)} | top ${f(s.top_position)} | cap.accuracy ${f(s.capability_accuracy)} | unsupported-claim runs ${f(s.unsupported_claims)} | 95% rec ${s.recommendation.low}-${s.recommendation.high}`);
  for (const [ctx, r] of Object.entries(m.negative)) console.log(`P08 correct rejection ${ctx}: ${f(r)}`);
  for (const [ctx, segs] of Object.entries(m.by_segment)) for (const [seg, s] of Object.entries(segs)) console.log(`  ${ctx} ${seg}: appearance ${f(s.appearance)} recommended ${f(s.recommendation)}`);
  for (const p of m.by_prompt) console.log(`  ${p.prompt_id} ${p.context}: appear ${f(p.slice.appearance)} rec ${f(p.slice.recommendation)} acc ${f(p.slice.capability_accuracy)}${p.correct_rejection ? ` rejection ${f(p.correct_rejection)}` : ""}`);
  console.log(`consistency ${JSON.stringify(m.consistency)}`);
  console.log(`peer accuracy ${Object.entries(m.peers).map(([k, v]) => `${k} ${f(v.accuracy)}`).join(" | ")}`);
  const unsup = {};
  for (const r of rs) for (const k of String(r.ar_unsupported || "").split(",").filter(Boolean)) unsup[`${r.context}:${k}`] = (unsup[`${r.context}:${k}`] ?? 0) + 1;
  console.log(`unsupported claims about ActionReady: ${JSON.stringify(unsup)}`);
  const tin = rs.reduce((a, r) => a + (Number(r.tokens_in) || 0), 0);
  const tout = rs.reduce((a, r) => a + (Number(r.tokens_out) || 0), 0);
  console.log(`tokens in ${tin}, out ${tout}`);
}
