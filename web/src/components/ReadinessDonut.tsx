// Readiness mix of the cases listed on this page, as an animated donut. Counts only; no score is implied.
const SEGMENTS = [
  { key: "ready", label: "Ready", color: "var(--lime)" },
  { key: "blocked", label: "Blocked", color: "var(--crimson)" },
  { key: "unknown", label: "Unknown", color: "#f5a623" },
  { key: "other", label: "In progress / other", color: "var(--lavender)" },
] as const;

export function ReadinessDonut({ counts }: { counts: { cases: number; ready: number; blocked: number; unknown: number } }) {
  const other = Math.max(0, counts.cases - counts.ready - counts.blocked - counts.unknown);
  const values = { ready: counts.ready, blocked: counts.blocked, unknown: counts.unknown, other };
  const total = counts.cases;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const label = total
    ? `Readiness of ${total} listed case${total === 1 ? "" : "s"}: ${SEGMENTS.map((s) => `${values[s.key]} ${s.label.toLowerCase()}`).join(", ")}.`
    : "No cases listed yet.";
  return (
    <figure className="donut-card">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={R} className="donut-track" />
        {total > 0 &&
          SEGMENTS.map((s, n) => {
            const v = values[s.key];
            if (!v) return null;
            const len = (v / total) * C;
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                className="donut-seg"
                stroke={s.color}
                strokeDasharray={`${Math.max(0, len - 3)} ${C}`}
                strokeDashoffset={-offset}
                style={{ animationDelay: `${n * 120}ms` }}
              />
            );
            offset += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" className="donut-n">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="donut-l">
          {total === 1 ? "case" : "cases"}
        </text>
      </svg>
      <figcaption>
        <ul className="donut-legend">
          {SEGMENTS.map((s) => (
            <li key={s.key}>
              <span className="swatch dot" style={{ background: s.color }} aria-hidden />
              <span>{s.label}</span>
              <strong className="num">{values[s.key]}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
