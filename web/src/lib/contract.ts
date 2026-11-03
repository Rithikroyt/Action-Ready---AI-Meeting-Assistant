// Browser-facing contract (schema_version 1).
// Everything the UI renders passes through normalizeJob(): an explicit allowlist with
// unknown values mapped to null / "UNKNOWN" — never to invented zeroes or successes.
import { z } from "zod";

export const SCHEMA_VERSION = "1";

export const EXECUTION_STATUSES = ["ACCEPTED", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const READINESS = ["READY", "BLOCKED", "UNKNOWN", "NOT_CHECKED"] as const;
export type Readiness = (typeof READINESS)[number];

export type ReviewState = "PASSED" | "NEEDS_CLARIFICATION" | "REVISION_LIMIT" | "TECHNICAL_STOP" | "PENDING" | "NOT_RUN";
export type ApprovalState =
  | "NOT_REQUESTED"
  | "PENDING"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "EXPIRED"
  | "DRAFT_CREATED"
  | "UNKNOWN";
export type DataMode = "LIVE" | "DEMO";

export type Severity = "BLOCKING" | "UNKNOWN" | "NOTICE";

export interface ActionItem {
  action_id: string;
  task: string;
  owner: string | null;
  owner_id: string | null;
  due_text: string | null;
  estimated_hours: number | null;
  source_quote: string | null;
}

export interface OwnerWorkload {
  owner_id: string;
  owner_label: string | null;
  existing_open_hours: number | null;
  existing_commitment_ids: string[];
  new_proposed_hours: number | null;
  new_action_ids: string[];
  projected_load: number | null;
  available_hours: number | null;
  capacity_id: string | null;
  capacity_margin: number | null;
  status: "OVER_CAPACITY" | "WITHIN" | "UNKNOWN";
}

export interface Issue {
  code: string;
  severity: Severity;
  owner_id: string | null;
  message: string;
}

export interface ToolEvidence {
  tool: string;
  args: Record<string, string>;
  returned_ids: string[];
  result_count: number | null;
  retrieved_at: string | null;
  max_source_updated_at: string | null;
  outcome: "OK" | "EMPTY" | "ERROR" | "TRUNCATED" | "UNKNOWN";
  /** Descriptive retrieval text when the source gave no precise timestamp (never shown as a date). */
  retrieved_note?: string | null;
}

/** Minimal summary of a retrieved business record — never the raw row or transcript. */
export interface EvidenceRecord {
  kind: "commitment" | "capacity";
  id: string;
  owner_id: string | null;
  label: string | null;
  hours: number | null;
  status: string | null;
  due_text: string | null;
  updated_at: string | null;
  provenance: string | null;
  /** True when only the record ID is known (live n8n evidence); other fields are null, not guessed. */
  id_only: boolean;
}

export interface ReviewEntry {
  version: number;
  gate: string;
  score: number | null;
  at: string | null;
}

export interface JobView {
  schema_version: string;
  mode: DataMode;
  job_id: string;
  case_id: string | null;
  execution_status: ExecutionStatus;
  /** True when we observed ACCEPTED/RUNNING for longer than the stale window. */
  stale: boolean;
  meeting_title: string | null;
  period: { start: string; end: string; timezone: string | null } | null;
  review: {
    state: ReviewState;
    raw_status: string | null;
    score: number | null;
    threshold: number | null;
    scores: Record<string, number> | null;
  };
  operational_readiness: Readiness;
  approval_status: ApprovalState;
  external_action: "NOT_PERMITTED" | "PERMITTED" | "UNKNOWN";
  version: number | null;
  max_versions: number | null;
  actions: ActionItem[];
  draft: { subject: string; body: string; label: string } | null;
  workload: OwnerWorkload[];
  issues: Issue[];
  clarification_questions: string[];
  tool_evidence: ToolEvidence[];
  records: EvidenceRecord[];
  review_history: ReviewEntry[];
  timestamps: {
    accepted_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string | null;
  };
  error: { code: string; message: string } | null;
  provenance_note: string | null;
}

// ---------- tolerant primitives ----------
const str = (max = 2000) =>
  z.unknown().optional().transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null));
