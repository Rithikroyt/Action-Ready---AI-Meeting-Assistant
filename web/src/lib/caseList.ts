// Overview list model: a serializable row per case plus pure search / filter / sort. No network.
import type { JobView } from "./contract";
import { approvalStatus, executionStatus, readinessStatus, reviewStatus } from "./status";
import { deriveDecision } from "./decision";

export interface CaseRow {
  job_id: string;
  case_id: string | null;
  mode: "LIVE" | "DEMO";
  title: string;
  submitted_at: string;
  updated_at: string;
  period: { start: string; end: string } | null;
  final: boolean;
  execution: string;
  review: string;
  readiness: string;
  approval: string;
  /** One-line official reason, or null while processing. */
  reason: string | null;
  refresh_error: string | null;
}

export const FILTERS = [
  "ALL",
  "READY",
  "BLOCKED",
  "UNKNOWN",
  "IN_PROGRESS",
  "NEEDS_CLARIFICATION",
  "TECHNICAL_REVIEW",
  "AWAITING_APPROVAL",
] as const;
export type CaseFilter = (typeof FILTERS)[number];

export const FILTER_LABEL: Record<CaseFilter, string> = {
  ALL: "All",
  READY: "Ready",
  BLOCKED: "Blocked",
  UNKNOWN: "Unknown",
  IN_PROGRESS: "In progress",
  NEEDS_CLARIFICATION: "Needs clarification",
  TECHNICAL_REVIEW: "Technical review",
  AWAITING_APPROVAL: "Awaiting approval",
};

export type CaseSort = "updated" | "attention" | "title";

export function toCaseRow(r: {
  job_id: string;
  mode: "LIVE" | "DEMO";
  submitted_at: string;
  period: { start: string; end: string } | null;
  view: JobView | null;
  refresh_error: string | null;
}): CaseRow {
  const v = r.view;
  const final = v?.execution_status === "SUCCEEDED" || v?.execution_status === "FAILED";
  const exec = v ? executionStatus(v) : null;
  let reason: string | null = null;
  if (v && (final || v.stale)) {
    const d = deriveDecision(v);
    reason = d.primary.title + (d.secondary && d.secondary.kind !== "NOT_CHECKED" ? ` · ${d.secondary.title}` : "");
  }
  return {
    job_id: r.job_id,
    case_id: v?.case_id ?? null,
    mode: r.mode,
    title: v?.meeting_title ?? (v?.case_id ? `Case ${v.case_id}` : "Untitled meeting"),
    submitted_at: r.submitted_at,
    updated_at: v?.timestamps.updated_at ?? v?.timestamps.finished_at ?? r.submitted_at,
    period: r.period,
    final,
    execution: exec?.key ?? "UNKNOWN",
    review: v && final && v.execution_status === "SUCCEEDED" ? reviewStatus(v).key : "PENDING",
    readiness: v && final && v.execution_status === "SUCCEEDED" ? readinessStatus(v.operational_readiness).key : "NOT_CHECKED",
    approval: v ? approvalStatus(v).key : "UNKNOWN",
    reason,
    refresh_error: r.refresh_error,
  };
}

export function matchesFilter(row: CaseRow, f: CaseFilter): boolean {
  switch (f) {
    case "ALL":
      return true;
    case "READY":
    case "BLOCKED":
    case "UNKNOWN":
      return row.readiness === f;
    case "IN_PROGRESS":
      return row.execution === "ACCEPTED" || row.execution === "RUNNING";
    case "NEEDS_CLARIFICATION":
      return row.review === "NEEDS_CLARIFICATION";
    case "TECHNICAL_REVIEW":
      return row.review === "TECHNICAL_REVIEW" || row.review === "REVISE";
    case "AWAITING_APPROVAL":
      return row.approval === "PENDING";
  }
}

export function matchesQuery(row: CaseRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [row.title, row.case_id ?? "", row.job_id, row.reason ?? ""].some((x) => x.toLowerCase().includes(s));
}

/** Lower number = needs a person sooner. */
function attentionRank(r: CaseRow): number {
  if (r.execution === "FAILED" || r.execution === "STALE") return 0;
  if (r.readiness === "BLOCKED") return 1;
  if (r.review === "TECHNICAL_REVIEW" || r.review === "REVISE" || r.review === "NEEDS_CLARIFICATION") return 2;
  if (r.readiness === "UNKNOWN") return 3;
  if (r.execution === "ACCEPTED" || r.execution === "RUNNING") return 4;
  if (r.approval === "PENDING") return 5;
  return 6;
}

export function sortCases(rows: CaseRow[], sort: CaseSort): CaseRow[] {
  const byUpdated = (a: CaseRow, b: CaseRow) => b.updated_at.localeCompare(a.updated_at);
  const out = [...rows];
  if (sort === "updated") out.sort(byUpdated);
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title) || byUpdated(a, b));
  else out.sort((a, b) => attentionRank(a) - attentionRank(b) || byUpdated(a, b));
  return out;
}

export const countBy = (rows: CaseRow[]) => ({
  cases: rows.length,
  ready: rows.filter((r) => matchesFilter(r, "READY")).length,
  blocked: rows.filter((r) => matchesFilter(r, "BLOCKED")).length,
  unknown: rows.filter((r) => matchesFilter(r, "UNKNOWN")).length,
  inProgress: rows.filter((r) => matchesFilter(r, "IN_PROGRESS")).length,
  awaiting: rows.filter((r) => matchesFilter(r, "AWAITING_APPROVAL")).length,
});
