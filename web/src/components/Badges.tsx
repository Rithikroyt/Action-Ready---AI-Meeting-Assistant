import type { ApprovalState, DataMode, Readiness, ReviewState } from "@/lib/contract";
import { approvalStatus, readinessStatus, reviewStatus, type Tone } from "@/lib/status";
import { StatusBadge } from "./StatusBadge";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      <span className="dot" aria-hidden />
      {children}
    </span>
  );
}

// Thin wrappers over the central status module (src/lib/status.ts).
export const ReadinessBadge = ({ value }: { value: Readiness }) => <StatusBadge def={readinessStatus(value)} />;

export const ReviewBadge = ({ value, score }: { value: ReviewState; score?: number | null }) => (
  <StatusBadge def={reviewStatus({ review: { state: value } as never })} suffix={score !== null && score !== undefined && value === "PASSED" ? ` · ${score.toFixed(1)}/5` : undefined} />
);

export const ApprovalBadge = ({ value }: { value: ApprovalState }) => <StatusBadge def={approvalStatus({ approval_status: value })} />;

/** Environment label. Synthetic values are never shown without "Synthetic demo". */
export function ModeBadge({ mode, disconnected = false }: { mode: DataMode | "live" | "demo"; disconnected?: boolean }) {
  if (disconnected)
    return (
      <span className="badge env disconnected" title="Live mode is selected but the n8n connection is not configured. Nothing is submitted.">
        <span className="dot" aria-hidden />
        Disconnected
      </span>
    );
  const live = mode === "LIVE" || mode === "live";
  return live ? (
    <span className="badge env live" title="Results come from the n8n workflow.">
      <span className="dot" aria-hidden />
      Live n8n
    </span>
  ) : (
    <span className="badge env demo" title="Synthetic data evaluated locally. No n8n workflow, model or tool call ran.">
      Synthetic demo
    </span>
  );
}
