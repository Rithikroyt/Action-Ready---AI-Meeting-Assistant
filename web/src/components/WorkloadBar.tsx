import type { OwnerWorkload } from "@/lib/contract";
import { fmtHours } from "@/lib/present";
import { ReadinessBadge } from "./Badges";

// Existing confirmed work (graphite) + new proposed work (indigo) against a capacity marker.
// Anything past capacity is hatched red. Unknown values are shown as unknown, never as zero.
export function WorkloadBar({ w }: { w: OwnerWorkload }) {
  const existing = w.existing_open_hours;
  const added = w.new_proposed_hours;
  const cap = w.available_hours;
  const knownLoad = (existing ?? 0) + (added ?? 0);
  const scaleMax = Math.max(cap ?? 0, knownLoad, 1) * 1.12;
  const pct = (h: number) => `${Math.min(100, (h / scaleMax) * 100)}%`;

  const exW = existing ?? 0;
  const newW = added ?? 0;
  const overStart = cap !== null && knownLoad > cap ? cap : null;

  const summary =
    `${w.owner_label ?? w.owner_id}: existing ${fmtHours(existing)}, new ${fmtHours(added)}, ` +
    `projected ${fmtHours(w.projected_load)}, capacity ${fmtHours(cap)}` +
    (w.capacity_margin !== null ? `, margin ${fmtHours(w.capacity_margin)}` : ", margin unknown");

  const status = w.status === "OVER_CAPACITY" ? "BLOCKED" : w.status === "WITHIN" ? "READY" : "UNKNOWN";

  return (
    <div className="wl">
      <div className="wl-head">
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 14 }}>{w.owner_label ?? w.owner_id}</h3>
          <span className="mono muted">{w.owner_id}</span>
        </div>
        <ReadinessBadge value={status} />
      </div>

      <div className="wl-track" role="img" aria-label={summary} style={{ marginTop: 18 }}>
        {exW > 0 && <div className="wl-seg existing" style={{ left: 0, width: pct(Math.min(exW, overStart ?? exW)) }} />}
        {newW > 0 && (
          <div
            className={`wl-seg new ${exW > 0 ? "" : "only"}`}
            style={{ left: pct(exW), width: pct(Math.max(0, Math.min(knownLoad, overStart ?? knownLoad) - exW)) }}
          />
        )}
        {overStart !== null && <div className="wl-seg over" style={{ left: pct(overStart), width: pct(knownLoad - overStart) }} />}
        {cap !== null ? (
          <div className="wl-cap" style={{ left: `calc(${pct(cap)} - 1px)` }}>
            <span>Capacity {fmtHours(cap)}</span>
          </div>
        ) : (
          <div className="wl-cap" style={{ left: "calc(100% - 2px)", background: "var(--unknown)", opacity: 0.7 }}>
            <span style={{ color: "var(--unknown)", transform: "translateX(-100%)" }}>Capacity unknown</span>
          </div>
        )}
      </div>
      <div className="wl-scale" aria-hidden>
        <span>0 h</span>
        <span>{fmtHours(Math.round(scaleMax))}</span>
      </div>

      <div className="legend">
        <span>
          <span className="swatch" style={{ background: "var(--graphite)" }} />
          Existing confirmed open work
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--accent)" }} />
          New proposed work
        </span>
        {overStart !== null && (
          <span>
            <span className="swatch" style={{ background: "var(--blocked)" }} />
            Over capacity
          </span>
        )}
      </div>

      <div className="calc" aria-label="Calculation">
        <span className="muted">Existing remaining work</span>
        <span>{fmtHours(existing)}</span>
        <span className="muted">New proposed work</span>
        <span>+{fmtHours(added)}</span>
        <span className="total">Projected load</span>
        <span className="total">{fmtHours(w.projected_load)}</span>
        <span className="muted">Recorded capacity</span>
        <span>{fmtHours(cap)}</span>
        <span className="total">{w.capacity_margin !== null && w.capacity_margin < 0 ? "Shortfall" : "Margin"}</span>
        <span className={`total ${w.capacity_margin === null ? "" : w.capacity_margin < 0 ? "neg" : "pos"}`}>
          {w.capacity_margin === null ? "Not assessable" : fmtHours(Math.abs(w.capacity_margin))}
        </span>
      </div>
      {(w.existing_commitment_ids.length > 0 || w.capacity_id) && (
        <p className="small muted">
          From {w.existing_commitment_ids.map((id) => <code key={id} style={{ marginRight: 6 }}>{id}</code>)}
          {w.capacity_id && <code>{w.capacity_id}</code>}
        </p>
      )}
      <p className="hint">Capacity means project-allocated usable hours before register commitments. It is not proof of calendar availability.</p>
    </div>
  );
}
