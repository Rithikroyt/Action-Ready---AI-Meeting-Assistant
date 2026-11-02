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
export type ApprovalState = "NOT_GIVEN" | "REQUESTED" | "APPROVED" | "REJECTED" | "UNKNOWN";
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
  const v = typeof raw === "string" ? raw.toUpperCase() : "";
  if (!v || v === "NOT_REQUESTED" || v === "NOT_GIVEN" || v === "NONE") return v ? "NOT_GIVEN" : "UNKNOWN";
  if (v.includes("REJECT")) return "REJECTED";
  if (v === "APPROVED" || v.startsWith("APPROVED_")) return "APPROVED";
  if (v.includes("REQUEST") || v.includes("PENDING")) return "REQUESTED";
  return "UNKNOWN";
}

function severityOf(v: string | null): Severity {
  const s = (v ?? "").toUpperCase();
  if (s === "BLOCKING" || s === "BLOCKER" || s === "CRITICAL") return "BLOCKING";
  if (s === "NOTICE" || s === "INFO") return "NOTICE";
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
    (execution_status === "ACCEPTED" || execution_status === "RUNNING") &&
    Number.isFinite(lastSeen) &&
    now - lastSeen > STALE_AFTER_MS;

  const reviewObj = (maybeJson(o.review) ?? {}) as Record<string, unknown>;
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

  const readiness = pickEnum(first(o, "operational_readiness", "readiness"), READINESS, "NOT_CHECKED");

  const actions: ActionItem[] = arr(first(o, "actions", "action_items", "validated_action_items"))
    .slice(0, 50)
    .map((a, i) => {
      const p = actionSchema.parse(a ?? {});
      return {
        action_id: p.action_id ?? p.id ?? `A${i + 1}`,
        task: p.task ?? "(task not provided)",
        owner: p.owner,
        owner_id: p.owner_id,
        due_text: p.due_text ?? p.deadline,
        estimated_hours: p.estimated_hours,
        source_quote: p.source_quote,
      };
    });

  const workloadSrc = maybeJson(first(o, "workload", "workload_calculation"));
  const workloadRows = Array.isArray(workloadSrc)
    ? workloadSrc
    : arr((workloadSrc as Record<string, unknown> | undefined)?.owners);
  const workload: OwnerWorkload[] = workloadRows.slice(0, 20).flatMap((w) => {
    const p = workloadSchema.parse(w ?? {});
    const owner_id = p.owner_id ?? p.owner;
    if (!owner_id) return [];
    const status = (p.status ?? "").toUpperCase();
    return [
      {
        owner_id,
        owner_label: p.owner_label ?? p.owner,
        existing_open_hours: p.existing_open_hours,
        existing_commitment_ids: p.existing_commitment_ids,
        new_proposed_hours: p.new_proposed_hours,
        new_action_ids: p.new_action_ids,
        projected_load: p.projected_load,
        available_hours: p.available_hours,
        capacity_id: p.capacity_id,
        capacity_margin: p.capacity_margin,
        status: status.includes("OVER") ? "OVER_CAPACITY" : status === "WITHIN" || status.includes("WITHIN") ? "WITHIN" : "UNKNOWN",
      },
    ];
  });

  const issues: Issue[] = arr(first(o, "issues", "blocking_issues", "readiness_reasons", "reasons"))
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
        },
      ];
    });

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
        },
      ];
    });

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

  const approval_status = mapApproval(o.approval_status);
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
    version: num.parse(first(o, "version", "latest_version")),
    max_versions: num.parse(o.max_versions),
    actions,
    draft: subject && body ? { subject, body, label: str(120).parse(draftObj?.label) ?? "Draft — not approved, not sent" } : null,
    workload,
    issues,
    clarification_questions: strList(20).parse(maybeJson(first(o, "clarification_questions", "questions"))),
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