const num = z.unknown().optional().transform((v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
});
const iso = z.unknown().optional().transform((v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null));
/** Only real ISO-8601 timestamps; descriptive sentences are not dates. */
const isoStrict = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
const strList = (max = 40) =>
  z.unknown().optional().transform((v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, max).map((x) => x.slice(0, 600)) : [],
  );
/** n8n Code nodes often persist nested objects as JSON strings. */
const maybeJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
const obj = (v: unknown): Record<string, unknown> | null => {
  const x = maybeJson(v);
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
};
const arr = (v: unknown): unknown[] => {
  const x = maybeJson(v);
  return Array.isArray(x) ? x : [];
};
const pickEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};
const first = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const actionSchema = z.object({
  action_id: str(40),
  id: str(40),
  task: str(500),
  owner: str(120),
  owner_id: str(80),
  due_text: str(200),
  deadline: str(200),
  estimated_hours: num,
  source_quote: str(600),
});

const workloadSchema = z.object({
  owner_id: str(80),
  owner_label: str(120),
  owner: str(120),
  existing_open_hours: num,
  existing_commitment_ids: strList(50),
  new_proposed_hours: num,
  new_action_ids: strList(50),
  projected_load: num,
  available_hours: num,
  capacity_id: str(120),
  capacity_margin: num,
  status: str(40),
  // live n8n names (Build Job Result)
  existing_hours: num,
  new_hours: num,
  projected_hours: num,
  capacity_hours: num,
  margin_hours: num,
});

const issueSchema = z.object({
  code: str(60),
  severity: str(20),
  owner_id: str(80),
  message: str(600),
});

const toolSchema = z.object({
  tool: str(60),
  args: z.unknown(),
  returned_ids: strList(50),
  result_count: num,
  retrieved_at: iso,
  max_source_updated_at: iso,
  outcome: str(20),
});

function mapReview(raw: string | null, gate: string | null): ReviewState {
  const v = (raw ?? gate ?? "").toUpperCase();
  if (!v) return "PENDING";
  if (v.includes("AI_REVIEWED") || v === "PASS" || v === "PASSED") return "PASSED";
  if (v.includes("CLARIF")) return "NEEDS_CLARIFICATION";
  if (v.includes("STOP") || v.includes("LIMIT")) return "REVISION_LIMIT";
  if (v.includes("TECHNICAL") || v.includes("FAIL")) return "TECHNICAL_STOP";
  if (v.includes("NOT_RUN")) return "NOT_RUN";
  return "PENDING";
}

function mapApproval(raw: unknown): ApprovalState {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!v) return "UNKNOWN";
  if (v === "NOT_REQUESTED" || v === "NOT_GIVEN" || v === "NONE") return "NOT_REQUESTED";
  if (v.includes("DRAFT_CREATED")) return "DRAFT_CREATED";
  if (v.includes("CHANGES")) return "CHANGES_REQUESTED";
  if (v.includes("EXPIRE")) return "EXPIRED";
  if (v.includes("REJECT")) return "REJECTED";
  if (v === "APPROVED" || v.startsWith("APPROVED_")) return "APPROVED";
  if (v.includes("REQUEST") || v.includes("PENDING") || v.includes("AWAIT")) return "PENDING";
  return "UNKNOWN";
}

function severityOf(v: string | null): Severity {
  const s = (v ?? "").toUpperCase();
  if (s === "BLOCKING" || s === "BLOCKED" || s === "BLOCKER" || s === "CRITICAL") return "BLOCKING";
  if (s === "NOTICE" || s === "INFO" || s === "WARNING") return "NOTICE";
  return "UNKNOWN";
}

export const STALE_AFTER_MS = 10 * 60 * 1000;

