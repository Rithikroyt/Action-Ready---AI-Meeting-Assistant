import type { OwnerWorkload } from "@/lib/contract";
import { fmtHours } from "@/lib/present";
import { ReadinessBadge } from "./Badges";

const h = (n: number) => fmtHours(n);
/** Unknown business numbers are labelled, never rendered as 0. */
const val = (n: number | null, unknown: string) => (n === null ? <span className="unknown-val">{unknown}</span> : h(n));

/** One-line formulas, only when every term is known. */
export function workloadFormulas(w: OwnerWorkload): string[] {
  const out: string[] = [];
  if (w.existing_open_hours !== null && w.new_proposed_hours !== null && w.projected_load !== null)
    out.push(`${h(w.existing_open_hours)} existing + ${h(w.new_proposed_hours)} new = ${h(w.projected_load)} projected`);
  if (w.available_hours !== null && w.projected_load !== null && w.capacity_margin !== null)
    out.push(`${h(w.available_hours)} capacity − ${h(w.projected_load)} projected = ${w.capacity_margin < 0 ? "−" + h(-w.capacity_margin) : h(w.capacity_margin)} margin`);
  return out;
}

// Existing confirmed work (graphite) + new proposed work (indigo) against a capacity marker; overflow hatched red.
/** `compact` hides record IDs, formulas and the capacity footnote (used side by side in the what-if view). */
export function WorkloadBar({ w, compact = false, name }: { w: OwnerWorkload; compact?: boolean; name?: string }) {
  const existing = w.existing_open_hours;
  const added = w.new_proposed_hours;
  const cap = w.available_hours;
  const display = name ?? w.owner_label ?? w.owner_id;
  const knownLoad = (existing ?? 0) + (added ?? 0);
  const scaleMax = Math.max(cap ?? 0, knownLoad, 1) * 1.12;
  const pct = (x: number) => `${Math.min(100, (x / scaleMax) * 100)}%`;

  const exW = existing ?? 0;
  const newW = added ?? 0;
  const overStart = cap !== null && knownLoad > cap ? cap : null;

  const summary =
    `${display}: existing work ${existing === null ? "not available" : h(existing)}, new proposed work ${added === null ? "not specified" : h(added)}, ` +
    `projected load ${w.projected_load === null ? "not available" : h(w.projected_load)}, recorded capacity ${cap === null ? "not verified" : h(cap)}, ` +
    (w.capacity_margin !== null ? `margin ${w.capacity_margin < 0 ? "minus " + h(-w.capacity_margin) : h(w.capacity_margin)}` : "margin not available");

  const status = w.status === "OVER_CAPACITY" ? "BLOCKED" : w.status === "WITHIN" ? "READY" : "UNKNOWN";
  const marginLabel = w.capacity_margin !== null && w.capacity_margin < 0 ? "Shortfall" : "Margin";

  return (
    <div className="wl">
      <div className="wl-head">
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 14 }}>{display}</h3>
          {display !== w.owner_id ? <code className="muted">{w.owner_id}</code> : null}
        </div>
        <ReadinessBadge value={status} />
      </div>

      <div className="wl-track" role="img" aria-label={summary} style={{ marginTop: 18 }}>
        {exW > 0 && <div className="wl-seg existing" style={{ left: 0, width: pct(Math.min(exW, overStart ?? exW)) }} />}
        {newW > 0 && (
          <div className={`wl-seg new ${exW > 0 ? "" : "only"}`} style={{ left: pct(exW), width: pct(Math.max(0, Math.min(knownLoad, overStart ?? knownLoad) - exW)) }} />
        )}
        {overStart !== null && <div className="wl-seg over" style={{ left: pct(overStart), width: pct(knownLoad - overStart) }} />}
        {cap !== null ? (
          <div className="wl-cap" style={{ left: `calc(${pct(cap)} - 1px)` }}>
            <span>Capacity {h(cap)}</span>
          </div>
        ) : (
          <div className="wl-cap unknown" style={{ left: "calc(100% - 2px)" }}>
            <span>Capacity not verified</span>
          </div>
        )}
      </div>
      <div className="wl-scale" aria-hidden>
        <span>0 h</span>
        <span>{h(Math.round(scaleMax))}</span>
      </div>

      <div className="legend" aria-hidden>
        <span>
          <span className="swatch" style={{ background: "var(--graphite)" }} />
          Existing confirmed work
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--accent)" }} />
          New proposed work
        </span>
        {overStart !== null && (
          <span>
            <span className="swatch hatch" />
            Over capacity
          </span>
        )}
      </div>

      <dl className="calc" aria-label={`Workload calculation for ${display}`}>
        <dt>Existing work</dt>
        <dd>{val(existing, "Not available")}</dd>
        <dt>New proposed work</dt>
        <dd>{added === null ? <span className="unknown-val">Not specified</span> : "+" + h(added)}</dd>
        <dt className="total">Projected load</dt>
        <dd className="total">{val(w.projected_load, "Not available")}</dd>
        <dt>Recorded project capacity</dt>
        <dd>{val(cap, "Not verified")}</dd>
        <dt className="total">{marginLabel}</dt>
        <dd className={`total ${w.capacity_margin === null ? "" : w.capacity_margin < 0 ? "neg" : "pos"}`}>
          {w.capacity_margin === null ? <span className="unknown-val">Not available</span> : w.capacity_margin < 0 ? "−" + h(-w.capacity_margin) : h(w.capacity_margin)}
        </dd>
      </dl>
      {!compact && workloadFormulas(w).length > 0 && (
        <ul className="formulas" aria-label="Formulas">
          {workloadFormulas(w).map((f) => (
            <li key={f} className="mono">
              {f}
            </li>
          ))}
        </ul>
      )}
      {!compact && (w.existing_commitment_ids.length > 0 || w.capacity_id) && (
        <p className="small muted">
          From {w.existing_commitment_ids.map((id) => <code key={id} style={{ marginRight: 6 }}>{id}</code>)}
          {w.capacity_id && <code>{w.capacity_id}</code>}
        </p>
      )}
      {!compact && <p className="hint">Recorded project capacity is the project-allocated usable hours before register commitments. It is not total personal availability.</p>}
    </div>
  );
}
