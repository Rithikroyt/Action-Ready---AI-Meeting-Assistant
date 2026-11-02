// Labels, tones and plain-language explanations for each state. Shared by server and client.
import type { ApprovalState, ExecutionStatus, JobView, Readiness, ReviewState } from "./contract";

export type Tone = "ready" | "blocked" | "unknown" | "neutral" | "accent";

export const READINESS_UI: Record<Readiness, { label: string; tone: Tone; why: string }> = {
  READY: { label: "Ready", tone: "ready", why: "Records are complete, current, consistent, and within recorded capacity." },
  BLOCKED: { label: "Blocked", tone: "blocked", why: "A confirmed overload or commitment conflict exists. The approval path is closed until a person decides." },
  UNKNOWN: { label: "Unknown", tone: "unknown", why: "Required records are missing, stale, ambiguous or unavailable. This is not a pass." },
  NOT_CHECKED: { label: "Not checked", tone: "neutral", why: "Context checks did not run for this case (legacy case or review did not pass)." },
};

export const REVIEW_UI: Record<ReviewState, { label: string; tone: Tone; why: string }> = {
  PASSED: { label: "Passed", tone: "ready", why: "The evidence reviewer and deterministic checks accepted the draft. This is not human approval." },
  NEEDS_CLARIFICATION: { label: "Needs clarification", tone: "unknown", why: "The notes lack or contradict a fact the draft needs." },
  REVISION_LIMIT: { label: "Revision limit", tone: "blocked", why: "Three versions were tried without passing. A person must review." },
  TECHNICAL_STOP: { label: "Technical stop", tone: "blocked", why: "A model or validation step produced unusable output." },
  PENDING: { label: "Pending", tone: "neutral", why: "The review has not finished yet." },
  NOT_RUN: { label: "Not run (demo)", tone: "neutral", why: "Demo mode does not call models. Only the readiness rules ran." },
};

export const APPROVAL_UI: Record<ApprovalState, { label: string; tone: Tone; why: string }> = {
  NOT_GIVEN: { label: "Not given", tone: "neutral", why: "No person has approved this exact version." },
  REQUESTED: { label: "Requested", tone: "accent", why: "An approval request is pending with a person." },
  APPROVED: { label: "Approved", tone: "ready", why: "A person approved this exact version." },
  REJECTED: { label: "Rejected", tone: "blocked", why: "A person rejected this version." },
  UNKNOWN: { label: "Unknown", tone: "unknown", why: "Approval state was not reported." },
};

export const EXEC_UI: Record<ExecutionStatus, { label: string; tone: Tone }> = {
  ACCEPTED: { label: "Accepted", tone: "accent" },
  RUNNING: { label: "Running", tone: "accent" },
  SUCCEEDED: { label: "Analysis complete", tone: "neutral" },
  FAILED: { label: "Failed", tone: "blocked" },
  UNKNOWN: { label: "Status unknown", tone: "unknown" },
};

export function execLabel(v: JobView): { label: string; tone: Tone } {
  if (v.stale) return { label: "No update — status unknown", tone: "unknown" };
  return EXEC_UI[v.execution_status];
}

export const fmtHours = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtPeriod(p: { start: string; end: string } | null | undefined) {
  if (!p) return "No period";
  const f = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const year = p.end.slice(0, 4);
  return `${f(p.start)} – ${f(p.end)}, ${year}`;
}

export function relTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.round((now - t) / 1000);
  const abs = Math.abs(s);
  const r = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  const out = abs < 45 ? r(abs, "second") : abs < 2700 ? r(Math.round(abs / 60), "minute") : abs < 64800 ? r(Math.round(abs / 3600), "hour") : r(Math.round(abs / 86400), "day");
  return s >= 0 ? `${out} ago` : `in ${out}`;
}
