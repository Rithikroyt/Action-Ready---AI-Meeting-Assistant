// Plain-language "what is the official result, why, and what must a person decide" — derived ONLY from the
// official backend result. It explains; it never changes a status, fills a missing number, or claims approval.
import type { JobView, OwnerWorkload } from "./contract";
import type { Tone } from "./status";

export type DecisionKind =
  | "FAILED"
  | "STALE"
  | "TECHNICAL"
  | "REVISION_LIMIT"
  | "CLARIFY"
  | "BLOCKED"
  | "UNKNOWN"
  | "READY"
  | "NOT_CHECKED";

export interface DecisionPart {
  kind: DecisionKind;
  tone: Tone;
  /** Short heading, e.g. "Action required". */
  title: string;
  /** The official conclusion in one or two sentences. */
  summary: string;
  /** The decision a person must make, if any. */
  question: string | null;
}

export interface Decision {
  primary: DecisionPart;
  /** Operational-readiness conclusion shown separately when the primary is about the AI review. */
  secondary: DecisionPart | null;
}

const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

/** Human display name for an owner ID, taken only from the case's own actions; falls back to the ID. */
export function ownerName(v: Pick<JobView, "actions" | "workload">, ownerId: string): string {
  const id = ownerId.toLowerCase();
  const act = v.actions.find((a) => (a.owner_id ?? "").toLowerCase() === id || (a.owner ?? "").trim().toLowerCase() === id);
  if (act?.owner) return act.owner;
  const w = v.workload.find((x) => x.owner_id.toLowerCase() === id);
  return w?.owner_label ?? ownerId;
}

const overloaded = (v: JobView): OwnerWorkload | null =>
  v.workload.find((w) => w.status === "OVER_CAPACITY" || (w.capacity_margin !== null && w.capacity_margin < 0)) ?? null;

const has = (v: JobView, re: RegExp) => v.issues.some((i) => i.severity !== "NOTICE" && re.test(i.code));
const firstQuestion = (v: JobView) => v.clarification_questions[0] ?? null;

