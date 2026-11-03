// Single source of status definitions for the four independent state families.
// Every badge, card and filter reads from here, so labels, tones, icons and screen-reader text stay consistent.
// These describe official backend states; nothing here can change them.
import type { JobView, Readiness, ReviewState } from "./contract";

export type Tone = "ready" | "blocked" | "unknown" | "neutral" | "accent";
export type StatusIcon = "check" | "x" | "alert" | "help" | "clock" | "dash" | "lock" | "pulse";

export interface StatusDef {
  /** Stable key, e.g. "BLOCKED". */
  key: string;
  family: "Execution" | "AI review" | "Operational readiness" | "Human approval";
  label: string;
  tone: Tone;
  icon: StatusIcon;
  /** One-sentence plain-language meaning. */
  description: string;
  /** Full screen-reader phrase, e.g. "Operational readiness: Blocked". */
  sr: string;
}

const def = (family: StatusDef["family"], key: string, label: string, tone: Tone, icon: StatusIcon, description: string): StatusDef => ({
  key,
  family,
  label,
  tone,
  icon,
  description,
  sr: `${family}: ${label}`,
});

// ---------------- EXECUTION ----------------
export const EXECUTION = {
  ACCEPTED: def("Execution", "ACCEPTED", "Accepted", "accent", "clock", "The workflow saved the request and will process it."),
  RUNNING: def("Execution", "RUNNING", "Running", "accent", "pulse", "ActionReady is analyzing the meeting and checking the stored result."),
  SUCCEEDED: def("Execution", "SUCCEEDED", "Analysis complete", "neutral", "check", "The workflow finished and its result was saved and verified."),
  FAILED: def("Execution", "FAILED", "Failed", "blocked", "x", "The analysis did not complete. No result was saved as successful."),
  STALE: def("Execution", "STALE", "Status unknown", "unknown", "help", "No update was recorded for a long time. It is not reported as success or failure."),
  UNKNOWN: def("Execution", "UNKNOWN", "Status unknown", "unknown", "help", "The workflow did not report a recognizable execution state."),
} as const;

export function executionStatus(v: Pick<JobView, "execution_status" | "stale">): StatusDef {
  if (v.stale) return EXECUTION.STALE;
  return EXECUTION[v.execution_status] ?? EXECUTION.UNKNOWN;
}

// ---------------- AI REVIEW ----------------
export const REVIEW = {
  PASS: def("AI review", "PASS", "Pass", "ready", "check", "The evidence reviewer and deterministic checks accepted this draft. This is not human approval."),
  REVISE: def("AI review", "REVISE", "Revision limit reached", "blocked", "x", "The draft was revised the maximum number of times without passing. A person must review it."),
  NEEDS_CLARIFICATION: def("AI review", "NEEDS_CLARIFICATION", "Needs clarification", "unknown", "help", "The meeting notes lack or contradict a fact the draft needs."),
  TECHNICAL_REVIEW: def("AI review", "TECHNICAL_REVIEW", "Technical review", "blocked", "alert", "The workflow completed, but the reviewer result could not be validated."),
  PENDING: def("AI review", "PENDING", "Pending", "neutral", "clock", "The review has not finished yet."),
  NOT_RUN: def("AI review", "NOT_RUN", "Not run", "neutral", "dash", "No AI review ran for this result (synthetic demo evaluates readiness rules only)."),
} as const;

const REVIEW_BY_STATE: Record<ReviewState, StatusDef> = {
  PASSED: REVIEW.PASS,
  REVISION_LIMIT: REVIEW.REVISE,
  NEEDS_CLARIFICATION: REVIEW.NEEDS_CLARIFICATION,
  TECHNICAL_STOP: REVIEW.TECHNICAL_REVIEW,
  PENDING: REVIEW.PENDING,
  NOT_RUN: REVIEW.NOT_RUN,
};

export const reviewStatus = (v: Pick<JobView, "review">): StatusDef => REVIEW_BY_STATE[v.review.state] ?? REVIEW.PENDING;

/** The reviewer rejected or could not validate the latest version, so its actions and draft are unvalidated. */
export const reviewInvalidated = (v: Pick<JobView, "review">) => v.review.state === "TECHNICAL_STOP" || v.review.state === "REVISION_LIMIT";

/** A rubric score is shown as official only when the review actually passed the gate with a recorded score. */
export const officialScore = (v: Pick<JobView, "review">): number | null =>
  v.review.state === "PASSED" && typeof v.review.score === "number" ? v.review.score : null;

// ---------------- OPERATIONAL READINESS ----------------
export const READINESS: Record<Readiness, StatusDef> = {
  READY: def("Operational readiness", "READY", "Ready", "ready", "check", "Records are complete, current, consistent and within recorded capacity."),
  BLOCKED: def("Operational readiness", "BLOCKED", "Blocked", "blocked", "x", "A confirmed overload or commitment conflict exists. The approval path is closed until a person decides."),
  UNKNOWN: def("Operational readiness", "UNKNOWN", "Unknown", "unknown", "help", "Required records are missing, stale, ambiguous or unavailable. This is not a pass."),
  NOT_CHECKED: def("Operational readiness", "NOT_CHECKED", "Not checked", "neutral", "dash", "Commitment and capacity checks did not run for this result."),
};

export const readinessStatus = (r: Readiness): StatusDef => READINESS[r] ?? READINESS.NOT_CHECKED;

// ---------------- HUMAN APPROVAL ----------------
export const APPROVAL = {
  NOT_REQUESTED: def("Human approval", "NOT_REQUESTED", "Not requested", "neutral", "lock", "No approval has been requested for this version. Nothing can be sent."),
  PENDING: def("Human approval", "PENDING", "Pending", "accent", "clock", "An approval request is waiting for a person."),
  APPROVED: def("Human approval", "APPROVED", "Approved", "ready", "check", "A person approved this exact version."),
  CHANGES_REQUESTED: def("Human approval", "CHANGES_REQUESTED", "Changes requested", "unknown", "alert", "A person asked for changes before approval."),
  REJECTED: def("Human approval", "REJECTED", "Rejected", "blocked", "x", "A person rejected this version."),
  EXPIRED: def("Human approval", "EXPIRED", "Expired", "unknown", "clock", "The approval request expired without a decision."),
  DRAFT_CREATED: def("Human approval", "DRAFT_CREATED", "Draft created", "ready", "check", "After approval, an unsent email draft was created."),
  UNKNOWN: def("Human approval", "UNKNOWN", "Unknown", "unknown", "help", "Approval state was not reported."),
} as const;

export function approvalStatus(v: Pick<JobView, "approval_status">): StatusDef {
  const key = String(v.approval_status);
  // Cached snapshots from before the approval lifecycle was modelled used NOT_GIVEN / REQUESTED.
  if (key === "NOT_GIVEN") return APPROVAL.NOT_REQUESTED;
  if (key === "REQUESTED") return APPROVAL.PENDING;
  return (APPROVAL as Record<string, StatusDef>)[key] ?? APPROVAL.UNKNOWN;
}
