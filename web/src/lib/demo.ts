import type { Submission } from "./contract";
import { JOB_ID_RE } from "./contract";
import { computeReadiness } from "./readiness";
import { DEMO_PROJECT_ID, DEMO_TIMEZONE, FIXTURE_NOW, ROSTER, SCENARIOS, findScenarioByNotes, type Scenario } from "./fixtures";

// A demo result is fully determined by its synthetic scenario, submission time and timezone, so the job ID encodes
// exactly those. Any server instance can rebuild the same case from the ID alone — no storage needed (serverless
// hosts such as Vercel do not share /tmp between instances).
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const DEMO_ID_RE = /^demo_([a-z][a-z-]*)_([0-9a-z]{6,10})(?:_([A-Za-z0-9_-]+))?$/;

export function demoJobId(scenarioId: string, at: Date, timezone: string): string {
  const base = `demo_${scenarioId}_${at.getTime().toString(36)}`;
  const withTz = `${base}_${b64(timezone)}`;
  // Timezone is display-only metadata; drop it rather than exceed the job-ID length limit.
  return JOB_ID_RE.test(withTz) ? withTz : base;
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Rebuilds a demo case from its self-describing job ID, or null if the ID is not a valid demo ID. */
export function rebuildDemoBody(job_id: string) {
  const m = DEMO_ID_RE.exec(job_id);
  if (!m || !JOB_ID_RE.test(job_id)) return null;
  const s = SCENARIOS.find((x) => x.id === m[1]);
  const ms = parseInt(m[2]!, 36);
  if (!s || !s.period || !Number.isFinite(ms) || ms <= 0 || ms > Date.now() + 300_000) return null;
  let tz = DEMO_TIMEZONE;
  if (m[3]) {
    const decoded = Buffer.from(m[3], "base64url").toString("utf8");
    if (!validTz(decoded) || b64(decoded) !== m[3]) return null;
    tz = decoded;
  }
  const body = buildDemoBody(s, { request_id: "", notes: s.notes, period_start: s.period.start, period_end: s.period.end, timezone: tz }, new Date(ms));
  return body.job_id === job_id ? body : null;
}

// DEMO mode: runs only the labeled synthetic scenarios, entirely inside this app.
// No n8n call, no model, no tool call. Every result says so.
export const DEMO_PROVENANCE =
  "DEMO — synthetic fixture data evaluated by this app's local copy of the readiness rules. No n8n workflow, model, or tool call ran.";

export function demoScenarioFor(sub: Submission): Scenario | null {
  const s = findScenarioByNotes(sub.notes);
  if (!s || !s.period) return null;
  if (s.period.start !== sub.period_start || s.period.end !== sub.period_end) return null;
  return s;
}

/** The source line an action came from: the line naming its owner that best overlaps the task. */
function quoteFor(notes: string, task: string, owner: string): string | null {
  const words = task.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const score = (l: string) => words.filter((w) => l.toLowerCase().includes(w)).length;
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  const owned = lines.filter((l) => l.toLowerCase().includes(owner.toLowerCase()));
  const best = (owned.length ? owned : lines).reduce<string | null>((b, l) => (b === null || score(l) > score(b) ? l : b), null);
  return best && score(best) > 0 ? best : null;
}

export function buildDemoBody(s: Scenario, sub: Submission, at: Date = new Date()) {
  const job_id = demoJobId(s.id, at, sub.timezone);
  const roster = s.roster ?? ROSTER;
  const r = computeReadiness({
    project_id: DEMO_PROJECT_ID,
    period: s.period,
    now: FIXTURE_NOW,
    max_record_age_days: 14,
    max_rows_per_read: s.max_rows_per_read ?? 25,
    roster,
    actions: s.actions,
    commitments: s.commitments,
    capacity: s.capacity,
    tool_calls: [],
    require_tool_evidence: false,
  });
  const now = at.toISOString();
  return {
    job_id,
    schema_version: "1",
    execution_status: "SUCCEEDED",
    case_id: null,
    meeting_title: s.title,
    period: { start: sub.period_start, end: sub.period_end, timezone: sub.timezone },
    review_status: "NOT_RUN",
    operational_readiness: r.operational_readiness,
    approval_status: "NOT_REQUESTED",
    external_action: "NOT_PERMITTED",
    version: null,
    actions: s.actions.map((a) => ({
      action_id: a.action_id,
      task: a.task,
      owner: a.owner,
      owner_id: roster.find((x) => x.names.includes(a.owner))?.owner_id ?? null,
      due_text: a.due_text,
      estimated_hours: a.estimated_hours,
      source_quote: quoteFor(s.notes, a.task, a.owner),
    })),
    draft: s.draft ? { ...s.draft, label: "Synthetic sample draft — no model wrote this; not approved, not sent" } : null,
    workload: r.workload,
    issues: r.issues,
    clarification_questions: r.clarification_questions,
    tool_evidence: [],
    review_history: [],
    timestamps: { accepted_at: now, started_at: now, finished_at: now, updated_at: now },
    provenance_note: DEMO_PROVENANCE,
    records: [
      ...(s.commitments.status === "OK"
        ? s.commitments.rows.map((c) => ({
            kind: "commitment",
            id: c.commitment_id,
            owner_id: c.owner_id,
            label: c.task,
            hours: c.remaining_hours,
            status: `${c.confirmation_state} · ${c.task_status}`,
            due_text: c.due_text,
            updated_at: c.updated_at,
            provenance: c.data_provenance,
          }))
        : []),
      ...(s.capacity.status === "OK"
        ? s.capacity.rows.map((c) => ({
            kind: "capacity",
            id: c.capacity_id,
            owner_id: c.owner_id,
            label: c.capacity_basis,
            hours: c.available_hours,
            status: `${c.period_start} – ${c.period_end}`,
            due_text: null,
            updated_at: c.updated_at,
            provenance: c.data_provenance,
          }))
        : []),
    ],
  };
}
