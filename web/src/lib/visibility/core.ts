// ActionReady Week 5 — AI Visibility & Delegation Lab: the ONE source of truth.
//
// This file is used twice:
//   1. by the website (imported as TypeScript), and
//   2. by the n8n Code nodes — `npm run week5:nodes` strips the types and concatenates it with each
//      node body into n8n/week5/*.node.js (tests fail if those generated files are stale).
// So it must stay self-contained: no imports, no enums/namespaces, plain functions and constants.
//
// Principle: the model only OBSERVES (fills the answer contract). CODE parses, scores and aggregates.

export const W5 = {
  corpusVersion: "w5-p1",
  contract: "ar.w5.rec.v1",
  profileSchema: "actionready.agent-profile/1",
  profileVersion: "1.0.0",
  maxRuns: 60,
  maxReps: 5,
  runningTimeoutMinutes: 15,
  minHeadlineN: 10,
  minPromptN: 3,
} as const;

// ---------------------------------------------------------------------------------------------------
// Models (pinned by exact ID; both reached through the workflow's existing Gemini credential)
// ---------------------------------------------------------------------------------------------------
// Confirmed available on the existing credential (model list lookup, 2026-11-14); stable, not preview.
export const MODELS: { id: string; label: string; primary: boolean }[] = [
  { id: "gemini-3.5-flash", label: "Gemini A", primary: true },
  { id: "gemini-3.5-flash-lite", label: "Gemini B", primary: false },
];

