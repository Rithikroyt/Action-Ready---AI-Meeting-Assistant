// Writes the sanitized Week 5 n8n export: ONLY the Week 5 branch, built from the same definition that is deployed
// (the live diff proved the deployed Code nodes byte-identical to this source). Placeholders replace every credential,
// data-table ID and webhook ID — nothing private is fetched, so nothing private can leak.
//   node scripts/export-week5.mjs   → ../submission/ActionReady_Week5_Sanitized_Submission.json
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildBranch } from "./week5-branch.mjs";

export function sanitizedWorkflow() {
  const { nodes, settings, connections } = buildBranch({
    expTable: "REPLACE_WITH_YOUR_AR_W5_Experiments_TABLE_ID",
    runTable: "REPLACE_WITH_YOUR_AR_W5_Runs_TABLE_ID",
    hookCredId: "REPLACE_WITH_YOUR_HEADER_AUTH_CREDENTIAL",
    hookCredName: "Your header-auth credential",
    geminiCredId: "REPLACE_WITH_YOUR_GEMINI_CREDENTIAL",
    geminiCredName: "Your Google Gemini credential",
  });
  const out = { name: "ActionReady - Week 5 AI Visibility Lab (sanitized export)", nodes: [], connections: {}, settings: { executionOrder: "v1" }, pinData: {}, meta: { note: "Week 5 branch only. Create the two data tables (columns in submission/week5/README.md), attach your own credentials, then activate. No real data, IDs or secrets included." } };
  nodes.forEach((n, i) => out.nodes.push({ id: `w5-node-${String(i + 1).padStart(2, "0")}`, ...n, ...(settings[n.name] ?? {}) }));
  for (const c of connections) {
    const src = (out.connections[c.source] ??= { main: [] });
    while (src.main.length <= c.sourceIndex) src.main.push([]);
    src.main[c.sourceIndex].push({ node: c.target, type: "main", index: c.targetIndex });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = fileURLToPath(new URL("../../submission/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const wf = sanitizedWorkflow();
  writeFileSync(dir + "ActionReady_Week5_Sanitized_Submission.json", JSON.stringify(wf, null, 2) + "\n");
  console.log(`nodes ${wf.nodes.length}, connections from ${Object.keys(wf.connections).length} nodes`);
}
