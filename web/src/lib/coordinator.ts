// Week 4 Coordinator — deterministic routing of an official result to the next responsible role.
// Pure function over the official JobView: it never calls a model, invents a confidence score, changes a status,
// or performs an action. It is the reference implementation (and executable spec) for the n8n Coordinator node.
import type { Issue, JobView, OwnerWorkload } from "./contract";
import type { Tone } from "./status";
import { ownerName } from "./decision";

export type RouteId =
  | "PROCESSING"
  | "TECHNICAL_REVIEW"
  | "CLARIFICATION"
  | "MANAGER_REVIEW"
  | "DATA_REVIEW"
  | "APPROVAL"
  | "DISPATCH"
  | "REVISION"
  | "COMPLETE"
  | "DEMO_PREVIEW";

export type Role = "System" | "Requester" | "Technical reviewer" | "Manager" | "Data steward" | "Approver" | "Dispatcher" | "Organizer";

export interface RouteDef {
  id: RouteId;
  role: Role;
  /** Queue label, e.g. "Manager review". */
  label: string;
  tone: Tone;
  /** What the responsible role must do. */
  next: string;
}

export const ROUTES: Record<RouteId, RouteDef> = {
  PROCESSING: { id: "PROCESSING", role: "System", label: "Processing", tone: "accent", next: "Wait for the workflow to record the official result. Nobody needs to act yet." },
  TECHNICAL_REVIEW: {
    id: "TECHNICAL_REVIEW",
    role: "Technical reviewer",
    label: "Technical review",
    tone: "blocked",
    next: "Inspect the workflow run and its evidence before anyone relies on this case. Nothing is published while it is held here.",
  },
  CLARIFICATION: {
    id: "CLARIFICATION",
    role: "Requester",
    label: "Needs clarification",
    tone: "unknown",
    next: "Answer the recorded questions and resubmit complete notes. Missing facts are never guessed.",
  },
  MANAGER_REVIEW: {
    id: "MANAGER_REVIEW",
    role: "Manager",
    label: "Manager review",
    tone: "blocked",
    next: "Decide which task, estimate, deadline or capacity record should change. Rewriting the email does not resolve a capacity conflict.",
  },
  DATA_REVIEW: {
    id: "DATA_REVIEW",
    role: "Data steward",
    label: "Data review",
    tone: "unknown",
    next: "Record or correct the missing or untrusted business record, then re-check readiness. Missing capacity is not zero.",
  },
  APPROVAL: {
    id: "APPROVAL",
    role: "Approver",
    label: "Ready for approval",
    tone: "ready",
    next: "Review the exact tasks, message and recipients for this version, then approve or request changes.",
  },
  DISPATCH: {
    id: "DISPATCH",
    role: "Dispatcher",
    label: "Approved — awaiting dispatch",
    tone: "accent",
    next: "Publish the approved tasks and send the approved message for this exact version. Dispatch is switched off in this phase.",
  },
  REVISION: { id: "REVISION", role: "Requester", label: "Changes requested", tone: "unknown", next: "Revise the plan as requested and submit a new version for review." },
  COMPLETE: { id: "COMPLETE", role: "Organizer", label: "Complete", tone: "neutral", next: "Nothing further is pending for this version." },
  DEMO_PREVIEW: {
    id: "DEMO_PREVIEW",
    role: "System",
    label: "Synthetic preview",
    tone: "neutral",
    next: "Synthetic demo: no AI review ran, so nothing can be approved. In live mode a passing review would route a READY plan to the Approver.",
  },
};

/** Recorded reason codes grouped by the role that can resolve them. Unrecognised codes go to technical review. */
const MANAGER_RE = /^(CAPACITY_OVERLOAD|OVER_CAPACITY|REGISTER_CONFLICT)$/;
const CLARIFY_RE =
  /^(PROJECT_NOT_CONFIRMED|PERIOD_[A-Z_]+|OWNER_[A-Z_]+|NO_PROPOSED_ACTIONS|NO_ACTIONS|NO_RESOLVED_OWNERS|PROPOSED_ESTIMATE_MISSING|ESTIMATE_MISSING|CHANGED_DEADLINE|DEADLINE_CHANGE|POSSIBLE_DUPLICATE_OF_COMMITMENT|POSSIBLE_DUPLICATE)$/;
const DATA_RE =
  /^(CAPACITY_[A-Z_]+|COMMITMENT_[A-Z_]+|DUPLICATE_COMMITMENT_ID|POSSIBLE_DUPLICATE_COMMITMENT|REMAINING_MISSING|STALE_RECORD|READ_FAILED|READ_LIMIT_REACHED|RETRIEVAL_FAILED|TRUNCATED_READ|SCOPE_VIOLATION|SCOPE_MISMATCH)$/;
