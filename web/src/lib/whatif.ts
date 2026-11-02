// What-if simulation: a local, non-mutating, hypothetical recalculation of one owner's hours.
// It never changes the official result, never persists, and makes no network request.
import type { OwnerWorkload, Readiness } from "./contract";
import { compareLoad } from "./readiness";

export interface WhatIfInputs {
  existing_hours: number;
  new_hours: number;
  capacity_hours: number;
}

export interface WhatIfResult {
  readiness: Exclude<Readiness, "NOT_CHECKED">;
  projected_hours: number | null;
  margin_hours: number | null;
  /** Why inputs were rejected (readiness UNKNOWN). */
  invalid: string | null;
  /** A detached workload object for the bar. It is a copy, never the official object. */
  workload: OwnerWorkload | null;
}

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000;

/** The official numbers a simulation starts from (and Reset returns to), or null if not simulatable. */
export function officialInputs(w: OwnerWorkload): WhatIfInputs | null {
  if (!valid(w.existing_open_hours) || !valid(w.new_proposed_hours) || !valid(w.available_hours)) return null;
  return { existing_hours: w.existing_open_hours, new_hours: w.new_proposed_hours, capacity_hours: w.available_hours };
}

export function simulate(official: OwnerWorkload, inputs: Partial<WhatIfInputs>): WhatIfResult {
  const { existing_hours, new_hours, capacity_hours } = inputs;
  const bad = [
    ["Existing work", existing_hours],
    ["New work", new_hours],
    ["Capacity", capacity_hours],
  ].find(([, v]) => !valid(v));
  if (bad) {
    const v = bad[1];
    const why = v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? "is missing" : typeof v === "number" && v < 0 ? "cannot be negative" : "is not a valid number of hours";
    return { readiness: "UNKNOWN", projected_hours: null, margin_hours: null, invalid: `${bad[0]} ${why}.`, workload: null };
  }
  const e = existing_hours as number;
  const n = new_hours as number;
  const c = capacity_hours as number;
  const cmp = compareLoad(e, n, c);
  return {
    readiness: cmp.over ? "BLOCKED" : "READY",
    projected_hours: cmp.projected,
    margin_hours: cmp.margin,
    invalid: null,
    workload: {
      ...official,
      existing_commitment_ids: [...official.existing_commitment_ids],
      new_action_ids: [...official.new_action_ids],
      existing_open_hours: e,
      new_proposed_hours: n,
      available_hours: c,
      projected_load: cmp.projected,
      capacity_margin: cmp.margin,
      status: cmp.over ? "OVER_CAPACITY" : "WITHIN",
    },
  };
}

/** Suggested scenarios: the smallest single change that would remove an overload. */
export function suggestions(i: WhatIfInputs): { label: string; inputs: WhatIfInputs }[] {
  const { margin } = compareLoad(i.existing_hours, i.new_hours, i.capacity_hours);
  if (margin >= 0) return [];
  const out: { label: string; inputs: WhatIfInputs }[] = [];
  const fitNew = Math.round((i.capacity_hours - i.existing_hours) * 100) / 100;
  if (fitNew >= 0) out.push({ label: `New effort ${fitNew} h`, inputs: { ...i, new_hours: fitNew } });
  const fitCap = Math.round((i.existing_hours + i.new_hours) * 100) / 100;
  out.push({ label: `Capacity ${fitCap} h`, inputs: { ...i, capacity_hours: fitCap } });
  return out;
}
