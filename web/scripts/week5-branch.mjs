// The Week 5 n8n branch as data: every node, parameter and connection. Used by
//   - tests (graph isolation, read-only GETs, table bindings), and
//   - the canvas build (addNode / addConnection operations).
// IDs default to placeholders; the real table/credential IDs are passed in only when building operations.
import { buildWeek5Nodes } from "./build-week5-nodes.mjs";

export const P = "W5 · ";
export const EXP_COLS = [
  ["experiment_id", "string"], ["created_at", "string"], ["completed_at", "string"], ["status", "string"], ["kind", "string"], ["prompt_ids", "string"],
  ["prompt_set_version", "string"], ["contexts", "string"], ["models", "string"], ["reps_per_cell", "number"], ["requested_runs", "number"], ["valid_runs", "number"],
  ["failed_runs", "number"], ["profile_version", "string"], ["profile_fingerprint", "string"], ["seed", "number"], ["requested_by_hash", "string"],
  ["readability_score", "number"], ["readability_json", "string"], ["advisor_text", "string"], ["error_detail", "string"],
];
export const RUN_COLS = [
  ["run_key", "string"], ["experiment_id", "string"], ["run_index", "number"], ["prompt_id", "string"], ["segment", "string"], ["model_id", "string"], ["context", "string"],
  ["order_json", "string"], ["started_at", "string"], ["latency_ms", "number"], ["provider_status", "string"], ["parse_success", "boolean"], ["parse_error", "string"],
  ["parsed_json", "string"], ["ar_mentioned", "boolean"], ["ar_shortlisted", "boolean"], ["ar_recommended", "boolean"], ["ar_rank", "number"], ["ar_claims", "string"],
  ["ar_unsupported", "string"], ["peer_json", "string"], ["flags", "string"], ["raw_output", "string"], ["candidates_count", "number"], ["tokens_in", "number"], ["tokens_out", "number"],
];
export const MODEL_ROUTES = [
  { id: "gemini-3.5-flash", node: "Gemini A" },
  { id: "gemini-3.5-flash-lite", node: "Gemini B" },
];