/** Normalize an n8n status/result body (or a stored demo result) into the browser allowlist. */
export function normalizeJob(input: unknown, mode: DataMode, now = Date.now()): JobView {
  const o = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const job_id = str(80).parse(o.job_id) ?? "";
  const execution_status = pickEnum(o.execution_status, EXECUTION_STATUSES, "UNKNOWN");
  const ts = (maybeJson(o.timestamps) ?? {}) as Record<string, unknown>;
  const timestamps = {
    accepted_at: iso.parse(first(ts, "accepted_at") ?? o.accepted_at),
    started_at: iso.parse(first(ts, "started_at") ?? o.started_at),
    finished_at: iso.parse(first(ts, "finished_at", "completed_at") ?? o.finished_at),
    updated_at: iso.parse(first(ts, "updated_at") ?? o.updated_at),
  };
  const lastSeen = Date.parse(timestamps.updated_at ?? timestamps.started_at ?? timestamps.accepted_at ?? "");
  const stale =
    o.stale === true ||
    ((execution_status === "ACCEPTED" || execution_status === "RUNNING") && Number.isFinite(lastSeen) && now - lastSeen > STALE_AFTER_MS);

  // Website contract uses top-level review fields or `review`; live n8n uses `ai_review`.
  const reviewObj = obj(o.review) ?? obj(o.ai_review) ?? {};
  const rawReview = str(60).parse(first(o, "review_status") ?? reviewObj.status);
  const gate = str(30).parse(first(o, "gate") ?? reviewObj.gate);
  const scoresRaw = maybeJson(first(o, "scores") ?? reviewObj.scores);
  const scores =
    scoresRaw && typeof scoresRaw === "object" && !Array.isArray(scoresRaw)
      ? Object.fromEntries(
          Object.entries(scoresRaw as Record<string, unknown>)
            .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
            .slice(0, 10) as [string, number][],
        )
      : null;

  // Live n8n nests readiness: operational_readiness: { status, reasons, questions, ... }.
  const readinessObj = obj(o.operational_readiness);
  const readiness = pickEnum(readinessObj ? readinessObj.status : first(o, "operational_readiness", "readiness"), READINESS, "NOT_CHECKED");

  const evidenceObj = obj(o.evidence);
  // Live n8n keeps excerpts in evidence.actions[{action_id, source_quote}]; matched by action ID only.
  const quoteById = new Map<string, string>();
  for (const e of arr(evidenceObj?.actions)) {
    const x = obj(e);
    const id = str(40).parse(x?.action_id);
    const q = str(600).parse(x?.source_quote);
    if (id && q && !quoteById.has(id)) quoteById.set(id, q);
  }
  const actions: ActionItem[] = arr(first(o, "actions", "action_items", "validated_action_items"))
    .slice(0, 50)
    .map((a, i) => {
      const p = actionSchema.parse(a ?? {});
      const action_id = p.action_id ?? p.id ?? `A${i + 1}`;
      return {
        action_id,
        task: p.task ?? "(task not provided)",
        owner: p.owner,
        owner_id: p.owner_id,
        due_text: p.due_text ?? p.deadline,
        estimated_hours: p.estimated_hours,
        source_quote: p.source_quote ?? quoteById.get(action_id) ?? null,
      };
    });

  const workloadSrc = maybeJson(first(o, "workload", "workload_calculation"));
  const byOwner = arr(o.workload_by_owner);
  const single = obj(workloadSrc);
  const workloadRows = Array.isArray(workloadSrc)
    ? workloadSrc
    : byOwner.length
      ? byOwner // live n8n: one row per owner
      : single?.owners !== undefined
        ? arr(single.owners)
        : single?.owner_id
          ? [single] // live n8n: single primary-owner object
          : [];
  const workload: OwnerWorkload[] = workloadRows.slice(0, 20).flatMap((w) => {
    const p = workloadSchema.parse(w ?? {});
    const owner_id = p.owner_id ?? p.owner;
    if (!owner_id) return [];
    const status = (p.status ?? "").toUpperCase();
    // `??` keeps null as null: an unknown value is never turned into 0.
    const capacity_margin = p.capacity_margin ?? p.margin_hours;
    // Live rows carry no per-owner status. Derive it conservatively: over only from a negative
    // margin; within only when the official case readiness is READY; otherwise unknown.
    const derived: OwnerWorkload["status"] =
      capacity_margin !== null && capacity_margin < 0 ? "OVER_CAPACITY" : capacity_margin !== null && readiness === "READY" ? "WITHIN" : "UNKNOWN";
    return [
      {
        owner_id,
        owner_label: p.owner_label ?? p.owner,
        existing_open_hours: p.existing_open_hours ?? p.existing_hours,
        existing_commitment_ids: p.existing_commitment_ids,
        new_proposed_hours: p.new_proposed_hours ?? p.new_hours,
        new_action_ids: p.new_action_ids,
        projected_load: p.projected_load ?? p.projected_hours,
        available_hours: p.available_hours ?? p.capacity_hours,
        capacity_id: p.capacity_id,
        capacity_margin,
        status: status ? (status.includes("OVER") ? "OVER_CAPACITY" : status.includes("WITHIN") ? "WITHIN" : "UNKNOWN") : derived,
      },
    ];
  });

  const topIssues = arr(first(o, "issues", "blocking_issues", "readiness_reasons", "reasons"));
  const issues: Issue[] = (topIssues.length ? topIssues : arr(readinessObj?.reasons))
    .slice(0, 40)
    .flatMap((x) => {
      if (typeof x === "string") return [{ code: "ISSUE", severity: "UNKNOWN" as Severity, owner_id: null, message: x.slice(0, 600) }];
      const p = issueSchema.parse(x ?? {});
      if (!p.message && !p.code) return [];
      return [{ code: p.code ?? "ISSUE", severity: severityOf(p.severity), owner_id: p.owner_id, message: p.message ?? p.code ?? "" }];
    });

  const tool_evidence: ToolEvidence[] = arr(first(o, "tool_evidence", "tool_evidence_summary"))
    .slice(0, 30)
    .flatMap((t) => {
      const p = toolSchema.parse(t ?? {});
      if (!p.tool) return [];
      const argsObj = maybeJson(p.args);
      const args: Record<string, string> = {};
      if (argsObj && typeof argsObj === "object" && !Array.isArray(argsObj)) {
        for (const [k, v] of Object.entries(argsObj).slice(0, 8)) {
          if (typeof v === "string" || typeof v === "number") args[k.slice(0, 40)] = String(v).slice(0, 120);
        }
      }
      return [
        {
          tool: p.tool,
          args,
          returned_ids: p.returned_ids,
          result_count: p.result_count,
          retrieved_at: p.retrieved_at,
          max_source_updated_at: p.max_source_updated_at,
          outcome: pickEnum(p.outcome, ["OK", "EMPTY", "ERROR", "TRUNCATED", "UNKNOWN"] as const, "UNKNOWN"),
          retrieved_note: null,
        },
      ];
    });
  // Live n8n: evidence.business_records[{tool_name, owner_id, period_start, period_end, record_ids,
  // record_count, retrieved_at (may be descriptive text), updated_at, success}].
  if (!tool_evidence.length) {
    for (const t of arr(evidenceObj?.business_records).slice(0, 30)) {
      const x = obj(t);
      const tool = str(60).parse(x?.tool_name ?? x?.tool);
      if (!x || !tool) continue;
      const args: Record<string, string> = {};
      for (const k of ["owner_id", "period_start", "period_end"]) {
        const v = str(120).parse(x[k]);
        if (v) args[k] = v; // only arguments n8n actually reported
      }
      const count = num.parse(x.record_count);
      const rawRetrieved = typeof x.retrieved_at === "string" ? x.retrieved_at : null;
      const retrieved_at = isoStrict(rawRetrieved);
      tool_evidence.push({
        tool,
        args,
        returned_ids: strList(50).parse(x.record_ids),
        result_count: count,
        retrieved_at,
        max_source_updated_at: isoStrict(x.updated_at),
        outcome: x.success === true ? (count === 0 ? "EMPTY" : "OK") : x.success === false ? "ERROR" : "UNKNOWN",
        retrieved_note: retrieved_at === null && rawRetrieved ? rawRetrieved.slice(0, 160) : null,
      });
    }
  }

  const records: EvidenceRecord[] = arr(first(o, "records", "evidence_records"))
    .slice(0, 60)
    .flatMap((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const id = str(120).parse(r.id ?? r.commitment_id ?? r.capacity_id);
      const kind = r.kind === "capacity" || r.capacity_id !== undefined ? "capacity" : r.kind === "commitment" || r.commitment_id !== undefined ? "commitment" : null;
      if (!id || !kind) return [];
      return [
        {
          kind,
          id,
          owner_id: str(80).parse(r.owner_id),
          label: str(300).parse(r.label ?? r.task ?? r.capacity_basis),
          hours: num.parse(r.hours ?? r.remaining_hours ?? r.available_hours),
          status: str(80).parse(r.status ?? r.task_status),
          due_text: str(200).parse(r.due_text),
          updated_at: iso.parse(r.updated_at),
          provenance: str(60).parse(r.provenance ?? r.data_provenance),
          id_only: false,
        },
      ];
    });
  // Live n8n returns record IDs only. Keep them, marked id_only, with every other field null.
  if (!records.length) {
    const seen = new Set<string>();
    for (const t of tool_evidence) {
      const kind = /capacity/i.test(t.tool) ? "capacity" : /commitment/i.test(t.tool) ? "commitment" : null;
      if (!kind) continue;
      for (const id of t.returned_ids) {
        const key = kind + ":" + id;
        if (seen.has(key)) continue;
        seen.add(key);
        records.push({ kind, id, owner_id: t.args.owner_id ?? null, label: null, hours: null, status: null, due_text: null, updated_at: null, provenance: null, id_only: true });
      }
    }
  }

  const review_history: ReviewEntry[] = arr(first(o, "review_history", "versions"))
    .slice(0, 10)
    .flatMap((r) => {
      const x = (r ?? {}) as Record<string, unknown>;
      const version = num.parse(x.version);
      if (version === null) return [];
      return [{ version, gate: str(30).parse(x.gate) ?? "UNKNOWN", score: num.parse(x.score), at: iso.parse(x.at ?? x.created_at) }];
    });

  const draftObj = (maybeJson(first(o, "draft", "draft_preview")) ?? null) as Record<string, unknown> | null;
  const subject = draftObj ? str(300).parse(draftObj.subject) : null;
  const body = draftObj ? str(6000).parse(draftObj.body) : null;

  const periodObj = (maybeJson(o.period) ?? {}) as Record<string, unknown>;
  const pStart = str(10).parse(periodObj.start ?? o.period_start);
  const pEnd = str(10).parse(periodObj.end ?? o.period_end);

  const errObj = (maybeJson(o.error) ?? null) as Record<string, unknown> | null;
  const error =
    errObj && typeof errObj === "object"
      ? { code: str(60).parse(errObj.code) ?? "ERROR", message: str(400).parse(errObj.message) ?? "The analysis did not complete." }
      : execution_status === "FAILED"
        ? { code: "FAILED", message: "The analysis did not complete. No result was saved as successful." }
        : null;

  const approval_status = mapApproval(o.approval_status ?? obj(o.human_approval)?.status);
  const ext = typeof o.external_action === "string" ? o.external_action.toUpperCase() : "";

  return {
    schema_version: str(10).parse(o.schema_version) ?? SCHEMA_VERSION,
    mode,
    job_id,
    case_id: str(80).parse(o.case_id),
    execution_status,
    stale,
    meeting_title: str(200).parse(o.meeting_title),
    period: pStart && pEnd ? { start: pStart, end: pEnd, timezone: str(60).parse(periodObj.timezone ?? o.timezone) } : null,
    review: {
      state: execution_status === "SUCCEEDED" || rawReview || gate ? mapReview(rawReview, gate) : "PENDING",
      raw_status: rawReview,
      score: num.parse(first(o, "review_score", "quality_score", "latest_score") ?? reviewObj.score),
      threshold: num.parse(first(o, "quality_threshold") ?? reviewObj.threshold),
      scores: scores && Object.keys(scores).length ? scores : null,
    },
    // A missing readiness on a finished legacy-style result is NOT_CHECKED, never READY.
    operational_readiness: readiness,
    approval_status,
    // Only an explicit PERMITTED from the server counts; everything else stays not permitted.
    external_action: ext === "PERMITTED" ? "PERMITTED" : ext === "UNKNOWN" ? "UNKNOWN" : "NOT_PERMITTED",
    version: num.parse(first(o, "version", "latest_version") ?? reviewObj.version),
    max_versions: num.parse(o.max_versions),
    actions,
    draft: subject && body ? { subject, body, label: str(120).parse(draftObj?.label) ?? "Draft — not approved, not sent" } : null,
    workload,
    issues,
    clarification_questions: strList(20).parse(maybeJson(first(o, "clarification_questions", "questions") ?? readinessObj?.questions)),
    tool_evidence,
    records,
    review_history,
    timestamps,
    error,
    provenance_note: str(400).parse(o.provenance_note),
  };
}

