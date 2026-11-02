// Deterministic operational-readiness reference implementation (schema_version 1).
// Pure function: no I/O, no clock reads (callers pass `now`). The n8n "Compute Operational
// Readiness" Code node should implement these same rules; tests/readiness.test.ts is the spec.
import type { Issue, OwnerWorkload, Readiness, Severity, ToolEvidence } from "./contract";

export interface CommitmentRow {
  commitment_id: string;
  project_id: string;
  owner_id: string;
  task: string;
  due_text: string | null;
  period_start: string;
  period_end: string;
  remaining_hours: number | null;
  task_status: string;
  confirmation_state: string;
  source_ref: string | null;
  updated_at: string;
  data_provenance: string;
}

export interface CapacityRow {
  capacity_id: string;
  project_id: string;
  owner_id: string;
  period_start: string;
  period_end: string;
  available_hours: number | null;
  capacity_basis: string | null;
  source_ref: string | null;
  updated_at: string;
  data_provenance: string;
}

export type Read<T> =
  | { status: "OK"; rows: T[]; retrieved_at: string }
  | { status: "ERROR" | "NOT_CONFIGURED"; error: string; retrieved_at: string };

export interface ProposedAction {
  action_id: string;
  task: string;
  owner: string;
  due_text: string | null;
  estimated_hours: number | null;
  /** Stable commitment ID explicitly referenced by the notes, if any. */
  commitment_ref?: string | null;
}

export interface RosterEntry {
  owner_id: string;
  names: string[];
}

export interface ReadinessInput {
  project_id: string;
  period: { start: string; end: string } | null;
  now: string;
  max_record_age_days: number;
  max_rows_per_read: number;
  roster: RosterEntry[];
  actions: ProposedAction[];
  commitments: Read<CommitmentRow>;
  capacity: Read<CapacityRow>;
  /** Observed (not claimed) agent tool calls. */
  tool_calls: ToolEvidence[];
  /** DEMO mode runs no agent, so it cannot produce tool evidence; the waiver is reported. */
  require_tool_evidence: boolean;
}

export interface ReadinessResult {
  operational_readiness: Readiness;
  workload: OwnerWorkload[];
  issues: Issue[];
  clarification_questions: string[];
}

const OPEN = new Set(["OPEN", "IN_PROGRESS"]);
const round = (n: number) => Math.round(n * 100) / 100;

/** Core capacity comparison, shared by the official rules and the local what-if simulation. */
export function compareLoad(existing: number, added: number, capacity: number) {
  const projected = round(existing + added);
  return { projected, margin: round(capacity - projected), over: projected > capacity };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

function tokens(s: string): Set<string> {
  const stop = new Set(["the", "a", "an", "and", "of", "for", "to", "by", "on", "with", "prepare", "update"]);
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 1 && !stop.has(t))
      .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)),
  );
}
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
const POSSIBLE_DUPLICATE_AT = 0.6;