const rl = (id, name) => ({ __rl: true, mode: "id", value: id, cachedResultName: name });
const col = ([id, type]) => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type, readOnly: false, removed: false });
const cond = (keyName, keyValue) => ({ keyName, condition: "eq", keyValue });
const get = (table, conditions) => ({ resource: "row", operation: "get", dataTableId: table, matchType: "allConditions", filters: { conditions }, returnAll: true });
const mapped = (cols, valueOf) => ({ mappingMode: "defineBelow", value: Object.fromEntries(cols.map(([c, t]) => [c, valueOf(c, t)])), matchingColumns: [], schema: cols.map(col) });
const respond = () => ({
  respondWith: "json",
  responseBody: "={{ JSON.stringify($json.response_body) }}",
  options: { responseCode: "={{ $json.http_status }}", responseHeaders: { entries: [{ name: "Content-Type", value: "application/json; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }, { name: "X-Content-Type-Options", value: "nosniff" }] } },
});
const ifTrue = (id, expr) => ({ conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id, leftValue: expr, rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} });

export function buildBranch(ids = {}) {
  const t = {
    exp: rl(ids.expTable ?? "W5_EXPERIMENTS_TABLE_ID", "AR_W5_Experiments"),
    run: rl(ids.runTable ?? "W5_RUNS_TABLE_ID", "AR_W5_Runs"),
    hookCred: { httpHeaderAuth: { id: ids.hookCredId ?? "WEBSITE_HEADER_AUTH_CREDENTIAL", name: ids.hookCredName ?? "ActionReady Website API" } },
    gemCred: { googlePalmApi: { id: ids.geminiCredId ?? "GEMINI_CREDENTIAL", name: ids.geminiCredName ?? "Google Gemini(PaLM) Api account" } },
  };
  const code = buildWeek5Nodes();
  const X = ids.x ?? -2144;
  const Y = ids.y ?? 11500;
  const at = (col, row) => [X + col * 260, Y + row * 220];
  const hook = (name, method, path, pos) => ({ name, type: "n8n-nodes-base.webhook", typeVersion: 2.2, position: pos, parameters: { httpMethod: method, path, authentication: "headerAuth", responseMode: "responseNode", options: {} }, credentials: t.hookCred });
  const codeNode = (name, file, pos, perItem = false) => ({ name, type: "n8n-nodes-base.code", typeVersion: 2, position: pos, parameters: { ...(perItem ? { mode: "runOnceForEachItem" } : {}), jsCode: code[file] } });
  const gemini = (name, model, pos) => ({
    name,
    type: "@n8n/n8n-nodes-langchain.googleGemini",
    typeVersion: 1.2,
    position: pos,
    parameters: {
      resource: "text",
      operation: "message",
      modelId: { __rl: true, mode: "id", value: `models/${model}` },
      messages: { values: [{ content: "={{ $json.user_message }}", role: "user" }] },
      simplify: false,
      jsonOutput: true,
      builtInTools: {},
      options: { systemMessage: "={{ $json.system_message }}", temperature: 0.7, maxOutputTokens: 4096, thinkingBudget: 0 },
    },
    credentials: t.gemCred,
  });

  const nodes = [
    hook(P + "Experiment Request", "POST", "actionready/v1/visibility/experiments", at(0, 0)),
    { name: P + "Read Running Experiments", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(1, 0), parameters: get(t.exp, [cond("status", "RUNNING")]) },
    codeNode(P + "Validate Experiment", "validate-experiment.node.js", at(2, 0)),
    { name: P + "Valid?", type: "n8n-nodes-base.if", typeVersion: 2.3, position: at(3, 0), parameters: ifTrue("w5-valid", "={{ $json.valid }}") },
    { name: P + "Respond Refused", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, position: at(4, 1), parameters: respond() },
    codeNode(P + "Build Prompt Corpus", "build-prompt-corpus.node.js", at(4, 0)),
    codeNode(P + "Prepare Test Runs", "prepare-test-runs.node.js", at(5, 0)),
    {
      name: P + "Create Experiment",
      type: "n8n-nodes-base.dataTable",
      typeVersion: 1.1,
      position: at(6, 0),
      parameters: { resource: "row", operation: "insert", dataTableId: t.exp, columns: mapped(EXP_COLS, (c) => `={{ $json.experiment.${c} }}`), options: {} },
    },
    { name: P + "Read Back Experiment", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(7, 0), parameters: get(t.exp, [cond("experiment_id", "={{ $('W5 · Prepare Test Runs').first().json.experiment.experiment_id }}")]) },
    codeNode(P + "Verify Experiment Saved", "verify-experiment-saved.node.js", at(8, 0)),
    { name: P + "Saved?", type: "n8n-nodes-base.if", typeVersion: 2.3, position: at(9, 0), parameters: ifTrue("w5-saved", "={{ $json.saved }}") },
    { name: P + "Respond Accepted", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, position: at(10, 0), parameters: respond() },
    codeNode(P + "Split Runs", "split-runs.node.js", at(11, 0)),
    { name: P + "Loop Over Runs", type: "n8n-nodes-base.splitInBatches", typeVersion: 3, position: at(12, 0), parameters: { batchSize: 1, options: {} } },
    codeNode(P + "Stamp Call", "stamp-call.node.js", at(13, 1), true),
    {
      name: P + "Model Switch",
      type: "n8n-nodes-base.switch",
      typeVersion: 3.4,
      position: at(14, 1),
      parameters: {
        mode: "rules",
        rules: {
          values: MODEL_ROUTES.map((m, i) => ({
            conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: `w5-model-${i}`, leftValue: "={{ $json.model_id }}", rightValue: m.id, operator: { type: "string", operation: "equals" } }], combinator: "and" },
            renameOutput: true,
            outputKey: m.node,
          })),
        },
        options: {},
      },
    },
    gemini(P + "Gemini A", MODEL_ROUTES[0].id, at(15, 0.5)),
    gemini(P + "Gemini B", MODEL_ROUTES[1].id, at(15, 1.6)),
    codeNode(P + "Parse Recommendation", "parse-recommendation.node.js", at(16, 1), true),
    codeNode(P + "Code Run Outcome", "code-run-outcome.node.js", at(17, 1), true),
    {
      name: P + "Persist Run",
      type: "n8n-nodes-base.dataTable",
      typeVersion: 1.1,
      position: at(18, 1),
      parameters: {
        resource: "row",
        operation: "upsert",
        dataTableId: t.run,
        matchType: "allConditions",
        filters: { conditions: [cond("run_key", "={{ $json.run_key }}")] },
        columns: mapped(RUN_COLS, (c, ty) => (ty === "boolean" ? `={{ $json.${c} === true }}` : `={{ $json.${c} }}`)),
        options: {},
      },
    },
    { name: P + "Read Back Run", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(19, 1), parameters: get(t.run, [cond("run_key", "={{ $('W5 · Code Run Outcome').item.json.run_key }}")]) },
    codeNode(P + "Verify Run Saved", "verify-run-saved.node.js", at(20, 1), true),
    { name: P + "Rate-limit Spacing", type: "n8n-nodes-base.wait", typeVersion: 1.1, position: at(21, 1), parameters: { resume: "timeInterval", amount: 13, unit: "seconds" } },
    { name: P + "Read Experiment Runs", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(13, -1), parameters: get(t.run, [cond("experiment_id", "={{ $('W5 · Prepare Test Runs').first().json.experiment.experiment_id }}")]) },
    codeNode(P + "Aggregate Visibility", "aggregate-visibility.node.js", at(14, -1)),
    codeNode(P + "Agent Readability Audit", "agent-readability-audit.node.js", at(15, -1)),
    {
      name: P + "Finalize Experiment",
      type: "n8n-nodes-base.dataTable",
      typeVersion: 1.1,
      position: at(16, -1),
      parameters: {
        resource: "row",
        operation: "update",
        dataTableId: t.exp,
        matchType: "allConditions",
        filters: { conditions: [cond("experiment_id", "={{ $json.experiment_id }}")] },
        columns: mapped(
          EXP_COLS.filter(([c]) => ["status", "valid_runs", "failed_runs", "completed_at", "error_detail", "readability_score", "readability_json"].includes(c)),
          (c) => `={{ $json.${c} }}`,
        ),
        options: {},
      },
    },
    // read-only GETs
    hook(P + "List Request", "GET", "actionready/v1/visibility/experiments", at(0, 3)),
    { name: P + "Read Experiment List", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(1, 3), parameters: get(t.exp, [cond("prompt_set_version", "w5-p1")]) },
    codeNode(P + "Build List", "build-list.node.js", at(2, 3)),
    { name: P + "Respond List", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, position: at(3, 3), parameters: respond() },
    hook(P + "Detail Request", "GET", "actionready/v1/visibility/experiment", at(0, 4)),
    { name: P + "Read Experiment", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(1, 4), parameters: get(t.exp, [cond("experiment_id", "={{ String(($json.query || {}).id || '') }}")]) },
    { name: P + "Read Runs For Detail", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: at(2, 4), parameters: get(t.run, [cond("experiment_id", "={{ String(($('W5 · Detail Request').first().json.query || {}).id || '') }}")]) },
    codeNode(P + "Build Detail", "build-detail.node.js", at(3, 4)),
    { name: P + "Respond Detail", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, position: at(4, 4), parameters: respond() },
    {
      name: "Week 5 · AI Market Visibility & Agent Readiness",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [X - 60, Y - 520],
      parameters: {
        width: 22 * 260 + 160,
        height: 1700,
        color: 6,
        content:
          "## WEEK 5 · AI MARKET VISIBILITY & AGENT READINESS\nCan an AI agent understand ActionReady well enough to recommend it? Isolated experiment branch — **no connection to Gmail, Review & Send, dispatch, tracker, or the meeting Writer/Reviewer**.\n\n**Flow:** POST experiment → validate (corpus prompts only, ≤60 runs, one at a time) → build prompt corpus (w5-p1, FOD) → prepare runs (seeded, paired dossier order) → save RUNNING + read back → **202** → loop: model switch → Gemini (search off, JSON) → parse (strict contract, no retries) → code outcome (deterministic) → persist + read back → spacing → aggregate (code, recomputed) → readability audit (code rubric) → finalize.\n\n**Contexts:** COLD (no material) · COPY (marketing copy ×4) · STRUCTURED (copy + same-schema profile ×4). Tools A/B/C are SYNTHETIC.\n**Code calculates. AI observes.** Missing data is null, never zero. Source: web/src/lib/visibility/core.ts → n8n/week5/*.node.js",
      },
    },
  ];

  // NOTE: Code nodes that read $input.all() must NOT use executeOnce (n8n would pass them only the first item).
  const settings = {
    [P + "Read Running Experiments"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Build Prompt Corpus"]: { executeOnce: true },
    [P + "Prepare Test Runs"]: { executeOnce: true },
    [P + "Create Experiment"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Read Back Experiment"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Gemini A"]: { onError: "continueRegularOutput", alwaysOutputData: true },
    [P + "Gemini B"]: { onError: "continueRegularOutput", alwaysOutputData: true },
    [P + "Persist Run"]: { alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Read Back Run"]: { alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Read Experiment Runs"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Agent Readability Audit"]: { executeOnce: true },
    [P + "Read Experiment List"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Read Experiment"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
    [P + "Read Runs For Detail"]: { executeOnce: true, alwaysOutputData: true, onError: "continueRegularOutput" },
  };

  const connections = [
    ["Experiment Request", "Read Running Experiments"],
    ["Read Running Experiments", "Validate Experiment"],
    ["Validate Experiment", "Valid?"],
    ["Valid?", "Build Prompt Corpus", 0],
    ["Valid?", "Respond Refused", 1],
    ["Build Prompt Corpus", "Prepare Test Runs"],
    ["Prepare Test Runs", "Create Experiment"],
    ["Create Experiment", "Read Back Experiment"],
    ["Read Back Experiment", "Verify Experiment Saved"],
    ["Verify Experiment Saved", "Saved?"],
    ["Saved?", "Respond Accepted", 0],
    ["Saved?", "Respond Refused", 1],
    ["Respond Accepted", "Split Runs"],
    ["Split Runs", "Loop Over Runs"],
    ["Loop Over Runs", "Read Experiment Runs", 0],
    ["Loop Over Runs", "Stamp Call", 1],
    ["Stamp Call", "Model Switch"],
    ["Model Switch", "Gemini A", 0],
    ["Model Switch", "Gemini B", 1],
    ["Gemini A", "Parse Recommendation"],
    ["Gemini B", "Parse Recommendation"],
    ["Parse Recommendation", "Code Run Outcome"],
    ["Code Run Outcome", "Persist Run"],
    ["Persist Run", "Read Back Run"],
    ["Read Back Run", "Verify Run Saved"],
    ["Verify Run Saved", "Rate-limit Spacing"],
    ["Rate-limit Spacing", "Loop Over Runs"],
    ["Read Experiment Runs", "Aggregate Visibility"],
    ["Aggregate Visibility", "Agent Readability Audit"],
    ["Agent Readability Audit", "Finalize Experiment"],
    ["List Request", "Read Experiment List"],
    ["Read Experiment List", "Build List"],
    ["Build List", "Respond List"],
    ["Detail Request", "Read Experiment"],
    ["Read Experiment", "Read Runs For Detail"],
    ["Read Runs For Detail", "Build Detail"],
    ["Build Detail", "Respond Detail"],
  ].map(([a, b, i = 0]) => ({ source: P + a, target: P + b, sourceIndex: i, targetIndex: 0 }));

  return { nodes, settings, connections };
}

/** MCP update_workflow operations for the branch (batched by the caller; max 100 ops per call). */
export function branchOperations(ids) {
  const { nodes, settings, connections } = buildBranch(ids);
  return [
    ...nodes.map((node) => ({ type: "addNode", node })),
    ...Object.entries(settings).map(([nodeName, s]) => ({ type: "setNodeSettings", nodeName, settings: s })),
    ...connections.map((c) => ({ type: "addConnection", ...c })),
  ];
}
