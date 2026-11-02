// Pre-submit notes check: local, deterministic heuristics only. Not AI verification.
// It looks for surface patterns (verbs, names, dates, hours); it does not understand the meeting.
// Errors stop an unsafe submission; warnings never block. No network access.

export type PreflightLevel = "OK" | "WARNING" | "ERROR";

export interface PreflightItem {
  id: "notes" | "length" | "period" | "actions" | "owner" | "deadline" | "effort";
  level: PreflightLevel;
  label: string;
  /** Which form field an ERROR belongs to, for inline messages. */
  field?: "notes" | "period_start" | "period_end";
}

export interface PreflightResult {
  items: PreflightItem[];
  errors: PreflightItem[];
  warnings: PreflightItem[];
  /** False only when an ERROR exists. Warnings alone never block. */
  canSubmit: boolean;
  actionCount: number;
}

export const MIN_CHARS = 20;
export const MIN_WORDS = 4;
export const MAX_CHARS = 12000;
const MAX_PERIOD_DAYS = 31;

const ACTION_RE =
  /\b(will|shall|is going to|are going to|agreed to|to own|owns|owner|assigned|responsible|takes?|needs? to|must|action( item)?s?)\b|^\s*(?:[-*•]|\d+[.)]|todo:?|action:)/i;
// A capitalized name directly before a commitment verb, or an explicit owner/assignee marker.
const OWNER_RE =
  /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+(?:will|shall|is going to|agreed to|owns|takes|to own|needs to|must)\b|\b(?:owner|assignee|assigned to|responsible)\s*[:\-–]?\s*[A-Z][a-z]+|@[A-Za-z][\w.-]+/;
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS = "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const DEADLINE_RE = new RegExp(
  [
    `\\b(?:by|before|due|until|no later than|deadline)\\b`,
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b`,
    `\\b(?:${MONTHS})\\.?\\s+\\d{1,2}\\b`,
    `\\b(?:${WEEKDAYS})\\b`,
    `\\b\\d{4}-\\d{2}-\\d{2}\\b`,
    `\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b`,
    `\\b(?:today|tomorrow|tonight|next week|this week|end of (?:day|week|month)|eod|eow|eom)\\b`,
  ].join("|"),
  "i",
);
const EFFORT_RE = /\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)\b|\b(?:an|one|two|three|four|five|six|seven|eight|half an?) hours?\b/i;

/** Split into candidate sentences: lines, bullets and sentence ends. */
function sentences(notes: string): string[] {
  return notes
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z@•\-*])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function periodError(start: string, end: string): { field: "period_start" | "period_end"; label: string } | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!start) return { field: "period_start", label: "Planning period start is missing" };
  if (!end) return { field: "period_end", label: "Planning period end is missing" };
  const real = (d: string) => iso.test(d) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
  if (!real(start)) return { field: "period_start", label: "Planning period start is not a real date" };
  if (!real(end)) return { field: "period_end", label: "Planning period end is not a real date" };
  const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000;
  if (days < 0) return { field: "period_end", label: "Planning period ends before it starts" };
  if (days > MAX_PERIOD_DAYS) return { field: "period_end", label: `Planning period is longer than ${MAX_PERIOD_DAYS} days` };
  return null;
}

export function preflightNotes(input: { notes: string; period_start: string; period_end: string }): PreflightResult {
  const items: PreflightItem[] = [];
  const notes = input.notes.replace(/\r\n/g, "\n").trim();
  const words = notes ? notes.split(/\s+/).length : 0;

  // ---- errors: cannot be submitted safely ----
  if (!notes) items.push({ id: "notes", level: "ERROR", label: "No notes provided", field: "notes" });
  else items.push({ id: "notes", level: "OK", label: "Notes provided" });

  if (notes && (notes.length < MIN_CHARS || words < MIN_WORDS))
    items.push({ id: "length", level: "ERROR", label: "Notes are too short to be meeting notes", field: "notes" });
  else if (notes.length > MAX_CHARS)
    items.push({ id: "length", level: "ERROR", label: `Notes exceed ${MAX_CHARS.toLocaleString("en-US")} characters (nothing is truncated)`, field: "notes" });

  const pErr = periodError(input.period_start, input.period_end);
  if (pErr) items.push({ id: "period", level: "ERROR", label: pErr.label, field: pErr.field });
  else items.push({ id: "period", level: "OK", label: "Planning period provided" });

  // ---- warnings: heuristics about completeness ----
  let actionCount = 0;
  if (notes) {
    const actions = sentences(notes).filter((s) => ACTION_RE.test(s));
    actionCount = actions.length;
    if (!actions.length) {
      items.push({ id: "actions", level: "WARNING", label: "No obvious action or commitment sentence found" });
    } else {
      items.push({ id: "actions", level: "OK", label: `${actions.length} possible action${actions.length > 1 ? "s" : ""} detected` });
      const plural = (n: number, one: string) => (n === 1 ? `One action may be missing ${one}` : `${n} actions may be missing ${one}`);

      const noOwner = actions.filter((s) => !OWNER_RE.test(s)).length;
      if (noOwner === actions.length) items.push({ id: "owner", level: "WARNING", label: "No likely owner found near an action" });
      else if (noOwner) items.push({ id: "owner", level: "WARNING", label: plural(noOwner, "an owner") });
      else items.push({ id: "owner", level: "OK", label: "Possible owner detected" });

      const noDeadline = actions.filter((s) => !DEADLINE_RE.test(s)).length;
      if (!DEADLINE_RE.test(notes)) items.push({ id: "deadline", level: "WARNING", label: "No obvious deadline or date found" });
      else if (noDeadline) items.push({ id: "deadline", level: "WARNING", label: plural(noDeadline, "a deadline") });
      else items.push({ id: "deadline", level: "OK", label: "Possible deadline detected" });

      const noEffort = actions.filter((s) => !EFFORT_RE.test(s)).length;
      if (!EFFORT_RE.test(notes)) items.push({ id: "effort", level: "WARNING", label: "No obvious effort estimate found (e.g. “4 hours”)" });
      else if (noEffort) items.push({ id: "effort", level: "WARNING", label: plural(noEffort, "an effort estimate") });
      else items.push({ id: "effort", level: "OK", label: "Possible effort estimate detected" });
    }
  }

  const errors = items.filter((i) => i.level === "ERROR");
  const warnings = items.filter((i) => i.level === "WARNING");
  return { items, errors, warnings, canSubmit: errors.length === 0, actionCount };
}