const TECH_RE = /^(TOOL_[A-Z_]+|STALE_CONTEXT_VERSION|CONTEXT_CHANGED|READINESS_CHECK_ERROR|WEEK3_STAGE_NOT_RUN)$/;

export type ReasonGroup = "manager" | "clarification" | "data" | "technical";
/** A BLOCKING issue is always a confirmed conflict for a manager, whatever its code looks like. */
export function reasonGroup(code: string, severity?: Issue["severity"]): ReasonGroup {
  if (severity === "BLOCKING" || MANAGER_RE.test(code)) return "manager";
  if (CLARIFY_RE.test(code)) return "clarification";
  if (DATA_RE.test(code)) return "data";
  if (TECH_RE.test(code)) return "technical";
  return "technical"; // unrecognised: never silently treated as resolved or as a data gap
}

export interface Evidence {
  label: string;
  value: string;
}

export interface Routing {
  route: RouteDef;
  /** Plain-language reasons, each tied to a recorded fact. */
  why: string[];
  /** Recorded facts the route is based on. */
  evidence: Evidence[];
  /** Other open items that also need attention (never hidden behind the primary route). */
  also: { route: RouteDef; reason: string }[];
  /** States what has NOT happened, so a route is never mistaken for an action. */
  not_done: string;
  /** Recorded reason codes that drove the routing. */
  codes: string[];
}

const h = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
const open = (v: JobView): Issue[] => v.issues.filter((i) => i.severity !== "NOTICE");

function workloadEvidence(v: JobView): Evidence[] {
  const out: Evidence[] = [];
  for (const w of v.workload as OwnerWorkload[]) {
    const who = ownerName(v, w.owner_id);
    const val = (n: number | null, missing: string) => (n === null ? missing : h(n));
    out.push({ label: `${who} · existing work (commitment register)`, value: val(w.existing_open_hours, "Not available") });
    out.push({ label: `${who} · new proposed work (this meeting)`, value: w.new_proposed_hours === null ? "Not specified" : h(w.new_proposed_hours) });
    out.push({ label: `${who} · projected load`, value: val(w.projected_load, "Not available") });
    out.push({ label: `${who} · recorded capacity`, value: val(w.available_hours, "Not verified") });
    out.push({
      label: `${who} · margin`,
      value: w.capacity_margin === null ? "Not available" : w.capacity_margin < 0 ? `−${h(-w.capacity_margin)}` : h(w.capacity_margin),
    });
  }
  return out;
}

function overloadReason(v: JobView): string | null {
  const w = v.workload.find((x) => x.capacity_margin !== null && x.capacity_margin < 0);
  if (!w || w.projected_load === null || w.available_hours === null) return null;
  return `${ownerName(v, w.owner_id)}'s projected workload is ${h(w.projected_load)} against ${h(w.available_hours)} of recorded capacity — a shortfall of ${h(-w.capacity_margin!)}.`;
}