export const isFinal = (s: ExecutionStatus) => s === "SUCCEEDED" || s === "FAILED";

// ---------- submission ----------
export const JOB_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

export const submissionSchema = z
  .object({
    request_id: z.string().uuid(),
    notes: z
      .string()
      .transform((s) => s.replace(/\r\n/g, "\n").trim())
      .pipe(z.string().min(20, "Notes are too short to be meeting notes.").max(12000, "Notes exceed the 12,000-character limit. Nothing was truncated.")),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    timezone: z.string().min(1).max(60),
  })
  .strict()
  .superRefine((v, ctx) => {
    const s = Date.parse(v.period_start + "T00:00:00Z");
    const e = Date.parse(v.period_end + "T00:00:00Z");
    if (!Number.isFinite(s) || new Date(s).toISOString().slice(0, 10) !== v.period_start)
      ctx.addIssue({ code: "custom", path: ["period_start"], message: "Not a real calendar date." });
    if (!Number.isFinite(e) || new Date(e).toISOString().slice(0, 10) !== v.period_end)
      ctx.addIssue({ code: "custom", path: ["period_end"], message: "Not a real calendar date." });
    if (Number.isFinite(s) && Number.isFinite(e)) {
      if (e < s) ctx.addIssue({ code: "custom", path: ["period_end"], message: "Period end is before period start." });
      if (e - s > 31 * 86400000) ctx.addIssue({ code: "custom", path: ["period_end"], message: "Planning periods are limited to 31 days." });
    }
    let tzOk = false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v.timezone });
      tzOk = true;
    } catch {
      tzOk = false;
    }
    if (!tzOk) ctx.addIssue({ code: "custom", path: ["timezone"], message: "Unknown IANA timezone." });
    if (v.notes.split(/\s+/).length < 4)
      ctx.addIssue({ code: "custom", path: ["notes"], message: "Notes are too short to be meeting notes." });
  });

export type Submission = z.infer<typeof submissionSchema>;

export const acceptedSchema = z.object({
  job_id: z.string().regex(JOB_ID_RE),
  execution_status: z.literal("ACCEPTED").or(z.enum(["RUNNING", "SUCCEEDED", "FAILED"])),
  schema_version: z.string().optional(),
});
