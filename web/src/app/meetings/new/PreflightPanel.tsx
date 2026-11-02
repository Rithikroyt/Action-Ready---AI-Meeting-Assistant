import type { PreflightResult } from "@/lib/preflight";

const MARK = { OK: "✓", WARNING: "⚠", ERROR: "✕" } as const;
const SR = { OK: "Passed:", WARNING: "Warning:", ERROR: "Error:" } as const;

/** Compact, always-current list of the local pre-submit checks. */
export function PreflightPanel({ result }: { result: PreflightResult }) {
  const summary = result.errors.length
    ? `${result.errors.length} to fix`
    : result.warnings.length
      ? `${result.warnings.length} warning${result.warnings.length > 1 ? "s" : ""}`
      : "Looks complete";
  const tone = result.errors.length ? "blocked" : result.warnings.length ? "unknown" : "ready";
  return (
    <section className="preflight" aria-labelledby="preflight-h">
      <div className="preflight-head">
        <h2 id="preflight-h">Pre-submit check</h2>
        <span className={`badge ${tone}`} aria-live="polite">
          {summary}
        </span>
      </div>
      <ul className="preflight-list">
        {result.items.map((i) => (
          <li key={i.id} className={`pf-${i.level.toLowerCase()}`}>
            <span className="pf-mark" aria-hidden>
              {MARK[i.level]}
            </span>
            <span className="sr-only">{SR[i.level]}</span>
            {i.label}
          </li>
        ))}
      </ul>
      <p className="hint">These are local checks only. ActionReady&apos;s n8n workflow performs the authoritative extraction and review.</p>
    </section>
  );
}