/** Route an official result to the next responsible role. */
export function coordinate(v: JobView): Routing {
  const issues = open(v);
  const codes = [...new Set(issues.map((i) => i.code))];
  const byGroup = (g: ReasonGroup) => issues.filter((i) => reasonGroup(i.code, i.severity) === g);
  const clar = byGroup("clarification");
  const data = byGroup("data");
  const tech = byGroup("technical");
  const evidence: Evidence[] = [
    { label: "AI review", value: v.review.state === "PASSED" && v.review.score !== null ? `Pass · ${v.review.score.toFixed(1)}/5` : v.review.state.replace(/_/g, " ").toLowerCase() },
    { label: "Operational readiness", value: v.operational_readiness.replace("_", " ").toLowerCase() },
    { label: "Human approval", value: v.approval_status.replace(/_/g, " ").toLowerCase() },
    ...workloadEvidence(v),
  ];
  const notDone =
    v.approval_status === "APPROVED"
      ? "The plan is approved, but no task has been published and no email has been sent: dispatch is switched off in this phase."
      : "No task assignment has been published and no email has been sent.";
  // Every other open item, so the primary route never hides a second problem.
  const others = (primary: RouteId): Routing["also"] => {
    const all: Routing["also"] = [];
    if (clar.length) all.push({ route: ROUTES.CLARIFICATION, reason: clar[0]!.message });
    if (v.operational_readiness === "BLOCKED") all.push({ route: ROUTES.MANAGER_REVIEW, reason: overloadReason(v) ?? "A confirmed commitment conflict blocks this plan." });
    if (data.length) all.push({ route: ROUTES.DATA_REVIEW, reason: data[0]!.message });
    if (tech.length) all.push({ route: ROUTES.TECHNICAL_REVIEW, reason: tech[0]!.message });
    return all.filter((a) => a.route.id !== primary);
  };
  const make = (id: RouteId, why: string[]): Routing => ({ route: ROUTES[id], why, evidence, also: others(id), not_done: notDone, codes });

  // 1. Not final yet.
  if (v.stale) return make("TECHNICAL_REVIEW", ["No update has been recorded for too long. The run may have stopped; this is not reported as success or failure."]);
  if (v.execution_status === "ACCEPTED" || v.execution_status === "RUNNING") return make("PROCESSING", ["The workflow has not recorded a final result yet."]);
  if (v.execution_status === "FAILED") return make("TECHNICAL_REVIEW", ["The workflow recorded a failed run. No result was saved as successful."]);

  // 2. The AI output itself could not be validated: hold it before anyone acts on its facts.
  if (v.review.state === "TECHNICAL_STOP" || v.review.state === "REVISION_LIMIT") {
    const why = [
      v.review.state === "TECHNICAL_STOP"
        ? "The reviewer result could not be validated, so this version's actions and draft are unvalidated."
        : "The draft reached the revision limit without passing review.",
    ];
    return make("TECHNICAL_REVIEW", why);
  }

  // 3. Missing or contradictory meeting facts go back to the person who supplied the notes.
  if (v.review.state === "NEEDS_CLARIFICATION" || clar.length) {
    const why = [
      ...(v.review.state === "NEEDS_CLARIFICATION" ? ["The reviewer found facts the plan needs that the notes lack or contradict."] : []),
      ...clar.map((i) => i.message),
      ...v.clarification_questions.slice(0, 3).map((q) => `Question recorded: ${q}`),
    ];
    return make("CLARIFICATION", why.length ? why : ["The notes need clarification."]);
  }

  // 4. Readiness, decided independently of the review.
  if (v.operational_readiness === "BLOCKED") {
    const why = [overloadReason(v) ?? "A confirmed commitment conflict blocks this plan.", "Approval is closed until a manager decides what changes."];
    return make("MANAGER_REVIEW", why);
  }
  if (v.operational_readiness === "NOT_CHECKED") return make("TECHNICAL_REVIEW", ["The commitment and capacity checks did not run for this result, so feasibility is unknown."]);
  if (v.operational_readiness === "UNKNOWN") {
    if (tech.length) return make("TECHNICAL_REVIEW", ["The evidence behind the readiness check is incomplete or untrusted.", ...tech.map((i) => i.message)]);
    if (data.length) return make("DATA_REVIEW", ["A business record the readiness check needs is missing, stale or ambiguous.", ...data.map((i) => i.message)]);
    return make("TECHNICAL_REVIEW", ["Readiness is unknown but no recognised reason was recorded."]);
  }

  // 5. READY: the approval path, which requires a passing AI review for this exact version.
  if (v.review.state !== "PASSED") {
    if (v.mode === "DEMO" && v.review.state === "NOT_RUN") return make("DEMO_PREVIEW", ["The readiness rules found the plan feasible, but no AI review ran in the synthetic demo."]);
    return make("PROCESSING", ["The plan is feasible, but the AI review has not finished."]);
  }
  switch (v.approval_status) {
    case "APPROVED":
      return make("DISPATCH", ["A person approved this exact version."]);
    case "CHANGES_REQUESTED":
    case "REJECTED":
      return make("REVISION", [`The approver ${v.approval_status === "REJECTED" ? "rejected" : "requested changes to"} this version.`]);
    case "DRAFT_CREATED":
      return make("COMPLETE", ["The approved message was prepared."]);
    default:
      return make("APPROVAL", [
        "The AI review passed for this version.",
        "Recorded workload is within capacity and the records are current.",
        v.approval_status === "PENDING" ? "An approval request is already waiting." : "No person has approved it yet.",
      ]);
  }
}

/** Routes that need a person to act, in queue order. */
export const ATTENTION_ORDER: RouteId[] = ["APPROVAL", "MANAGER_REVIEW", "DATA_REVIEW", "CLARIFICATION", "TECHNICAL_REVIEW", "REVISION", "DISPATCH"];
export const needsAttention = (id: RouteId) => ATTENTION_ORDER.includes(id);
