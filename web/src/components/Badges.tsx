import type { ApprovalState, DataMode, Readiness, ReviewState } from "@/lib/contract";
import { APPROVAL_UI, READINESS_UI, REVIEW_UI, type Tone } from "@/lib/present";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      <span className="dot" aria-hidden />
      {children}
    </span>
  );
}

export const ReadinessBadge = ({ value }: { value: Readiness }) => (
  <Badge tone={READINESS_UI[value].tone} title={READINESS_UI[value].why}>
    {READINESS_UI[value].label}
  </Badge>
);

export const ReviewBadge = ({ value, score }: { value: ReviewState; score?: number | null }) => (
  <Badge tone={REVIEW_UI[value].tone} title={REVIEW_UI[value].why}>
    {REVIEW_UI[value].label}
    {score !== null && score !== undefined ? ` · ${score.toFixed(1)}/5` : ""}
  </Badge>
);

export const ApprovalBadge = ({ value }: { value: ApprovalState }) => (
  <Badge tone={APPROVAL_UI[value].tone} title={APPROVAL_UI[value].why}>
    {APPROVAL_UI[value].label}
  </Badge>
);

export function ModeBadge({ mode }: { mode: DataMode | "live" | "demo" }) {
  const live = mode === "LIVE" || mode === "live";
  return live ? (
    <span className="badge live" title="Results come from the n8n workflow.">
      <span className="dot" aria-hidden />
      Live
    </span>
  ) : (
    <span className="badge demo" title="Synthetic data evaluated locally. No n8n workflow, model or tool call ran.">
      Synthetic demo
    </span>
  );
}