export function readinessDecision(v: JobView): DecisionPart {
  switch (v.operational_readiness) {
    case "BLOCKED": {
      const w = overloaded(v);
      let summary = "A confirmed commitment conflict blocks this plan.";
      if (w && w.existing_open_hours !== null && w.new_proposed_hours !== null && w.available_hours !== null) {
        const load = w.projected_load ?? w.existing_open_hours + w.new_proposed_hours;
        const over = load - w.available_hours;
        summary =
          `${ownerName(v, w.owner_id)} has ${h(w.existing_open_hours)} of existing confirmed work and ${h(w.new_proposed_hours)} of new proposed work ` +
          `against ${h(w.available_hours)} of recorded capacity. The plan exceeds capacity by ${h(over)}.`;
      } else if (w) {
        summary = `${ownerName(v, w.owner_id)}'s confirmed work already exceeds recorded capacity, even before every estimate is known.`;
      } else if (has(v, /CONFLICT/)) {
        summary = "Two stored records for the same commitment disagree, so the plan cannot be confirmed.";
      }
      return {
        kind: "BLOCKED",
        tone: "blocked",
        title: "Action required",
        summary,
        question: "Which commitment, estimate, deadline or capacity record should change?",
      };
    }
    case "UNKNOWN": {
      const retrievedExisting = v.workload.some((w) => w.existing_open_hours !== null);
      if (has(v, /CAPACITY|STALE/))
        return {
          kind: "UNKNOWN",
          tone: "unknown",
          title: "Capacity could not be verified",
          summary:
            (retrievedExisting ? "Existing commitments were retrieved, but no valid matching capacity record was available. " : "No valid matching capacity record was available. ") +
            "ActionReady will not assume availability.",
          question: firstQuestion(v) ?? "Can the owner's capacity for this planning period be recorded or confirmed?",
        };
      if (has(v, /TOOL_/))
        return {
          kind: "UNKNOWN",
          tone: "unknown",
          title: "Tool evidence is incomplete",
          summary: "Not every required business-record lookup was observed in this run, so readiness cannot be confirmed.",
          question: firstQuestion(v),
        };
      if (has(v, /PERIOD/))
        return {
          kind: "UNKNOWN",
          tone: "unknown",
          title: "Planning period could not be matched",
          summary: "The records could not be matched to an explicit planning period, so workload was not assessed.",
          question: firstQuestion(v) ?? "Which planning period (start and end date) does this plan cover?",
        };
      if (has(v, /OWNER/))
        return {
          kind: "UNKNOWN",
          tone: "unknown",
          title: "An owner could not be resolved",
          summary: "At least one action's owner is not in the trusted roster or is ambiguous, so their records were not checked.",
          question: firstQuestion(v),
        };
      if (has(v, /READ_FAILED|RETRIEVAL_FAILED|READ_LIMIT|TRUNCATED/))
        return {
          kind: "UNKNOWN",
          tone: "unknown",
          title: "Business records could not be read completely",
          summary: "A record lookup failed or was incomplete. A failed read is not treated as zero work.",
          question: firstQuestion(v),
        };
      return {
        kind: "UNKNOWN",
        tone: "unknown",
        title: "Readiness could not be confirmed",
        summary: "Required evidence is missing, stale or ambiguous. This is not a pass.",
        question: firstQuestion(v),
      };
    }
    case "READY":
      return {
        kind: "READY",
        tone: "ready",
        title: "Plan is operationally ready",
        summary: "The required evidence was retrieved and projected work fits the recorded capacity. Human approval is still a separate step.",
        question: null,
      };
    default:
      return {
        kind: "NOT_CHECKED",
        tone: "neutral",
        title: "Readiness was not checked",
        summary: "Commitment and capacity checks did not run for this result, so it carries no readiness conclusion.",
        question: null,
      };
  }
}

export function deriveDecision(v: JobView): Decision {
  if (v.execution_status === "FAILED")
    return {
      primary: {
        kind: "FAILED",
        tone: "blocked",
        title: "The analysis did not complete",
        summary: (v.error?.message ?? "The workflow recorded a failure.") + " Nothing was approved or sent.",
        question: null,
      },
      secondary: null,
    };
  if (v.stale)
    return {
      primary: {
        kind: "STALE",
        tone: "unknown",
        title: "Status unknown",
        summary: "No update has been recorded for a long time. This is not reported as success or failure.",
        question: "Check the n8n execution log before deciding whether to resubmit.",
      },
      secondary: null,
    };

  const readiness = readinessDecision(v);
  if (v.review.state === "TECHNICAL_STOP")
    return {
      primary: {
        kind: "TECHNICAL",
        tone: "blocked",
        title: "AI review requires technical attention",
        summary:
          "The workflow completed, but the reviewer result could not be validated. Nothing has been approved or sent. " +
          "The actions and draft below are from a version the review gate did not accept.",
        question: "Review the evidence and resubmit, or correct the notes or records first.",
      },
      secondary: readiness,
    };
  if (v.review.state === "REVISION_LIMIT")
    return {
      primary: {
        kind: "REVISION_LIMIT",
        tone: "blocked",
        title: "Revision limit reached",
        summary: "The draft was revised the maximum number of times without passing review. A person must review it; nothing was approved or sent.",
        question: null,
      },
      secondary: readiness,
    };
  if (v.review.state === "NEEDS_CLARIFICATION")
    return {
      primary: {
        kind: "CLARIFY",
        tone: "unknown",
        title: "Clarification needed",
        summary: "The meeting notes lack or contradict a fact the draft needs. ActionReady will not invent it.",
        question: firstQuestion(v),
      },
      secondary: readiness,
    };
  return { primary: readiness, secondary: null };
}