export function resolveOwner(name: string, roster: RosterEntry[]): { owner_id: string } | { error: "UNRESOLVED" | "AMBIGUOUS" } {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return { error: "UNRESOLVED" };
  // Any entry whose ID, full name or first name matches is a candidate:
  // "Maya" is ambiguous when both "Maya Chen" and "Maya Ortiz" exist, even though "maya" is also an ID.
  const hits = roster.filter(
    (r) =>
      r.owner_id.toLowerCase() === n ||
      r.names.some((x) => {
        const full = x.toLowerCase();
        return full === n || full.split(" ")[0] === n;
      }),
  );
  if (hits.length === 1) return { owner_id: hits[0]!.owner_id };
  return { error: hits.length > 1 ? "AMBIGUOUS" : "UNRESOLVED" };
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const issues: Issue[] = [];
  const questions: string[] = [];
  const add = (severity: Severity, code: string, owner_id: string | null, message: string, question?: string) => {
    issues.push({ code, severity, owner_id, message });
    if (question && !questions.includes(question)) questions.push(question);
  };
  const nowMs = Date.parse(input.now);
  const maxAgeMs = input.max_record_age_days * 86400000;
  const isStale = (iso: string) => {
    const t = Date.parse(iso);
    return !Number.isFinite(t) || nowMs - t > maxAgeMs;
  };

  if (!input.period) {
    add("UNKNOWN", "PERIOD_MISSING", null, "No explicit planning period was supplied, so records cannot be matched.", "Which planning period (start and end date) do these commitments belong to?");
    return finish([], issues, questions);
  }
  const { start, end } = input.period;
  const inScope = (r: { project_id: string; period_start: string; period_end: string }) =>
    r.project_id === input.project_id && r.period_start === start && r.period_end === end;

  // ---- owners ----
  const byOwner = new Map<string, ProposedAction[]>();
  for (const a of input.actions) {
    const res = resolveOwner(a.owner, input.roster);
    if ("error" in res) {
      add(
        "UNKNOWN",
        res.error === "AMBIGUOUS" ? "OWNER_AMBIGUOUS" : "OWNER_UNRESOLVED",
        null,
        `${a.action_id}: owner "${a.owner}" ${res.error === "AMBIGUOUS" ? "matches more than one roster entry" : "is not in the trusted roster"}, so their records were not checked.`,
        `Who exactly owns ${a.action_id} ("${a.task}")?`,
      );
      continue;
    }
    byOwner.set(res.owner_id, [...(byOwner.get(res.owner_id) ?? []), a]);
  }

  // ---- reads ----
  const readProblem = (read: Read<unknown>, label: string): boolean => {
    if (read.status !== "OK") {
      add("UNKNOWN", "RETRIEVAL_FAILED", null, `${label} could not be read (${read.status === "NOT_CONFIGURED" ? "not configured" : "read failed"}). This is not treated as zero.`);
      return true;
    }
    return false;
  };
  const commitmentsFailed = readProblem(input.commitments, "The commitment register");
  const capacityFailed = readProblem(input.capacity, "The capacity record");

  const scoped = <T extends { project_id: string; period_start: string; period_end: string; owner_id: string }>(
    read: Read<T>,
    label: string,
  ): { rows: T[]; truncated: boolean } => {
    if (read.status !== "OK") return { rows: [], truncated: false };
    const truncated = read.rows.length > input.max_rows_per_read;
    if (truncated)
      add("UNKNOWN", "TRUNCATED_READ", null, `${label} returned more than ${input.max_rows_per_read} rows; the read is incomplete, not a complete result.`);
    const rows: T[] = [];
    for (const r of read.rows.slice(0, input.max_rows_per_read)) {
      if (!inScope(r)) {
        add("UNKNOWN", "SCOPE_MISMATCH", r.owner_id ?? null, `${label} returned a record outside the authorized project/period; it was discarded and the read is not trusted.`);
        continue;
      }
      rows.push(r);
    }
    return { rows, truncated };
  };
  const C = scoped(input.commitments, "The commitment register");
  const K = scoped(input.capacity, "The capacity record");

  const workload: OwnerWorkload[] = [];

  for (const [owner_id, actions] of byOwner) {
    const who = actions[0]?.owner ?? owner_id;
    // ---- tool evidence ----
    const ownerCommitIds = new Set(C.rows.filter((r) => r.owner_id === owner_id).map((r) => r.commitment_id));
    const ownerCapIds = new Set(K.rows.filter((r) => r.owner_id === owner_id).map((r) => r.capacity_id));
    if (input.require_tool_evidence) {
      for (const [tool, expected] of [
        ["Commitment_Register", ownerCommitIds],
        ["Capacity_Lookup", ownerCapIds],
      ] as const) {
        const calls = input.tool_calls.filter((t) => t.tool === tool && t.args.owner_id === owner_id && (t.outcome === "OK" || t.outcome === "EMPTY"));
        if (!calls.length) {
          add("UNKNOWN", "TOOL_EVIDENCE_MISSING", owner_id, `No successful ${tool} call for ${who} was observed in the execution, so the reviewer's use of these records is unverified.`);
          continue;
        }
        const seen = new Set(calls[calls.length - 1]!.returned_ids);
        const same = seen.size === expected.size && [...expected].every((id) => seen.has(id));
        if (!same)
          add("UNKNOWN", "CONTEXT_CHANGED", owner_id, `${tool} returned different record IDs than the independent read for ${who}; the records may have changed during analysis.`);
      }
    }

    // ---- existing commitments ----
    const ownerRows = C.rows.filter((r) => r.owner_id === owner_id);
    const byId = new Map<string, CommitmentRow[]>();
    for (const r of ownerRows) byId.set(r.commitment_id, [...(byId.get(r.commitment_id) ?? []), r]);
    const counted: CommitmentRow[] = [];
    let existingKnown = 0;
    let existingComplete = !commitmentsFailed && !C.truncated;
    for (const [id, rows] of byId) {
      const distinct = new Set(rows.map((r) => JSON.stringify([r.remaining_hours, r.task_status, r.confirmation_state, r.due_text])));
      if (distinct.size > 1) {
        add("BLOCKING", "REGISTER_CONFLICT", owner_id, `Commitment ${id} appears more than once with different values.`, `Which version of commitment ${id} is correct?`);
        existingComplete = false;
        continue;
      }
      if (rows.length > 1) add("NOTICE", "DUPLICATE_ROW", owner_id, `Commitment ${id} is stored ${rows.length} times with identical values; counted once.`);
      const r = rows[0]!;
      if (r.confirmation_state.toUpperCase() !== "CONFIRMED" || !OPEN.has(r.task_status.toUpperCase())) continue;
      if (isStale(r.updated_at)) {
        add("UNKNOWN", "STALE_RECORD", owner_id, `Commitment ${id} was last updated ${r.updated_at}, older than the ${input.max_record_age_days}-day freshness policy.`, `Is commitment ${id} ("${r.task}") still open with ${r.remaining_hours ?? "unknown"} h remaining?`);
        existingComplete = false;
        continue;
      }
      if (r.remaining_hours === null || !Number.isFinite(r.remaining_hours) || r.remaining_hours < 0) {
        add("UNKNOWN", "REMAINING_MISSING", owner_id, `Commitment ${id} has no valid remaining-hours value.`, `How many hours remain on commitment ${id}?`);
        existingComplete = false;
        continue;
      }
      counted.push(r);
      existingKnown = round(existingKnown + r.remaining_hours);
    }

    // ---- proposed work vs existing ----
    let newKnown = 0;
    let newComplete = true;
    const newIds: string[] = [];
    for (const a of actions) {
      const ref = a.commitment_ref ? byId.get(a.commitment_ref)?.[0] : undefined;
      if (ref) {
        // Exact stable ID: this is the existing commitment restated, not new work.
        if ((ref.due_text ?? "").trim().toLowerCase() !== (a.due_text ?? "").trim().toLowerCase())
          add("UNKNOWN", "DEADLINE_CHANGE", owner_id, `${a.action_id} restates ${ref.commitment_id}: the register says "${ref.due_text ?? "no deadline"}", these notes say "${a.due_text ?? "no deadline"}".`, `Is the new deadline for ${ref.commitment_id} an approved change?`);
        continue;
      }
      const similar = counted.find((r) => similarity(r.task, a.task) >= POSSIBLE_DUPLICATE_AT);
      if (similar) {
        const due = (similar.due_text ?? "").trim().toLowerCase() !== (a.due_text ?? "").trim().toLowerCase();
        add(
          "UNKNOWN",
          "POSSIBLE_DUPLICATE",
          owner_id,
          `${a.action_id} ("${a.task}") resembles existing commitment ${similar.commitment_id} ("${similar.task}")${due ? `, with a different deadline ("${similar.due_text ?? "none"}" vs "${a.due_text ?? "none"}")` : ""}. Both are counted until confirmed.`,
          `Is ${a.action_id} the same work as ${similar.commitment_id}, or genuinely new?`,
        );
      }
      newIds.push(a.action_id);
      if (a.estimated_hours === null || !Number.isFinite(a.estimated_hours) || a.estimated_hours < 0) {
        add("UNKNOWN", "ESTIMATE_MISSING", owner_id, `${a.action_id} has no effort estimate, so the projected load is incomplete.`, `How many hours will ${a.action_id} ("${a.task}") take?`);
        newComplete = false;
      } else newKnown = round(newKnown + a.estimated_hours);
    }

    // ---- capacity ----
    const caps = K.rows.filter((r) => r.owner_id === owner_id);
    let available: number | null = null;
    let capacity_id: string | null = null;
    if (!capacityFailed && !K.truncated) {
      const fresh = caps.filter((c) => !isStale(c.updated_at));
      const values = new Set(caps.map((c) => c.available_hours));
      if (!caps.length)
        add("UNKNOWN", "CAPACITY_MISSING", owner_id, `No capacity record exists for ${who} in ${start} – ${end}. Capacity is not assumed to be zero or unlimited.`, `What is ${who}'s recorded capacity for ${start} – ${end}?`);
      else if (values.size > 1)
        add("UNKNOWN", "CAPACITY_CONFLICT", owner_id, `${who} has ${caps.length} capacity records with different values (${[...values].join(" vs ")} h).`, `Which capacity record for ${who} applies?`);
      else if (fresh.length !== caps.length)
        add("UNKNOWN", "STALE_RECORD", owner_id, `${who}'s capacity record was last updated ${caps[0]!.updated_at}, older than the ${input.max_record_age_days}-day freshness policy.`, `Is ${who}'s capacity of ${caps[0]!.available_hours ?? "?"} h still current?`);
      else if (caps[0]!.available_hours === null || !Number.isFinite(caps[0]!.available_hours) || caps[0]!.available_hours < 0)
        add("UNKNOWN", "CAPACITY_INVALID", owner_id, `${who}'s capacity record has no valid available-hours value.`);
      else {
        available = caps[0]!.available_hours;
        capacity_id = caps[0]!.capacity_id;
      }
    }

    // ---- verdict ----
    const complete = existingComplete && newComplete;
    const projected = complete ? round(existingKnown + newKnown) : null;
    // Known hours are a lower bound: a confirmed overload stays a blocker even if other data is unknown.
    const cmp = available !== null ? compareLoad(existingKnown, newKnown, available) : null;
    const lowerBound = cmp?.projected ?? round(existingKnown + newKnown);
    let status: OwnerWorkload["status"] = "UNKNOWN";
    if (available !== null && cmp?.over) {
      status = "OVER_CAPACITY";
      const over = round(-cmp.margin);
      add(
        "BLOCKING",
        "OVER_CAPACITY",
        owner_id,
        `${who}: ${fmt(existingKnown)} h confirmed open + ${fmt(newKnown)} h new = ${fmt(lowerBound)} h${complete ? "" : " (known subtotal)"} against ${fmt(available)} h recorded capacity — ${fmt(over)} h short.`,
        `${who} is ${fmt(over)} h over recorded capacity. Which commitment, estimate, or capacity record should change? Nothing has been reassigned or rescheduled.`,
      );
    } else if (available !== null && complete) status = "WITHIN";

    workload.push({
      owner_id,
      owner_label: actions[0]?.owner ?? null,
      existing_open_hours: existingComplete ? existingKnown : null,
      existing_commitment_ids: counted.map((r) => r.commitment_id),
      new_proposed_hours: newComplete ? newKnown : null,
      new_action_ids: newIds,
      projected_load: projected,
      available_hours: available,
      capacity_id,
      capacity_margin: projected !== null && available !== null ? round(available - projected) : null,
      status,
    });
  }

  if (!input.require_tool_evidence)
    add("NOTICE", "TOOL_EVIDENCE_WAIVED", null, "DEMO mode: no agent ran, so tool-call evidence was not required. LIVE results require observed tool calls.");
  if (!input.actions.length)
    add("UNKNOWN", "NO_ACTIONS", null, "No confirmed actions were extracted, so there is nothing to check against the register.");

  return finish(workload, issues, questions);
}

function finish(workload: OwnerWorkload[], issues: Issue[], questions: string[]): ReadinessResult {
  const operational_readiness: Readiness = issues.some((i) => i.severity === "BLOCKING")
    ? "BLOCKED"
    : issues.some((i) => i.severity === "UNKNOWN")
      ? "UNKNOWN"
      : "READY";
  return { operational_readiness, workload, issues, clarification_questions: questions };
}