/** Pulls the model's text out of the n8n Google Gemini node output (raw or simplified shapes). */
export function geminiText(res: unknown): { status: "OK" | "ERROR" | "TIMEOUT"; text: string | null; tokens_in: number | null; tokens_out: number | null } {
  const r = (res && typeof res === "object" ? res : {}) as Record<string, unknown>;
  if (r.error) {
    const e = r.error as { message?: unknown } | string;
    const msg = String(typeof e === "object" && e && "message" in e ? e.message : e);
    return { status: /timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(msg) ? "TIMEOUT" : "ERROR", text: msg.slice(0, 2000), tokens_in: null, tokens_out: null };
  }
  const usage = (r.usageMetadata ?? null) as { promptTokenCount?: number; candidatesTokenCount?: number } | null;
  const tin = usage && typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : null;
  const tout = usage && typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null;
  const fromParts = (c: unknown) => {
    const parts = c && typeof c === "object" ? (c as { parts?: unknown }).parts : null;
    return Array.isArray(parts) ? parts.map((p) => (p && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("") : null;
  };
  const cands = Array.isArray(r.candidates) ? r.candidates : null;
  let text: string | null = cands && cands[0] ? fromParts((cands[0] as { content?: unknown }).content) : null;
  if (text === null && r.content !== undefined) text = typeof r.content === "string" ? r.content : fromParts(r.content);
  if (text === null && typeof r.text === "string") text = r.text;
  if (text === null && r.content && typeof r.content === "object" && (r.content as { contract?: unknown }).contract) text = JSON.stringify(r.content);
  if (text === null && typeof r.contract === "string") text = JSON.stringify(r);
  if (text === null) return { status: "ERROR", text: JSON.stringify(r).slice(0, 2000), tokens_in: tin, tokens_out: tout };
  return { status: "OK", text, tokens_in: tin, tokens_out: tout };
}

// ---------------------------------------------------------------------------------------------------
// Capability vocabulary (the model may only claim these keys; code checks them against truth tables)
// ---------------------------------------------------------------------------------------------------
export const CAPABILITIES: { key: string; label: string }[] = [
  { key: "text_notes_input", label: "Accepts typed or pasted meeting notes" },
  { key: "txt_upload", label: "Accepts uploaded .txt notes" },
  { key: "audio_recording", label: "Records meeting audio" },
  { key: "live_transcription", label: "Transcribes meetings" },
  { key: "meeting_platform_join", label: "Joins Zoom / Teams / Meet calls" },
  { key: "action_item_extraction", label: "Extracts action items" },
  { key: "source_quote_evidence", label: "Links each action to its source (quote or timestamp)" },
  { key: "second_ai_review", label: "Independent second AI review of the draft" },
  { key: "commitment_lookup", label: "Looks up existing commitments" },
  { key: "capacity_check", label: "Checks owners' workload / capacity" },
  { key: "role_routing", label: "Routes each case to a responsible role" },
  { key: "human_approval_required", label: "Human approval is required before sending" },
  { key: "per_person_email_drafts", label: "Drafts one follow-up email per person" },
  { key: "auto_send_without_review", label: "Sends follow-up automatically without review" },
  { key: "scheduled_reminders", label: "Sends scheduled reminders" },
  { key: "task_tracker_publish", label: "Publishes approved tasks to a shared tracker" },
  { key: "crm_sync", label: "Syncs with a CRM" },
  { key: "task_board", label: "Task boards" },
  { key: "jira_slack_integration", label: "Jira / Slack integration" },
  { key: "calendar_scheduling", label: "Calendar scheduling" },
];
export const CAP_KEYS: string[] = CAPABILITIES.map((c) => c.key);

// ---------------------------------------------------------------------------------------------------
// Products: ActionReady (real class project) + three SYNTHETIC comparison profiles.
// Each has comparable marketing copy and the SAME structured profile schema (balanced AFTER condition).
// ---------------------------------------------------------------------------------------------------
export interface Product {
  id: string;
  name: string;
  synthetic: boolean;
  position: string;
  copy: string;
  supported: string[];
  category: string;
  use_cases: string[];
  supported_inputs: string[];
  approval_required_for: string[];
  integrations: string[];
  limitations: string[];
}

export const PRODUCTS: Product[] = [
  {
    id: "actionready",
    name: "ActionReady",
    synthetic: false,
    position: "Evidence, capacity and human approval",
    copy:
      "ActionReady turns meeting notes into follow-up a team can trust. Paste or upload your notes and ActionReady extracts each action item with the quote it came from, has a second AI review the draft against the notes, and checks every new commitment against the owner's existing work and recorded capacity. Each case is routed to the person who must act next. When the plan is ready, an approver reviews one email per person and approves the exact message before anything is sent, and approved tasks are published to a shared tracker.",
    supported: ["text_notes_input", "txt_upload", "action_item_extraction", "source_quote_evidence", "second_ai_review", "commitment_lookup", "capacity_check", "role_routing", "human_approval_required", "per_person_email_drafts", "task_tracker_publish"],
    category: "Meeting-to-execution assistant",
    use_cases: ["Turn meeting notes into owned action items with evidence", "Check new work against existing commitments and capacity", "Send approved per-person follow-up and publish approved tasks"],
    supported_inputs: ["Pasted meeting notes (text)", "Uploaded .txt notes"],
    approval_required_for: ["Email dispatch", "Task tracker publication"],
    integrations: ["Gmail (sends approved messages)", "Google Sheets (task tracker)"],
    limitations: ["No audio recording or transcription", "Does not join meeting platforms", "Capacity checks depend on recorded capacity data"],
  },
  {
    id: "tool_a",
    name: "Tool A",
    synthetic: true,
    position: "Transcription-first",
    copy:
      "Tool A records your meetings so nobody has to take notes. It joins Zoom, Microsoft Teams and Google Meet calls automatically, records the audio and produces a searchable transcript with speaker labels. After each call it writes a summary and extracts action items, each linked to the transcript timestamp where it was said, so anyone can jump back to the moment a decision was made. Summaries are emailed to every attendee as soon as the meeting ends. Teams use Tool A to keep a complete, searchable memory of every conversation they have.",
    supported: ["audio_recording", "live_transcription", "meeting_platform_join", "action_item_extraction", "source_quote_evidence", "auto_send_without_review"],
    category: "Meeting recorder and transcription assistant",
    use_cases: ["Record and transcribe every meeting", "Search past conversations", "Share automatic summaries with attendees"],
    supported_inputs: ["Live Zoom / Teams / Meet calls", "Recorded meeting audio"],
    approval_required_for: [],
    integrations: ["Zoom", "Microsoft Teams", "Google Meet"],
    limitations: ["No workload or capacity check", "Summaries are sent automatically to attendees", "No review step before distribution"],
  },
  {
    id: "tool_b",
    name: "Tool B",
    synthetic: true,
    position: "Automated follow-up-first",
    copy:
      "Tool B makes sure follow-up actually happens. It pulls action items from your meeting transcripts or notes, drafts personalised follow-up emails for each owner and sends them on a schedule, then keeps nudging with automatic reminders until tasks are marked done. Deals and contacts stay in sync with your CRM. An optional review mode lets a manager check drafts before they go out, but by default Tool B sends automatically so nothing waits on a person. Teams use Tool B to save hours of manual follow-up work every single week.",
    supported: ["text_notes_input", "action_item_extraction", "per_person_email_drafts", "auto_send_without_review", "scheduled_reminders", "crm_sync"],
    category: "Automated meeting follow-up assistant",
    use_cases: ["Send follow-up emails automatically", "Remind owners until tasks are done", "Keep CRM records in sync after meetings"],
    supported_inputs: ["Meeting transcripts", "Pasted meeting notes"],
    approval_required_for: [],
    integrations: ["Email", "CRM"],
    limitations: ["No workload or capacity check", "Review before sending is off by default", "No independent check of extracted actions"],
  },
  {
    id: "tool_c",
    name: "Tool C",
    synthetic: true,
    position: "Task-management-first",
    copy:
      "Tool C is where your team's commitments live. Paste meeting notes and Tool C suggests tasks, owners and estimated hours, then places them on shared task boards. A per-person workload heatmap built from estimated hours and existing tasks shows who is overloaded before you assign more work. Tool C syncs with Jira and Slack, so tasks appear where engineers already work, and its calendar view helps schedule work across the week. Teams use Tool C to plan realistic sprints and keep every meeting decision visible on one shared board.",
    supported: ["text_notes_input", "action_item_extraction", "commitment_lookup", "capacity_check", "task_board", "jira_slack_integration", "calendar_scheduling"],
    category: "Task management with workload planning",
    use_cases: ["Turn meeting notes into tasks on shared boards", "See each person's workload before assigning", "Sync tasks to Jira and Slack"],
    supported_inputs: ["Pasted meeting notes", "Manually created tasks"],
    approval_required_for: [],
    integrations: ["Jira", "Slack", "Calendar"],
    limitations: ["No independent AI review of extracted actions", "No email follow-up", "No evidence quotes from the notes"],
  },
];

export function truthOf(productId: string): Record<string, boolean> {
  const p = PRODUCTS.find((x) => x.id === productId);
  const out: Record<string, boolean> = {};
  for (const k of CAP_KEYS) out[k] = !!p && p.supported.includes(k);
  return out;
}

/** The structured profile given to agents in the STRUCTURED condition — identical schema for all four products. */
export function dossierProfile(p: Product) {
  return {
    schema: W5.profileSchema,
    product: p.name,
    category: p.category,
    use_cases: p.use_cases,
    supported_inputs: p.supported_inputs,
    capabilities: CAP_KEYS.filter((k) => p.supported.includes(k)),
    not_supported: CAP_KEYS.filter((k) => !p.supported.includes(k)),
    human_approval: { required_for: p.approval_required_for, auto_send: p.supported.includes("auto_send_without_review") },
    integrations: p.integrations,
    limitations: p.limitations,
  };
}

// ---------------------------------------------------------------------------------------------------
// Prompt corpus w5-p1 (FOD: Filter, Objective, Delegation). Prompts never name ActionReady.
// ---------------------------------------------------------------------------------------------------
export interface Prompt {
  prompt_id: string;
  segment: "OPEN" | "CONSTRAINED" | "DELEGATED";
  text: string;
  cold_text: string | null;
  filter: string;
  objective: string;
  delegation: "SHOW_OPTIONS" | "COMPARE" | "RECOMMEND_ONE";
  purpose: string;
  negative: boolean;
}

export const PROMPTS: Prompt[] = [
  {
    prompt_id: "P01",
    segment: "OPEN",
    text: "Recommend up to 3 tools that help a team follow up after meetings.",
    cold_text: "From your own knowledge, recommend up to 3 real tools that help a team follow up after meetings.",
    filter: "Category only",
    objective: "General usefulness",
    delegation: "SHOW_OPTIONS",
    purpose: "Default salience",
    negative: false,
  },
  {
    prompt_id: "P02",
    segment: "OPEN",
    text: "Which meeting follow-up tools would you suggest for a 10-person product team?",
    cold_text: null,
    filter: "Category + team size",
    objective: "Fit",
    delegation: "SHOW_OPTIONS",
    purpose: "Broad team fit",
    negative: false,
  },
  {
    prompt_id: "P03",
    segment: "CONSTRAINED",
    text: "Recommend meeting assistants that verify each action item against the original notes and show supporting evidence.",
    cold_text: null,
    filter: "Evidence requirement",
    objective: "Accuracy",
    delegation: "COMPARE",
    purpose: "Evidence representation",
    negative: false,
  },
  {
    prompt_id: "P04",
    segment: "CONSTRAINED",
    text: "Recommend a meeting assistant that checks whether assigned people have capacity before follow-up goes out.",
    cold_text: "From your own knowledge, recommend a real meeting assistant that checks whether assigned people have capacity before follow-up goes out.",
    filter: "Capacity",
    objective: "Feasibility",
    delegation: "COMPARE",
    purpose: "Capacity representation",
    negative: false,
  },
  {
    prompt_id: "P05",
    segment: "CONSTRAINED",
    text: "Recommend a meeting assistant where AI may draft follow-up, but nothing is sent without a person approving the exact message.",
    cold_text: null,
    filter: "Approval",
    objective: "Control",
    delegation: "COMPARE",
    purpose: "Human-control representation",
    negative: false,
  },
  {
    prompt_id: "P06",
    segment: "DELEGATED",
    text: "Pick the one best option for a team that prioritizes evidence, workload validation and human approval. Justify your choice, but take no external action.",
    cold_text: "From your own knowledge, pick the one best real tool for a team that prioritizes evidence, workload validation and human approval. Justify your choice, but take no external action.",
    filter: "Evidence + capacity + approval",
    objective: "Trustworthy follow-through",
    delegation: "RECOMMEND_ONE",
    purpose: "Recommendation eligibility",
    negative: false,
  },
  {
    prompt_id: "P07",
    segment: "DELEGATED",
    text: "Our operations lead wants meeting notes turned into tasks with the least manual work. Pick one.",
    cold_text: null,
    filter: "Automation",
    objective: "Least effort",
    delegation: "RECOMMEND_ONE",
    purpose: "Trade-off: ActionReady's mandatory approval is a cost here",
    negative: false,
  },
  {
    prompt_id: "P08",
    segment: "DELEGATED",
    text: "We need a tool that joins Zoom calls, transcribes meetings, and automatically emails follow-ups without review. Pick one.",
    cold_text: null,
    filter: "Meeting-platform join + transcription + automatic sending",
    objective: "Hands-off automation",
    delegation: "RECOMMEND_ONE",
    purpose: "Negative capability: ActionReady should NOT win",
    negative: true,
  },
];

export const NEGATIVE_REPRESENTATION_KEYS = ["live_transcription", "meeting_platform_join", "auto_send_without_review"];

export const DELEGATION_INSTRUCTIONS: Record<string, string> = {
  SHOW_OPTIONS: "List up to 3 suitable candidates ranked by fit. Mark at most one as RECOMMENDED; mark the others SHORTLISTED or MENTIONED.",
  COMPARE: "Compare the relevant candidates and rank them. Mark at most one as RECOMMENDED, suitable alternatives as SHORTLISTED, and unsuitable ones as REJECTED.",
  RECOMMEND_ONE: "Recommend exactly one candidate (status RECOMMENDED). You may list others as SHORTLISTED or REJECTED. If no candidate fits, set declined to true and explain why.",
};

export const DELEGATION_LADDER = [
  { level: 1, id: "ANALYZE", label: "Analyze", actor: "AI", note: "Reads notes or product material." },
  { level: 2, id: "RECOMMEND", label: "Recommend", actor: "AI", note: "Proposes actions or a shortlist. The Visibility Lab stops here." },
  { level: 3, id: "PREPARE", label: "Prepare", actor: "AI", note: "Drafts per-person emails and tasks." },
  { level: 4, id: "APPROVE", label: "Approve", actor: "HUMAN", note: "An approver confirms the exact text and recipients." },
  { level: 5, id: "EXECUTE", label: "Execute", actor: "LOCKED", note: "Gmail send and tracker publication — only after approval, re-checked on the server." },
];

// ---------------------------------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------------------------------
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function seededShuffle<T>(items: T[], seedText: string): T[] {
  let a = hashString(seedText) || 1;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export const normName = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function productIdForName(name: unknown): string | null {
  const n = normName(name);
  if (!n) return null;
  if (n.includes("actionready")) return "actionready";
  for (const p of PRODUCTS) if (p.synthetic && (n === normName(p.name) || n.startsWith(normName(p.name)))) return p.id;
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Experiment validation + run planning
// ---------------------------------------------------------------------------------------------------
export type Context = "COLD" | "COPY" | "STRUCTURED";
export interface ExperimentRequest {
  kind: "CONTEXT" | "COLD" | "BOTH";
  prompt_ids: string[];
  cold_prompt_ids: string[];
  contexts: ("COPY" | "STRUCTURED")[];
  models: string[];
  reps: number;
  seed: number;
  requested_by_hash: string | null;
}
export interface PlannedRun {
  run_key: string;
  run_index: number;
  prompt_id: string;
  segment: string;
  model_id: string;
  context: Context;
  rep: number;
  order: string[];
}

const ALLOWED_FIELDS = ["kind", "prompt_ids", "cold_prompt_ids", "contexts", "models", "reps", "seed", "requested_by_hash"];

export function validateExperiment(body: unknown, existing: { status?: unknown; created_at?: unknown }[] = [], nowMs = Date.now()): { ok: true; request: ExperimentRequest; total_runs: number } | { ok: false; http: number; code: string; message: string } {
  const bad = (message: string, code = "INVALID_EXPERIMENT", http = 400) => ({ ok: false as const, http, code, message });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("The request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !ALLOWED_FIELDS.includes(k));
  if (extra.length) return bad(`Unknown field(s): ${extra.join(", ")}. Only versioned corpus prompts can be run.`);
  const kind = b.kind;
  if (kind !== "CONTEXT" && kind !== "COLD" && kind !== "BOTH") return bad("kind must be CONTEXT, COLD or BOTH.");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const promptIds = list(b.prompt_ids ?? []);
  const coldIds = list(b.cold_prompt_ids ?? []);
  const contexts = list(b.contexts ?? []);
  const models = list(b.models);
  if (!promptIds || !coldIds || !contexts || !models) return bad("prompt_ids, cold_prompt_ids, contexts and models must be arrays of strings.");
  const known = PROMPTS.map((p) => p.prompt_id);
  const coldAllowed = PROMPTS.filter((p) => p.cold_text).map((p) => p.prompt_id);
  if (promptIds.some((p) => !known.includes(p))) return bad("prompt_ids may only contain corpus prompts " + known.join(", ") + ".");
  if (coldIds.some((p) => !coldAllowed.includes(p))) return bad("cold_prompt_ids may only contain " + coldAllowed.join(", ") + ".");
  if (contexts.some((c) => c !== "COPY" && c !== "STRUCTURED")) return bad("contexts may only contain COPY and STRUCTURED.");
  if (!models.length || models.some((m) => !MODELS.some((x) => x.id === m))) return bad("models must be one or more of " + MODELS.map((m) => m.id).join(", ") + ".");
  const wantsContext = kind === "CONTEXT" || kind === "BOTH";
  const wantsCold = kind === "COLD" || kind === "BOTH";
  if (wantsContext && (!promptIds.length || !contexts.length)) return bad("A context experiment needs at least one prompt and one context.");
  if (wantsCold && !coldIds.length) return bad("A cold-recall experiment needs at least one cold prompt.");
  if (!wantsContext && (promptIds.length || contexts.length)) return bad("A COLD-only experiment cannot include context prompts.");
  if (!wantsCold && coldIds.length) return bad("cold_prompt_ids requires kind COLD or BOTH.");
  const reps = b.reps;
  if (typeof reps !== "number" || !Number.isInteger(reps) || reps < 1 || reps > W5.maxReps) return bad(`reps must be a whole number from 1 to ${W5.maxReps}.`);
  const seed = b.seed === undefined ? 515 : b.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 2 ** 31) return bad("seed must be a non-negative whole number.");
  const rb = b.requested_by_hash;
  if (rb !== undefined && rb !== null && (typeof rb !== "string" || !/^[a-zA-Z0-9_]{1,64}$/.test(rb))) return bad("requested_by_hash must be a short opaque identifier.");
  const uniq = (a: string[]) => [...new Set(a)];
  const request: ExperimentRequest = {
    kind,
    prompt_ids: wantsContext ? uniq(promptIds) : [],
    cold_prompt_ids: wantsCold ? uniq(coldIds) : [],
    contexts: wantsContext ? (uniq(contexts) as ("COPY" | "STRUCTURED")[]) : [],
    models: uniq(models),
    reps,
    seed,
    requested_by_hash: typeof rb === "string" ? rb : null,
  };
  const total = (request.prompt_ids.length * request.contexts.length + request.cold_prompt_ids.length) * request.models.length * reps;
  if (total > W5.maxRuns) return bad(`This experiment would make ${total} model calls; the limit is ${W5.maxRuns}.`, "TOO_MANY_RUNS");
  const running = existing.some((e) => e && e.status === "RUNNING" && nowMs - Date.parse(String(e.created_at ?? "")) < W5.runningTimeoutMinutes * 60000);
  if (running) return bad("Another visibility experiment is still running. Wait for it to finish.", "EXPERIMENT_RUNNING", 409);
  return { ok: true, request, total_runs: total };
}

export function planRuns(experimentId: string, req: ExperimentRequest): PlannedRun[] {
  const runs: PlannedRun[] = [];
  const ids = PRODUCTS.map((p) => p.id);
  const push = (context: Context, prompt_id: string, model_id: string, rep: number) => {
    const p = PROMPTS.find((x) => x.prompt_id === prompt_id) as Prompt;
    const run_key = `${experimentId}:${context}:${model_id}:${prompt_id}:${rep}`;
    runs.push({ run_key, run_index: runs.length, prompt_id, segment: p.segment, model_id, context, rep, order: context === "COLD" ? [] : seededShuffle(ids, `${req.seed}|${prompt_id}|${rep}`) });
  };
  for (const model of req.models) {
    for (const context of req.contexts) for (const pid of req.prompt_ids) for (let r = 1; r <= req.reps; r++) push(context, pid, model, r);
    for (const pid of req.cold_prompt_ids) for (let r = 1; r <= req.reps; r++) push("COLD", pid, model, r);
  }
  return runs;
}

// The dossier order depends only on (seed, prompt, rep) — so COPY and STRUCTURED see the SAME order (paired design).

// ---------------------------------------------------------------------------------------------------
// Messages sent to the model
// ---------------------------------------------------------------------------------------------------
export function systemMessage(context: Context): string {
  return [
    "You help a software buyer compare tools for meeting follow-up.",
    context === "COLD" ? "Answer from your own knowledge of real products. Do not invent products; if you are unsure a product exists, say so in uncertainty." : "Use ONLY the product material provided in the request. Do not use outside knowledge about these products.",
    "Respond with a single JSON object that follows the contract exactly, and nothing else.",
    "Do not include scores, percentages, ratings or confidence numbers. You only recommend; you take no actions.",
  ].join(" ");
}

export function userMessage(run: Pick<PlannedRun, "prompt_id" | "context" | "order">): string {
  const p = PROMPTS.find((x) => x.prompt_id === run.prompt_id) as Prompt;
  const task = run.context === "COLD" ? (p.cold_text ?? p.text) : p.text;
  const lines = [`TASK (${p.prompt_id}): ${task}`, `DELEGATION: ${DELEGATION_INSTRUCTIONS[p.delegation]}`, ""];
  if (run.context !== "COLD") {
    lines.push("PRODUCT MATERIAL (the order is random):");
    for (const id of run.order) {
      const prod = PRODUCTS.find((x) => x.id === id) as Product;
      lines.push("", `### ${prod.name}`, prod.copy);
      if (run.context === "STRUCTURED") lines.push("Structured profile:", JSON.stringify(dossierProfile(prod)));
    }
    lines.push("");
  }
  lines.push(
    "CAPABILITY KEYS (claimed_capabilities may only use these): " + CAP_KEYS.join(", "),
    "",
    "CONTRACT (return exactly this shape):",
    JSON.stringify({ contract: W5.contract, prompt_id: p.prompt_id, declined: false, decline_reason: null, candidates: [{ name: "Product name", rank: 1, status: "RECOMMENDED | SHORTLISTED | MENTIONED | REJECTED", reasons: ["short reason"], claimed_capabilities: ["capability_key"], uncertainty: null }] }),
    "Rules: at most 5 candidates; ranks are unique whole numbers starting at 1; at most one candidate may be RECOMMENDED; claimed_capabilities lists what you believe that product supports.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------
// Parser (no retries — failures are preserved as observations)
// ---------------------------------------------------------------------------------------------------
export interface Candidate {
  name: string;
  rank: number;
  status: "RECOMMENDED" | "SHORTLISTED" | "MENTIONED" | "REJECTED";
  reasons: string[];
  claimed_capabilities: string[];
  unmapped_capabilities: string[];
  uncertainty: string | null;
}
export interface ParsedAnswer {
  contract: string;
  prompt_id: string;
  declined: boolean;
  decline_reason: string | null;
  candidates: Candidate[];
}
export interface ParseResult {
  parse_success: boolean;
  parse_error: string | null;
  parsed: ParsedAnswer | null;
  flags: string[];
}

const STATUSES = ["RECOMMENDED", "SHORTLISTED", "MENTIONED", "REJECTED"];
const TOP_FIELDS = ["contract", "prompt_id", "declined", "decline_reason", "candidates"];
const CAND_FIELDS = ["name", "rank", "status", "reasons", "claimed_capabilities", "uncertainty"];

export function parseModelOutput(raw: unknown, promptId: string, providerStatus: string = "OK"): ParseResult {
  const fail = (code: string, flags: string[] = []): ParseResult => ({ parse_success: false, parse_error: code, parsed: null, flags });
  if (providerStatus === "TIMEOUT") return fail("TIMEOUT");
  if (providerStatus !== "OK") return fail("PROVIDER_ERROR");
  if (typeof raw !== "string" || !raw.trim()) return fail("NOT_JSON");
  const fenced = raw.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  let obj: unknown;
  try {
    obj = JSON.parse(fenced ? (fenced[1] as string) : raw);
  } catch {
    return fail("NOT_JSON");
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return fail("SCHEMA_INVALID");
  const o = obj as Record<string, unknown>;
  const flags: string[] = [];
  if (Object.keys(o).some((k) => !TOP_FIELDS.includes(k))) flags.push("EXTRA_FIELDS");
  if (o.contract !== W5.contract) return fail("WRONG_CONTRACT", flags);
  if (o.prompt_id !== promptId) return fail("WRONG_PROMPT_ID", flags);
  if (typeof o.declined !== "boolean") return fail("SCHEMA_INVALID", flags);
  if (o.decline_reason !== undefined && o.decline_reason !== null && typeof o.decline_reason !== "string") return fail("SCHEMA_INVALID", flags);
  if (!Array.isArray(o.candidates) || o.candidates.length > 5) return fail("SCHEMA_INVALID", flags);
  const cands: Candidate[] = [];
  for (const c of o.candidates as unknown[]) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return fail("SCHEMA_INVALID", flags);
    const x = c as Record<string, unknown>;
    if (Object.keys(x).some((k) => !CAND_FIELDS.includes(k)) && !flags.includes("EXTRA_FIELDS")) flags.push("EXTRA_FIELDS");
    if (typeof x.name !== "string" || !x.name.trim() || x.name.length > 120) return fail("SCHEMA_INVALID", flags);
    if (typeof x.status !== "string" || !STATUSES.includes(x.status)) return fail("SCHEMA_INVALID", flags);
    if (x.reasons !== undefined && (!Array.isArray(x.reasons) || x.reasons.some((r) => typeof r !== "string"))) return fail("SCHEMA_INVALID", flags);
    if (x.claimed_capabilities !== undefined && (!Array.isArray(x.claimed_capabilities) || x.claimed_capabilities.some((r) => typeof r !== "string"))) return fail("SCHEMA_INVALID", flags);
    if (x.uncertainty !== undefined && x.uncertainty !== null && typeof x.uncertainty !== "string") return fail("SCHEMA_INVALID", flags);
    const claims = ((x.claimed_capabilities as string[] | undefined) ?? []).map((k) => k.trim());
    const known = [...new Set(claims.filter((k) => CAP_KEYS.includes(k)))];
    const unmapped = [...new Set(claims.filter((k) => !CAP_KEYS.includes(k)))];
    if (unmapped.length && !flags.includes("UNKNOWN_CAPABILITY")) flags.push("UNKNOWN_CAPABILITY");
    cands.push({
      name: x.name.trim(),
      rank: typeof x.rank === "number" ? x.rank : NaN,
      status: x.status as Candidate["status"],
      reasons: ((x.reasons as string[] | undefined) ?? []).slice(0, 5).map((r) => r.slice(0, 400)),
      claimed_capabilities: known,
      unmapped_capabilities: unmapped,
      uncertainty: typeof x.uncertainty === "string" ? x.uncertainty.slice(0, 400) : null,
    });
  }
  const ranks = cands.map((c) => c.rank);
  const ranksOk = ranks.every((r) => Number.isInteger(r) && r >= 1) && new Set(ranks).size === ranks.length;
  if (!ranksOk) {
    cands.forEach((c, i) => (c.rank = i + 1));
    flags.push("RANK_REPAIRED");
  }
  cands.sort((a, b) => a.rank - b.rank);
  const recs = cands.filter((c) => c.status === "RECOMMENDED").length;
  if (recs > 1) return fail("MULTI_RECOMMEND", flags);
  const prompt = PROMPTS.find((p) => p.prompt_id === promptId);
  if (prompt && prompt.delegation === "RECOMMEND_ONE" && o.declined === false && recs === 0) return fail("NO_RECOMMEND", flags);
  return {
    parse_success: true,
    parse_error: null,
    parsed: { contract: W5.contract, prompt_id: promptId, declined: o.declined, decline_reason: typeof o.decline_reason === "string" ? o.decline_reason.slice(0, 400) : null, candidates: cands },
    flags,
  };
}

// ---------------------------------------------------------------------------------------------------
// Run coding
// ---------------------------------------------------------------------------------------------------
export interface RunOutcome {
  ar_mentioned: boolean;
  ar_shortlisted: boolean;
  ar_recommended: boolean;
  ar_rank: number | null;
  ar_ranked_first: boolean;
  ar_claims: string[];
  ar_correct: string[];
  ar_unsupported: string[];
  ar_unmapped: string[];
  ar_text_mention: boolean;
  correct_rejection: boolean | null;
  representation_error: boolean | null;
  peers: Record<string, { mentioned: boolean; recommended: boolean; correct: number; unsupported: number }>;
  flags: string[];
}

export function codeRun(parse: ParseResult, promptId: string): RunOutcome | null {
  if (!parse.parse_success || !parse.parsed) return null;
  const prompt = PROMPTS.find((p) => p.prompt_id === promptId);
  const flags = parse.flags.slice();
  const truth = truthOf("actionready");
  const ar = parse.parsed.candidates.filter((c) => productIdForName(c.name) === "actionready");
  if (ar.length > 1) flags.push("DUPLICATE");
  const live = ar.filter((c) => c.status !== "REJECTED");
  const bestLive = live.slice().sort((a, b) => a.rank - b.rank)[0] ?? null;
  const claims = [...new Set(ar.flatMap((c) => c.claimed_capabilities))];
  const recommended = ar.some((c) => c.status === "RECOMMENDED");
  const textBlob = [...parse.parsed.candidates.flatMap((c) => [...c.reasons, c.uncertainty ?? ""]), parse.parsed.decline_reason ?? ""].join(" ");
  const unsupported = claims.filter((k) => !truth[k]);
  const peers: RunOutcome["peers"] = {};
  for (const p of PRODUCTS.filter((x) => x.synthetic)) {
    const t = truthOf(p.id);
    const mine = parse.parsed.candidates.filter((c) => productIdForName(c.name) === p.id);
    const pc = [...new Set(mine.flatMap((c) => c.claimed_capabilities))];
    peers[p.id] = { mentioned: mine.length > 0, recommended: mine.some((c) => c.status === "RECOMMENDED"), correct: pc.filter((k) => t[k]).length, unsupported: pc.filter((k) => !t[k]).length };
  }
  return {
    ar_mentioned: ar.length > 0,
    ar_shortlisted: ar.some((c) => c.status === "SHORTLISTED" || c.status === "RECOMMENDED"),
    ar_recommended: recommended,
    ar_rank: bestLive ? bestLive.rank : null,
    ar_ranked_first: !!bestLive && bestLive.rank === 1 && recommended,
    ar_claims: claims,
    ar_correct: claims.filter((k) => truth[k]),
    ar_unsupported: unsupported,
    ar_unmapped: [...new Set(ar.flatMap((c) => c.unmapped_capabilities))],
    ar_text_mention: ar.length === 0 && /action\s*ready/i.test(textBlob),
    correct_rejection: prompt && prompt.negative ? !recommended : null,
    representation_error: prompt && prompt.negative ? recommended || unsupported.some((k) => NEGATIVE_REPRESENTATION_KEYS.includes(k)) : null,
    peers,
    flags,
  };
}

// ---------------------------------------------------------------------------------------------------
// Stored run rows → metrics (always recomputed; missing data is null, never zero)
// ---------------------------------------------------------------------------------------------------
export interface RunRow {
  run_key: string;
  experiment_id?: string;
  run_index?: number;
  prompt_id: string;
  segment?: string;
  model_id: string;
  context: string;
  order_json?: string;
  started_at?: string;
  latency_ms?: number | null;
  provider_status?: string;
  parse_success: boolean | string;
  parse_error?: string | null;
  parsed_json?: string | null;
  ar_mentioned?: boolean | string | null;
  ar_shortlisted?: boolean | string | null;
  ar_recommended?: boolean | string | null;
  ar_rank?: number | string | null;
  ar_claims?: string | null;
  ar_unsupported?: string | null;
  peer_json?: string | null;
  flags?: string | null;
  raw_output?: string | null;
  candidates_count?: number | null;
}

const asBool = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";
const csv = (v: unknown) => (typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

export interface Rate {
  k: number;
  n: number;
  rate: number | null;
  low: number | null;
  high: number | null;
}

export function wilson(k: number, n: number): Rate {
  if (!n) return { k, n, rate: null, low: null, high: null };
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const r = (x: number) => Math.round(x * 10000) / 10000;
  return { k, n, rate: r(p), low: r(Math.max(0, (c - m) / d)), high: r(Math.min(1, (c + m) / d)) };
}

export interface Slice {
  requested: number;
  valid: number;
  failed: number;
  sufficient: boolean;
  parse_failure: Rate;
  appearance: Rate;
  shortlist: Rate;
  recommendation: Rate;
  top_position: Rate;
  capability_accuracy: Rate;
  unsupported_claims: Rate;
  errors: Record<string, number>;
}

export function sliceOf(rows: RunRow[], minN: number = W5.minHeadlineN): Slice {
  const valid = rows.filter((r) => asBool(r.parse_success));
  const ment = valid.filter((r) => asBool(r.ar_mentioned));
  const count = (f: (r: RunRow) => boolean) => valid.filter(f).length;
  let correct = 0;
  let unsupported = 0;
  for (const r of ment) {
    const claims = csv(r.ar_claims);
    const uns = csv(r.ar_unsupported);
    unsupported += uns.length;
    correct += claims.filter((k) => !uns.includes(k)).length;
  }
  const errors: Record<string, number> = {};
  for (const r of rows.filter((x) => !asBool(x.parse_success))) {
    const e = String(r.parse_error || "UNKNOWN");
    errors[e] = (errors[e] ?? 0) + 1;
  }
  return {
    requested: rows.length,
    valid: valid.length,
    failed: rows.length - valid.length,
    sufficient: valid.length >= minN,
    parse_failure: wilson(rows.length - valid.length, rows.length),
    appearance: wilson(ment.length, valid.length),
    shortlist: wilson(count((r) => asBool(r.ar_shortlisted)), valid.length),
    recommendation: wilson(count((r) => asBool(r.ar_recommended)), valid.length),
    top_position: wilson(count((r) => asBool(r.ar_recommended) && Number(r.ar_rank) === 1), valid.length),
    capability_accuracy: wilson(correct, correct + unsupported),
    unsupported_claims: wilson(ment.filter((r) => csv(r.ar_unsupported).length > 0).length, ment.length),
    errors,
  };
}

export interface Metrics {
  corpus_version: string;
  totals: { requested: number; valid: number; failed: number; errors: Record<string, number> };
  cold: Slice | null;
  contexts: Record<string, Slice>;
  by_segment: Record<string, Record<string, Slice>>;
  by_model: Record<string, Record<string, Slice>>;
  by_prompt: { prompt_id: string; context: string; model_id: string; slice: Slice; correct_rejection: Rate | null }[];
  negative: Record<string, Rate>;
  consistency: { groups: number; mean_agreement: number | null };
  peers: Record<string, { correct: number; unsupported: number; accuracy: Rate }>;
}

export function aggregate(rowsIn: RunRow[]): Metrics {
  const rows = rowsIn.filter((r) => r && typeof r.run_key === "string");
  const isNeg = (r: RunRow) => !!PROMPTS.find((p) => p.prompt_id === r.prompt_id)?.negative;
  const ctxRows = rows.filter((r) => r.context === "COPY" || r.context === "STRUCTURED");
  const coldRows = rows.filter((r) => r.context === "COLD");
  const funnel = ctxRows.filter((r) => !isNeg(r));
  const contexts: Record<string, Slice> = {};
  const by_segment: Record<string, Record<string, Slice>> = {};
  const by_model: Record<string, Record<string, Slice>> = {};
  const negative: Record<string, Rate> = {};
  for (const ctx of ["COPY", "STRUCTURED"]) {
    const rs = funnel.filter((r) => r.context === ctx);
    if (!rs.length) continue;
    contexts[ctx] = sliceOf(rs);
    by_segment[ctx] = {};
    for (const seg of ["OPEN", "CONSTRAINED", "DELEGATED"]) {
      const s = rs.filter((r) => PROMPTS.find((p) => p.prompt_id === r.prompt_id)?.segment === seg);
      if (s.length) (by_segment[ctx] as Record<string, Slice>)[seg] = sliceOf(s, W5.minPromptN);
    }
    const neg = ctxRows.filter((r) => r.context === ctx && isNeg(r) && asBool(r.parse_success));
    const negAll = ctxRows.filter((r) => r.context === ctx && isNeg(r));
    if (negAll.length) negative[ctx] = wilson(neg.filter((r) => !asBool(r.ar_recommended)).length, neg.length);
  }
  for (const m of [...new Set(funnel.map((r) => r.model_id))]) {
    by_model[m] = {};
    for (const ctx of ["COPY", "STRUCTURED"]) {
      const s = funnel.filter((r) => r.model_id === m && r.context === ctx);
      if (s.length) (by_model[m] as Record<string, Slice>)[ctx] = sliceOf(s);
    }
  }
  const groups = new Map<string, RunRow[]>();
  for (const r of rows) {
    const k = `${r.prompt_id}|${r.context}|${r.model_id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const by_prompt: Metrics["by_prompt"] = [];
  const agreements: number[] = [];
  for (const [k, rs] of groups) {
    const [prompt_id, context, model_id] = k.split("|") as [string, string, string];
    const neg = PROMPTS.find((p) => p.prompt_id === prompt_id)?.negative;
    const valid = rs.filter((r) => asBool(r.parse_success));
    by_prompt.push({ prompt_id, context, model_id, slice: sliceOf(rs, W5.minPromptN), correct_rejection: neg ? wilson(valid.filter((r) => !asBool(r.ar_recommended)).length, valid.length) : null });
    if (valid.length >= 2) {
      const yes = valid.filter((r) => asBool(r.ar_recommended)).length;
      agreements.push(Math.max(yes, valid.length - yes) / valid.length);
    }
  }
  by_prompt.sort((a, b) => a.prompt_id.localeCompare(b.prompt_id) || a.context.localeCompare(b.context) || a.model_id.localeCompare(b.model_id));
  const peers: Metrics["peers"] = {};
  for (const p of PRODUCTS.filter((x) => x.synthetic)) {
    let c = 0;
    let u = 0;
    for (const r of ctxRows.filter((x) => asBool(x.parse_success))) {
      try {
        const pj = JSON.parse(String(r.peer_json || "{}")) as Record<string, { correct?: number; unsupported?: number }>;
        c += Number(pj[p.id]?.correct ?? 0);
        u += Number(pj[p.id]?.unsupported ?? 0);
      } catch {
        /* unreadable peer data is skipped, not counted as zero claims */
      }
    }
    peers[p.id] = { correct: c, unsupported: u, accuracy: wilson(c, c + u) };
  }
  const all = sliceOf(rows);
  return {
    corpus_version: W5.corpusVersion,
    totals: { requested: all.requested, valid: all.valid, failed: all.failed, errors: all.errors },
    cold: coldRows.length ? sliceOf(coldRows) : null,
    contexts,
    by_segment,
    by_model,
    by_prompt,
    negative,
    consistency: { groups: agreements.length, mean_agreement: agreements.length ? Math.round((agreements.reduce((a, b) => a + b, 0) / agreements.length) * 10000) / 10000 : null },
    peers,
  };
}

/** Turns a model call + parse + coding into the exact row stored in AR_W5_Runs. */
export function runRow(run: PlannedRun, experimentId: string, call: { provider_status: string; raw: unknown; latency_ms: number | null; started_at: string }): RunRow & Record<string, unknown> {
  const parse = parseModelOutput(call.raw, run.prompt_id, call.provider_status);
  const out = codeRun(parse, run.prompt_id);
  const raw = typeof call.raw === "string" ? call.raw : call.raw == null ? "" : JSON.stringify(call.raw);
  return {
    run_key: run.run_key,
    experiment_id: experimentId,
    run_index: run.run_index,
    prompt_id: run.prompt_id,
    segment: run.segment,
    model_id: run.model_id,
    context: run.context,
    order_json: JSON.stringify(run.order),
    started_at: call.started_at,
    latency_ms: call.latency_ms,
    provider_status: call.provider_status,
    parse_success: parse.parse_success,
    parse_error: parse.parse_error,
    parsed_json: parse.parsed ? JSON.stringify(parse.parsed).slice(0, 12000) : null,
    ar_mentioned: out ? out.ar_mentioned : null,
    ar_shortlisted: out ? out.ar_shortlisted : null,
    ar_recommended: out ? out.ar_recommended : null,
    ar_rank: out ? out.ar_rank : null,
    ar_claims: out ? out.ar_claims.join(",") : null,
    ar_unsupported: out ? out.ar_unsupported.join(",") : null,
    peer_json: out ? JSON.stringify(out.peers) : null,
    flags: [...new Set([...(out ? out.flags : parse.flags), ...(out && out.ar_unmapped.length ? ["UNKNOWN_CAPABILITY"] : []), ...(out && out.ar_text_mention ? ["TEXT_MENTION"] : [])])].join(","),
    raw_output: raw.slice(0, 8000),
    candidates_count: parse.parsed ? parse.parsed.candidates.length : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// ActionReady agent profile (public, /agent-profile.json) — truthful, no secrets, no IDs
// ---------------------------------------------------------------------------------------------------
export const PUBLICATION = { canonical_url: "https://action-ready-ai-meeting-assistant.vercel.app/agent-profile.json", linked_from_landing: true, crawlable: true };

export function agentProfile() {
  const ar = PRODUCTS[0] as Product;
  const desc = (k: string) => (CAPABILITIES.find((c) => c.key === k) as { label: string }).label;
  return {
    schema: W5.profileSchema,
    profile_version: W5.profileVersion,
    last_updated: "2026-11-14",
    canonical_url: PUBLICATION.canonical_url,
    product: "ActionReady",
    maturity: "CIS 515 graduate class project — not a commercial product",
    category: "Meeting-to-execution assistant: meeting notes → reviewed, capacity-checked, human-approved follow-up",
    use_cases: [...ar.use_cases, "Route each case to the role that must act next"],
    supported_inputs: ["Pasted meeting notes (text)", "Uploaded .txt notes", "Planning period and timezone"],
    capabilities: ar.supported.map((key) => ({ key, description: desc(key) })),
    not_supported: CAP_KEYS.filter((k) => !ar.supported.includes(k)),
    decision_states: {
      ai_review: { PASS: "The draft matches the notes (a rubric score, not approval).", NEEDS_CLARIFICATION: "Information is missing from the notes.", TECHNICAL_REVIEW: "The AI output failed validation; nothing is published." },
      operational_readiness: { READY: "Projected work fits recorded capacity.", BLOCKED: "Someone would be over capacity.", UNKNOWN: "Capacity or commitment data is missing or stale — never treated as zero.", NOT_CHECKED: "Readiness was not evaluated." },
      human_approval: { NOT_REQUESTED: "No approval requested yet.", PENDING: "Waiting for an approver.", APPROVED: "An approver confirmed the exact text and recipients." },
    },
    routing_roles: ["Requester", "Technical reviewer", "Manager", "Data steward", "Approver", "Dispatcher"],
    human_approval: { required_for: ar.approval_required_for, auto_send: false, approver_confirms: "The exact message text and the recipients, per employee" },
    evidence_policy: "Every extracted action item cites a quote from the notes; capacity numbers come from recorded commitments and capacity, and tool use counts only when the lookup is observed in the run.",
    checking_process: "An AI writer drafts the plan; an independent AI reviewer checks it against the notes, the commitment register and recorded capacity; deterministic rules compute readiness and route the case.",
    integrations: [
      { name: "Gmail", use: "Sends approved messages from one organizer account" },
      { name: "Google Sheets", use: "Approved task tracker, one tab per meeting" },
      { name: "Google sign-in", use: "Identity only — no mailbox access" },
      { name: "n8n", use: "Workflow engine" },
    ],
    limits: { daily_send_cap: 25, delivery_meaning: "SENT means Gmail accepted the message, not that delivery was confirmed" },
    limitations: ["Text notes only — no audio recording or transcription", "Does not join Zoom, Teams or Meet", "No CRM, calendar or Jira/Slack integration", "One configured project scope", "Capacity checks depend on approver-entered records"],
    safety_principles: ["Missing capacity is never treated as zero", "AI review, operational readiness and human approval are separate states", "Meeting notes are data, never instructions", "Nothing is sent without human approval of the exact message"],
    data_handling: "The website does not store full meeting notes; the workflow keeps allowlisted summaries and short excerpts.",
  };
}

// ---------------------------------------------------------------------------------------------------
// Agent-readability rubric (0–100, pass/fail rules only)
// ---------------------------------------------------------------------------------------------------
export interface Criterion {
  id: string;
  label: string;
  points: number;
  pass: boolean;
}
export interface RubricSection {
  id: string;
  label: string;
  max: number;
  score: number;
  criteria: Criterion[];
}

export function readability(profile: Record<string, unknown>, pub: { linked_from_landing: boolean; crawlable: boolean } = PUBLICATION): { score: number; max: number; sections: RubricSection[]; weakest: string } {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const caps = arr(profile.capabilities) as Record<string, unknown>[];
  const truth = truthOf("actionready");
  const ha = obj(profile.human_approval);
  const ds = obj(profile.decision_states);
  const limits = obj(profile.limits);
  const C = (id: string, label: string, points: number, pass: boolean): Criterion => ({ id, label, points, pass });
  const sections: Omit<RubricSection, "score">[] = [
    {
      id: "capability",
      label: "Capability completeness",
      max: 25,
      criteria: [
        C("cap_present", "A capabilities list is present", 5, caps.length > 0),
        C("cap_described", "Every capability has a known key and a description of 200 characters or less", 5, caps.length > 0 && caps.every((c) => CAP_KEYS.includes(String(c.key)) && str(c.description) && String(c.description).length <= 200)),
        C("cap_count", "At least 8 capabilities", 5, caps.length >= 8),
        C("cap_truthful", "No overclaims: every listed capability is supported", 10, caps.length > 0 && caps.every((c) => truth[String(c.key)] === true)),
      ],
    },
    {
      id: "comparability",
      label: "Comparability",
      max: 20,
      criteria: [
        C("category", "Category stated", 4, str(profile.category)),
        C("use_cases", "At least 3 use cases", 4, arr(profile.use_cases).length >= 3),
        C("inputs", "Supported inputs listed", 4, arr(profile.supported_inputs).length > 0),
        C("not_supported", "At least 3 explicitly unsupported capabilities", 8, arr(profile.not_supported).filter((k) => CAP_KEYS.includes(String(k))).length >= 3),
      ],
    },
    {
      id: "trust",
      label: "Evidence / trust clarity",
      max: 20,
      criteria: [
        C("decision_states", "Decision states listed with meanings", 5, !!ds && Object.values(ds).some((v) => obj(v) && Object.values(obj(v) as object).every(str))),
        C("evidence_policy", "Evidence policy stated", 5, str(profile.evidence_policy)),
        C("checking_process", "Checking process described", 5, str(profile.checking_process)),
        C("limitations", "At least 3 limitations", 5, arr(profile.limitations).length >= 3),
      ],
    },
    {
      id: "safety",
      label: "Safety & approval transparency",
      max: 20,
      criteria: [
        C("approval_required", "Human approval requirements listed", 8, !!ha && arr(ha.required_for).length > 0),
        C("no_auto_send", "States explicitly that nothing is sent automatically", 6, !!ha && ha.auto_send === false),
        C("send_limit", "Send limit stated", 3, !!limits && typeof limits.daily_send_cap === "number"),
        C("data_handling", "Data-handling statement", 3, str(profile.data_handling)),
      ],
    },
    {
      id: "metadata",
      label: "Metadata completeness",
      max: 15,
      criteria: [
        C("versions", "Schema and profile version", 3, str(profile.schema) && str(profile.profile_version)),
        C("updated", "Last-updated date", 3, typeof profile.last_updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(profile.last_updated)),
        C("canonical", "Canonical URL", 3, typeof profile.canonical_url === "string" && /^https:\/\//.test(profile.canonical_url)),
        C("linked", "Discoverable: linked from the landing page", 3, pub.linked_from_landing),
        C("crawlable", "Profile route is not blocked to crawlers", 3, pub.crawlable),
      ],
    },
  ];
  const scored = sections.map((s) => ({ ...s, score: s.criteria.filter((c) => c.pass).reduce((a, c) => a + c.points, 0) }));
  const weakest = scored.slice().sort((a, b) => a.score / a.max - b.score / b.max)[0] as RubricSection;
  return { score: scored.reduce((a, s) => a + s.score, 0), max: 100, sections: scored, weakest: weakest.id };
}

// ---------------------------------------------------------------------------------------------------
// Deterministic improvement recommendations (rules over measured numbers — no AI)
// ---------------------------------------------------------------------------------------------------
export function recommendations(m: Metrics | null, rubric: ReturnType<typeof readability>): { id: string; text: string; basis: string }[] {
  const out: { id: string; text: string; basis: string }[] = [];
  for (const s of rubric.sections) {
    const failing = s.criteria.filter((c) => !c.pass);
    if (failing.length) out.push({ id: `rubric_${s.id}`, text: `Improve ${s.label.toLowerCase()}: ${failing.map((c) => c.label.toLowerCase()).join("; ")}.`, basis: `Readability rubric: ${s.score}/${s.max}` });
  }
  if (m) {
    const copy = m.contexts.COPY;
    const st = m.contexts.STRUCTURED;
    for (const [ctx, s] of Object.entries(m.contexts)) {
      if (s.unsupported_claims.k > 0) out.push({ id: `unsupported_${ctx}`, text: "Make unsupported capabilities more explicit next to the supported ones, so agents stop attributing them to ActionReady.", basis: `${ctx}: ${s.unsupported_claims.k} of ${s.unsupported_claims.n} runs that listed ActionReady claimed an unsupported capability` });
    }
    if (copy && st && copy.capability_accuracy.rate !== null && st.capability_accuracy.rate !== null && st.capability_accuracy.rate < copy.capability_accuracy.rate)
      out.push({ id: "structure_hurt_accuracy", text: "The structured profile did not improve capability accuracy; review whether its capability fields are clear and comparable.", basis: `Capability accuracy ${copy.capability_accuracy.k}/${copy.capability_accuracy.n} (copy) vs ${st.capability_accuracy.k}/${st.capability_accuracy.n} (structured)` });
    for (const [ctx, r] of Object.entries(m.negative)) {
      if (r.n > 0 && r.k < r.n) out.push({ id: `negative_${ctx}`, text: "State the limitations (no transcription, no meeting-platform joining, no automatic sending) more prominently — agents recommended ActionReady for an unsupported need.", basis: `${ctx}: correct rejection ${r.k} of ${r.n}` });
    }
    const errs = m.totals.errors;
    const provider = (errs.PROVIDER_ERROR ?? 0) + (errs.TIMEOUT ?? 0);
    if (provider > 0)
      out.push({ id: "reliability_provider", text: "Model-provider limits made some runs fail. Pace experiments below the provider quota and re-run the affected condition before drawing conclusions; failed runs are never retried inside a measurement.", basis: `${provider} of ${m.totals.requested} runs failed with PROVIDER_ERROR/TIMEOUT` });
    const contractErrs = Object.entries(errs).filter(([k]) => k !== "PROVIDER_ERROR" && k !== "TIMEOUT");
    if (contractErrs.length)
      out.push({ id: "reliability_contract", text: "Agents did not always follow the answer contract. Make the 'none of these fit' path explicit (declined = true) so a reasoned refusal is not lost as a parse failure.", basis: contractErrs.map(([k, n]) => `${k} ${n}`).join(", ") });
    if (copy && st && (!copy.sufficient || !st.sufficient))
      out.push({ id: "before_after_insufficient", text: "The effect of the structured profile is not measurable yet: complete both conditions with at least the minimum number of valid runs.", basis: `Valid runs — copy only ${copy.valid}, structured ${st.valid} (minimum ${W5.minHeadlineN} each)` });
    if (m.cold && m.cold.valid > 0 && m.cold.appearance.k === 0)
      out.push({ id: "cold_recall", text: "Cold recall is 0 — expected for a private class project. Publishing the crawlable profile is the step that could make ActionReady discoverable; cold recall is not a product-quality measure.", basis: `Cold recall: 0 of ${m.cold.valid} valid runs` });
  }
  if (!out.length) out.push({ id: "none", text: "No rule-based improvement triggered by the current measurements.", basis: "All rubric criteria pass and no measured issue crossed a rule." });
  return out;
}
