"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Drawer } from "@/components/Drawer";
import { useToast } from "@/components/Toast";
import { IconAlert, IconArrowRight, IconChart, IconCheck, IconLock, IconShield, IconSparkle, IconUsers } from "@/components/Icons";
import { DELEGATION_LADDER, MODELS, PRODUCTS, PROMPTS, validateExperiment, W5, type Metrics, type Rate, type RunRow, type Slice } from "@/lib/visibility/core";
import type { ExperimentDetail, ExperimentSummary } from "@/lib/visibility/api";

// ---------------------------------------------------------------------------------------------------
// formatting — every rate is shown as "k of n", never a bare percentage; missing is "n/a", never 0%
// ---------------------------------------------------------------------------------------------------
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "n/a" : `${Math.round(r * 100)}%`);
function RateText({ r, ci = false }: { r: Rate | undefined | null; ci?: boolean }) {
  if (!r || r.n === 0) return <span className="muted">n/a · no valid runs</span>;
  return (
    <span>
      <strong className="num">{pct(r.rate)}</strong>{" "}
      <span className="muted small num">
        {r.k} of {r.n}
        {ci && r.low !== null && r.high !== null ? ` · 95% ${pct(r.low)}–${pct(r.high)}` : ""}
      </span>
    </span>
  );
}
const ctxLabel: Record<string, string> = { COPY: "Copy only", STRUCTURED: "Copy + structured profile", COLD: "Asked cold" };
const short = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;

type Detail = ExperimentDetail;
const METRICS: { key: keyof Slice; label: string; help: string; lowerIsBetter?: boolean }[] = [
  { key: "appearance", label: "Appearance", help: "Listed as a candidate" },
  { key: "shortlist", label: "Shortlist", help: "Shortlisted or recommended" },
  { key: "recommendation", label: "Recommendation", help: "Status RECOMMENDED" },
  { key: "top_position", label: "Top position", help: "Recommended and ranked #1" },
  { key: "capability_accuracy", label: "Capability accuracy", help: "Correct ÷ (correct + unsupported) claims" },
  { key: "unsupported_claims", label: "Unsupported claims", help: "Runs with ≥1 false capability claim", lowerIsBetter: true },
];

export function VisibilityLab({ detail, list, mode, unavailable, canStart, startBlockedReason }: { detail: Detail | null; list: ExperimentSummary[]; mode: "live" | "synthetic"; unavailable: string | null; canStart: boolean; startBlockedReason: string | null }) {
  const m = detail?.metrics ?? null;
  return (
    <div className="vis">
      <section className="vis-hero" id="lab-hero">
        <div className="vis-hero-copy">
          <span className="eyebrow">Week 5 · AI visibility &amp; delegation lab</span>
          <h1>
            AI Visibility <em className="grad-text">Lab</em>
          </h1>
          <p className="vis-sub">Can AI agents find, understand and accurately recommend ActionReady?</p>
          <div className="vis-badges">
            <span className="vis-badge mono">Prompt corpus: {W5.corpusVersion}</span>
            <span className="vis-badge mono">Profile: v{W5.profileVersion.split(".")[0]}</span>
            <span className="vis-badge mono">Synthetic competitors: {PRODUCTS.filter((p) => p.synthetic).length}</span>
            <a className="vis-badge mono link" href="/agent-profile.json" target="_blank" rel="noreferrer">
              /agent-profile.json ↗
            </a>
          </div>
        </div>
        <p className="vis-motto mono">Code calculates · AI observes · missing is never zero</p>
      </section>

      {mode === "synthetic" && (
        <div className="banner demo vis-synthetic" role="note">
          <IconAlert />
          <span>
            <strong>Synthetic sample — not a measurement.</strong> This site is not connected to the live workflow, so the numbers below come from a labelled synthetic sample run through the real parser and scoring code. No model was called.
          </span>
        </div>
      )}
      {unavailable && (
        <div className="banner error" role="alert">
          <IconAlert />
          <span>
            <strong>Disconnected / experiment unavailable.</strong> {unavailable} No sample data is substituted for live results.
          </span>
        </div>
      )}

      <section className="vis-explain" id="explainer" aria-label="The two experiments">
        <article className="card vis-exp">
          <span className="vis-exp-tag mono">Experiment A</span>
          <h2>Asking AI cold</h2>
          <p>Measures public model familiarity. Low visibility is expected for a private class project and is not a quality score.</p>
          <p className="vis-exp-note">Cold recall measures public model familiarity, not product quality.</p>
        </article>
        <article className="card vis-exp main">
          <span className="vis-exp-tag mono">Experiment B · main</span>
          <h2>Agent read the pages</h2>
          <p>Measures whether supplied product information is understandable, comparable and recommendation-ready.</p>
          <p className="vis-exp-note">
            Before = marketing copy for all four products. After = the same copy plus the <em>same structured profile schema</em> for all four.
          </p>
        </article>
      </section>

      <Builder canStart={canStart} blockedReason={startBlockedReason} list={list} current={detail?.experiment.experiment_id ?? null} />

      {!detail && !unavailable && mode === "live" && (
        <section className="card">
          <div className="empty">
            <div className="icon">
              <IconChart width={20} height={20} />
            </div>
            <h2>No experiment yet</h2>
            <p className="muted">Start one above. Results appear here once runs are stored — nothing is estimated in advance.</p>
          </div>
        </section>
      )}

      {detail && m && (
        <>
          <RunSummary detail={detail} />
          <Kpis m={m} />
          <div className="vis-two">
            <Funnel m={m} />
            <BeforeAfter m={m} />
          </div>
          <Sensitivity m={m} />
          <div className="vis-two">
            <ColdAndNegative m={m} />
            <ModelComparison m={m} />
          </div>
          <Explorer runs={detail.runs} />
          <div className="vis-two">
            <Scorecard r={detail.readability} />
            <Improvements recs={detail.recommendations} />
          </div>
        </>
      )}
      <Ladder />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Experiment builder (FOD) — corpus prompts only; shows the exact call count; approvers confirm
// ---------------------------------------------------------------------------------------------------
function Builder({ canStart, blockedReason, list, current }: { canStart: boolean; blockedReason: string | null; list: ExperimentSummary[]; current: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [prompts, setPrompts] = useState<string[]>(["P01", "P04", "P05", "P06", "P08"]);
  const [contexts, setContexts] = useState<("COPY" | "STRUCTURED")[]>(["COPY", "STRUCTURED"]);
  const [cold, setCold] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([MODELS[0]!.id]);
  const [reps, setReps] = useState(3);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<{ id: string; total: number; done: number } | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const kind = contexts.length && prompts.length ? (cold.length ? "BOTH" : "CONTEXT") : "COLD";
  const body = { kind, prompt_ids: kind === "COLD" ? [] : prompts, cold_prompt_ids: cold, contexts: kind === "COLD" ? [] : contexts, models, reps };
  const v = useMemo(() => validateExperiment(body), [JSON.stringify(body)]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  useEffect(() => () => void (poll.current && clearInterval(poll.current)), []);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/visibility/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = (await res.json().catch(() => ({}))) as { experiment_id?: string; requested_runs?: number; error?: { message?: string } };
      if (res.status !== 202 || !b.experiment_id) {
        toast({ tone: "error", title: "Experiment not started", body: b.error?.message ?? `HTTP ${res.status}` });
        return;
      }
      setConfirm(false);
      toast({ tone: "success", title: "Experiment started", body: `${b.requested_runs} model calls queued. Results appear as runs are stored.` });
      const id = b.experiment_id;
      setRunning({ id, total: b.requested_runs ?? 0, done: 0 });
      poll.current = setInterval(async () => {
        const r = await fetch(`/api/visibility/experiments/${id}`).catch(() => null);
        if (!r || !r.ok) return;
        const d = (await r.json()) as Detail;
        setRunning({ id, total: d.experiment.requested_runs, done: d.runs.length });
        if (d.experiment.status !== "RUNNING") {
          if (poll.current) clearInterval(poll.current);
          setRunning(null);
          router.push(`/visibility?id=${id}`);
          router.refresh();
        }
      }, 8000);
    } finally {
      setBusy(false);
    }
  }

  const segments = ["OPEN", "CONSTRAINED", "DELEGATED"] as const;
  return (
    <section className="card vis-builder" id="builder" aria-labelledby="builder-h">
      <div className="card-head wrap">
        <div>
          <h2 id="builder-h">Experiment builder</h2>
          <p className="hint">Versioned corpus prompts only — no free-text prompts. Each prompt states its Filter, Objective and Delegation.</p>
        </div>
        {list.length > 0 && (
          <label className="vis-pick small">
            <span className="muted">Showing</span>
            <select className="select" value={current ?? ""} onChange={(e) => router.push(`/visibility?id=${e.target.value}`)}>
              {list.map((e) => (
                <option key={e.experiment_id} value={e.experiment_id}>
                  {new Date(e.created_at).toLocaleString()} · {e.status} · {e.valid_runs}/{e.requested_runs}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="card-body vis-builder-grid">
        <div className="vis-prompts">
          {segments.map((seg) => (
            <fieldset key={seg} className="vis-seg">
              <legend className="mono">{seg}</legend>
              {PROMPTS.filter((p) => p.segment === seg).map((p) => (
                <label key={p.prompt_id} className={`vis-prompt ${prompts.includes(p.prompt_id) ? "on" : ""} ${p.negative ? "neg" : ""}`}>
                  <input type="checkbox" checked={prompts.includes(p.prompt_id)} onChange={() => setPrompts(toggle(prompts, p.prompt_id))} />
                  <span className="vis-prompt-body">
                    <span className="vis-prompt-top">
                      <strong className="mono">{p.prompt_id}</strong>
                      {p.negative && <span className="pill blocked">Negative control</span>}
                    </span>
                    <span className="vis-prompt-text">“{p.text}”</span>
                    <span className="vis-fod">
                      <span>
                        <b>F</b> {p.filter}
                      </span>
                      <span>
                        <b>O</b> {p.objective}
                      </span>
                      <span>
                        <b>D</b> {p.delegation.replace("_", " ").toLowerCase()}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="vis-settings">
          <div className="field">
            <span className="label">Context</span>
            {(["COPY", "STRUCTURED"] as const).map((c) => (
              <label key={c} className="vis-check">
                <input type="checkbox" checked={contexts.includes(c)} onChange={() => setContexts(toggle(contexts, c))} /> {ctxLabel[c]}
              </label>
            ))}
          </div>
          <div className="field">
            <span className="label">Cold recall (no material)</span>
            {PROMPTS.filter((p) => p.cold_text).map((p) => (
              <label key={p.prompt_id} className="vis-check">
                <input type="checkbox" checked={cold.includes(p.prompt_id)} onChange={() => setCold(toggle(cold, p.prompt_id))} /> {p.prompt_id} asked cold
              </label>
            ))}
          </div>
          <div className="field">
            <span className="label">Model</span>
            {MODELS.map((mm) => (
              <label key={mm.id} className="vis-check">
                <input type="checkbox" checked={models.includes(mm.id)} onChange={() => setModels(toggle(models, mm.id))} /> {mm.label} <code className="muted">{mm.id}</code>
              </label>
            ))}
          </div>
          <div className="field">
            <label htmlFor="vis-reps" className="label">
              Repetitions per prompt
            </label>
            <input id="vis-reps" className="input" type="number" min={1} max={W5.maxReps} value={reps} onChange={(e) => setReps(Math.max(1, Math.min(W5.maxReps, Number(e.target.value) || 1)))} />
          </div>
          <div className={`vis-calls ${v.ok ? "" : "bad"}`} aria-live="polite">
            {v.ok ? (
              <>
                This experiment will make <strong className="num">{v.total_runs}</strong> model calls.
              </>
            ) : (
              <>{v.message}</>
            )}
          </div>
          {running ? (
            <div className="vis-running" role="status">
              <span className="pulse" aria-hidden /> Running · {running.done} of {running.total} runs stored
            </div>
          ) : (
            <button type="button" className="btn primary" disabled={!canStart || !v.ok} onClick={() => setConfirm(true)}>
              <IconSparkle width={15} height={15} /> Review &amp; start live experiment
            </button>
          )}
          {!canStart && blockedReason && (
            <p className="small muted">
              <IconLock width={12} height={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              {blockedReason}
            </p>
          )}
        </div>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        eyebrow="Live experiment"
        title={`Make ${v.ok ? v.total_runs : 0} model calls?`}
        tone="unknown"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={busy || !v.ok} onClick={() => void start()}>
              {busy ? "Starting…" : "Start experiment"}
            </button>
          </>
        }
      >
        <ul className="modal-list">
          <li>Prompts: {[...(kind === "COLD" ? [] : prompts), ...cold.map((c) => c + " (cold)")].join(", ")}</li>
          <li>Contexts: {kind === "COLD" ? "cold only" : contexts.map((c) => ctxLabel[c]).join(" · ")}</li>
          <li>
            Models: {models.map(short).join(", ")} · {reps} repetition{reps === 1 ? "" : "s"}
          </li>
        </ul>
        <p className="small muted" style={{ marginTop: 12 }}>
          Model answers are recorded as observations. Failures are kept, not retried. The experiment cannot send email, change cases or publish tasks — delegation stops at “recommend”.
        </p>
      </Modal>
    </section>
  );
}

function RunSummary({ detail }: { detail: Detail }) {
  const e = detail.experiment;
  const m = detail.metrics;
  return (
    <section className="vis-summary" aria-label="Experiment summary">
      <span className={`pill ${e.status === "COMPLETE" ? "ready" : e.status === "PARTIAL" ? "unknown" : e.status === "RUNNING" ? "neutral" : "blocked"}`}>{e.status}</span>
      <span className="mono small">{detail.synthetic ? "synthetic sample" : e.experiment_id}</span>
      <span className="small muted">
        {m.totals.valid} of {m.totals.requested} runs valid
        {m.totals.failed > 0 && ` · ${m.totals.failed} failed (${Object.entries(m.totals.errors).map(([k, n]) => `${k} ${n}`).join(", ")})`} · models {e.models} · {e.reps_per_cell} reps
      </span>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// KPIs, funnel, before/after
// ---------------------------------------------------------------------------------------------------
function Kpis({ m }: { m: Metrics }) {
  const after = m.contexts.STRUCTURED;
  const before = m.contexts.COPY;
  const main = after ?? before;
  if (!main) return <section className="card card-body muted">No context runs in this experiment.</section>;
  return (
    <section className="vis-kpis" id="kpis" aria-label="Key metrics — agent-read context, P08 excluded">
      {METRICS.map((k, i) => {
        const a = main[k.key] as Rate;
        const b = after && before ? (before[k.key] as Rate) : null;
        const delta = b && a.rate !== null && b.rate !== null ? Math.round((a.rate - b.rate) * 100) : null;
        const good = delta === null ? null : k.lowerIsBetter ? delta < 0 : delta > 0;
        return (
          <article key={k.key} className="vis-kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="vis-kpi-label mono">{k.label}</span>
            <span className="vis-kpi-n">{pct(a.rate)}</span>
            <span className="small muted num">
              {a.n ? `${a.k} of ${a.n}` : "no valid runs"} · {ctxLabel[after ? "STRUCTURED" : "COPY"]}
            </span>
            {b && (
              <span className={`vis-kpi-delta ${good === null || delta === 0 ? "" : good ? "up" : "down"}`}>
                Copy only: {pct(b.rate)} ({b.n ? `${b.k} of ${b.n}` : "n/a"}){delta !== null && delta !== 0 ? ` · ${delta > 0 ? "+" : ""}${delta} pts` : delta === 0 ? " · no change" : ""}
              </span>
            )}
            <span className="hint">{k.help}</span>
            {!main.sufficient && <span className="pill unknown vis-insufficient">insufficient (n &lt; {W5.minHeadlineN})</span>}
          </article>
        );
      })}
    </section>
  );
}

function Funnel({ m }: { m: Metrics }) {
  const stages: { key: keyof Slice | "valid"; label: string }[] = [
    { key: "valid", label: "Valid runs" },
    { key: "appearance", label: "ActionReady appeared" },
    { key: "shortlist", label: "Shortlisted" },
    { key: "recommendation", label: "Recommended" },
    { key: "top_position", label: "Ranked #1" },
  ];
  const ctxs = (["COPY", "STRUCTURED"] as const).filter((c) => m.contexts[c]);
  return (
    <section className="card vis-funnel" id="funnel" aria-labelledby="funnel-h">
      <div className="card-head">
        <h2 id="funnel-h">Recommendation funnel</h2>
        <span className="small muted">P08 excluded — winning it would be wrong</span>
      </div>
      <div className="card-body vis-funnel-grid" style={{ gridTemplateColumns: `140px repeat(${ctxs.length}, minmax(0, 1fr))` }}>
        <span />
        {ctxs.map((c) => (
          <span key={c} className="mono small muted vis-col-h">
            {ctxLabel[c]}
          </span>
        ))}
        {stages.map((s) => (
          <FunnelRow key={s.key} label={s.label} cells={ctxs.map((c) => {
            const sl = m.contexts[c]!;
            return s.key === "valid" ? { k: sl.valid, n: sl.requested } : { k: (sl[s.key] as Rate).k, n: sl.valid };
          })} ctxs={ctxs} />
        ))}
      </div>
    </section>
  );
}
function FunnelRow({ label, cells, ctxs }: { label: string; cells: { k: number; n: number }[]; ctxs: readonly string[] }) {
  return (
    <>
      <span className="small">{label}</span>
      {cells.map((c, i) => (
        <div key={ctxs[i]} className="vis-bar" role="img" aria-label={`${label}, ${ctxLabel[ctxs[i]!]}: ${c.k} of ${c.n}`}>
          <span className={`vis-bar-fill ${ctxs[i] === "STRUCTURED" ? "after" : "before"}`} style={{ width: c.n ? `${(c.k / c.n) * 100}%` : 0 }} />
          <span className="vis-bar-label num">
            {c.k} of {c.n}
          </span>
        </div>
      ))}
    </>
  );
}

function BeforeAfter({ m }: { m: Metrics }) {
  const b = m.contexts.COPY;
  const a = m.contexts.STRUCTURED;
  return (
    <section className="card vis-ba" id="before-after" aria-labelledby="ba-h">
      <div className="card-head">
        <h2 id="ba-h">Before → after: structured profile</h2>
        <span className="small muted">Same prompts, model, reps, truth tables and scoring</span>
      </div>
      {!a || !b ? (
        <p className="card-body muted">Both contexts are needed for a before/after comparison.</p>
      ) : (
        <div className="card-body vis-dumbbells">
          <div className="vis-legend small">
            <span>
              <i className="dot-before" /> Copy only
            </span>
            <span>
              <i className="dot-after" /> Copy + structured profile
            </span>
          </div>
          {METRICS.map((k) => {
            const rb = b[k.key] as Rate;
            const ra = a[k.key] as Rate;
            if (rb.rate === null || ra.rate === null)
              return (
                <div key={k.key} className="vis-db">
                  <span className="small">{k.label}</span>
                  <span className="muted small">n/a — no valid denominator</span>
                </div>
              );
            const lo = Math.min(rb.rate, ra.rate) * 100;
            const hi = Math.max(rb.rate, ra.rate) * 100;
            return (
              <div key={k.key} className="vis-db">
                <span className="small">{k.label}</span>
                <div className="vis-db-track" role="img" aria-label={`${k.label}: copy only ${rb.k} of ${rb.n}, structured ${ra.k} of ${ra.n}`}>
                  <span className="vis-db-line" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                  <span className="vis-db-dot before" style={{ left: `${rb.rate * 100}%` }} />
                  <span className="vis-db-dot after" style={{ left: `${ra.rate * 100}%` }} />
                </div>
                <span className="small num vis-db-val">
                  {pct(rb.rate)} → {pct(ra.rate)}
                </span>
              </div>
            );
          })}
          <p className="hint">An improvement is only claimed where the measured rates differ; with small samples the 95% ranges overlap — read the k-of-n.</p>
        </div>
      )}
    </section>
  );
}

function Sensitivity({ m }: { m: Metrics }) {
  const ctxs = (["COPY", "STRUCTURED"] as const).filter((c) => m.by_segment[c]);
  return (
    <section className="card" id="sensitivity" aria-labelledby="sens-h">
      <div className="card-head">
        <div>
          <h2 id="sens-h">Prompt sensitivity</h2>
          <p className="hint">How recommendation outcomes change with the prompt design (Filter / Objective / Delegation).</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data vis-sens">
          <thead>
            <tr>
              <th>Segment</th>
              {ctxs.map((c) => (
                <th key={c + "a"}>Appearance · {ctxLabel[c]}</th>
              ))}
              {ctxs.map((c) => (
                <th key={c + "r"}>Recommended · {ctxLabel[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["OPEN", "CONSTRAINED", "DELEGATED"] as const).map((seg) => (
              <tr key={seg}>
                <td className="mono">{seg}</td>
                {(["appearance", "recommendation"] as const).flatMap((k) =>
                  ctxs.map((c) => {
                    const s = m.by_segment[c]?.[seg];
                    const r = s ? (s[k] as Rate) : null;
                    return (
                      <td key={c + k}>
                        {r && r.n ? (
                          <div className="vis-mini">
                            <span className="vis-mini-bar">
                              <span style={{ width: `${(r.rate ?? 0) * 100}%` }} className={c === "STRUCTURED" ? "after" : "before"} />
                            </span>
                            <RateText r={r} />
                          </div>
                        ) : (
                          <span className="muted small">not run</span>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-foot hint">Delegated excludes the P08 negative control, which is reported separately.</p>
    </section>
  );
}

function ColdAndNegative({ m }: { m: Metrics }) {
  return (
    <section className="card" id="cold-negative" aria-labelledby="cn-h">
      <div className="card-head">
        <h2 id="cn-h">Cold recall &amp; negative control</h2>
      </div>
      <div className="card-body stack">
        <div className="vis-mini-card">
          <span className="mono small muted">Asked cold · appeared</span>
          {m.cold ? <RateText r={m.cold.appearance} ci /> : <span className="muted">Not run in this experiment</span>}
          <span className="hint">Cold recall measures public model familiarity, not product quality.</span>
        </div>
        <div className="vis-mini-card">
          <span className="mono small muted">P08 · correct rejection (transcription + auto-send requested)</span>
          {Object.keys(m.negative).length ? (
            Object.entries(m.negative).map(([c, r]) => (
              <span key={c}>
                {ctxLabel[c]}: <RateText r={r} />
              </span>
            ))
          ) : (
            <span className="muted">P08 not run</span>
          )}
          <span className="hint">ActionReady should not win P08 — it cannot join calls, transcribe or send without approval.</span>
        </div>
      </div>
    </section>
  );
}

function ModelComparison({ m }: { m: Metrics }) {
  const models = Object.keys(m.by_model);
  const ok = models.length >= 2 && models.every((id) => Object.values(m.by_model[id] ?? {}).some((s) => s.sufficient));
  return (
    <section className="card" id="models" aria-labelledby="mc-h">
      <div className="card-head">
        <h2 id="mc-h">Gemini model comparison</h2>
      </div>
      {!ok ? (
        <p className="card-body muted">
          Insufficient evidence for model comparison. {models.length < 2 ? `Only ${models.map(short).join(", ") || "no model"} was run.` : `Each model needs at least ${W5.minHeadlineN} valid runs in a context.`}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Model</th>
                <th>Context</th>
                <th>Appearance</th>
                <th>Recommended</th>
                <th>Capability accuracy</th>
              </tr>
            </thead>
            <tbody>
              {models.flatMap((id) =>
                Object.entries(m.by_model[id]!).map(([c, s]) => (
                  <tr key={id + c}>
                    <td>
                      {short(id)} <code className="muted">{id}</code>
                    </td>
                    <td>{ctxLabel[c]}</td>
                    <td>
                      <RateText r={s.appearance} />
                    </td>
                    <td>
                      <RateText r={s.recommendation} />
                    </td>
                    <td>
                      <RateText r={s.capability_accuracy} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Run explorer
// ---------------------------------------------------------------------------------------------------
const yes = (v: unknown) => v === true || v === "true";
function Explorer({ runs }: { runs: RunRow[] }) {
  const [f, setF] = useState({ prompt: "", ctx: "", model: "", status: "", rec: "" });
  const [open, setOpen] = useState<RunRow | null>(null);
  const shown = runs.filter(
    (r) =>
      (!f.prompt || r.prompt_id === f.prompt) &&
      (!f.ctx || r.context === f.ctx) &&
      (!f.model || r.model_id === f.model) &&
      (!f.status || (f.status === "ok" ? yes(r.parse_success) : !yes(r.parse_success))) &&
      (!f.rec || (f.rec === "yes" ? yes(r.ar_recommended) : !yes(r.ar_recommended))),
  );
  const sel = (key: keyof typeof f, label: string, opts: [string, string][]) => (
    <label className="vis-filter small">
      <span className="sr-only">{label}</span>
      <select className="select" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} aria-label={label}>
        <option value="">{label}: all</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="card" id="explorer" aria-labelledby="ex-h">
      <div className="card-head wrap">
        <h2 id="ex-h">Run explorer</h2>
        <div className="toolbar">
          {sel("prompt", "Prompt", [...new Set(runs.map((r) => r.prompt_id))].sort().map((p) => [p, p]))}
          {sel("ctx", "Context", [...new Set(runs.map((r) => r.context))].map((c) => [c, ctxLabel[c] ?? c]))}
          {sel("model", "Model", [...new Set(runs.map((r) => r.model_id))].map((x) => [x, short(x)]))}
          {sel("status", "Parse", [["ok", "Parsed"], ["fail", "Failed"]])}
          {sel("rec", "Recommended", [["yes", "Recommended"], ["no", "Not recommended"]])}
        </div>
      </div>
      <div className="table-wrap vis-explorer">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Prompt</th>
              <th>Context</th>
              <th>Model</th>
              <th>Parse</th>
              <th>ActionReady</th>
              <th>Rank</th>
              <th>Unsupported</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.run_key} className="selectable" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r))}>
                <td className="num">{Number(r.run_index) + 1}</td>
                <td className="mono">{r.prompt_id}</td>
                <td>{ctxLabel[r.context] ?? r.context}</td>
                <td>{short(r.model_id)}</td>
                <td>{yes(r.parse_success) ? <span className="pill ready">ok</span> : <span className="pill blocked">{String(r.parse_error)}</span>}</td>
                <td>{!yes(r.parse_success) ? "—" : yes(r.ar_recommended) ? "Recommended" : yes(r.ar_shortlisted) ? "Shortlisted" : yes(r.ar_mentioned) ? "Mentioned" : <span className="muted">Absent</span>}</td>
                <td className="num">{r.ar_rank ?? "—"}</td>
                <td>{r.ar_unsupported ? <span className="pill blocked">{String(r.ar_unsupported).replace(/,/g, ", ")}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="card-body muted">No run matches these filters.</p>}
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Run ${Number(open.run_index) + 1} · ${open.prompt_id}` : ""} eyebrow={open ? `${ctxLabel[open.context] ?? open.context} · ${short(open.model_id)}` : undefined}>
        {open && <RunDetail r={open} />}
      </Drawer>
    </section>
  );
}

function RunDetail({ r }: { r: RunRow }) {
  const p = PROMPTS.find((x) => x.prompt_id === r.prompt_id);
  let parsed: { candidates?: { name: string; rank: number; status: string; claimed_capabilities: string[]; reasons: string[] }[] } | null = null;
  try {
    parsed = r.parsed_json ? JSON.parse(String(r.parsed_json)) : null;
  } catch {
    parsed = null;
  }
  let order: string[] = [];
  try {
    order = JSON.parse(String(r.order_json || "[]"));
  } catch {
    order = [];
  }
  return (
    <div className="stack vis-run">
      {p && (
        <>
          <p className="quote">{r.context === "COLD" ? p.cold_text ?? p.text : p.text}</p>
          <p className="vis-fod">
            <span>
              <b>F</b> {p.filter}
            </span>
            <span>
              <b>O</b> {p.objective}
            </span>
            <span>
              <b>D</b> {p.delegation}
            </span>
          </p>
        </>
      )}
      <dl className="kv">
        <dt>Model</dt>
        <dd>
          <code>{r.model_id}</code>
        </dd>
        <dt>Dossier order</dt>
        <dd>{order.length ? order.map((id) => PRODUCTS.find((x) => x.id === id)?.name ?? id).join(" → ") : "none (cold)"}</dd>
        <dt>Provider</dt>
        <dd>
          {r.provider_status} · {r.latency_ms ?? "?"} ms
        </dd>
        <dt>Parse</dt>
        <dd>{yes(r.parse_success) ? "success" : `failed — ${r.parse_error}`}</dd>
        <dt>Flags</dt>
        <dd>{r.flags || "—"}</dd>
        <dt>Coded</dt>
        <dd>
          mentioned {String(r.ar_mentioned)} · shortlisted {String(r.ar_shortlisted)} · recommended {String(r.ar_recommended)} · rank {r.ar_rank ?? "—"}
        </dd>
        <dt>Claims</dt>
        <dd>{r.ar_claims || "—"}</dd>
        <dt>Unsupported</dt>
        <dd className={r.ar_unsupported ? "err" : ""}>{r.ar_unsupported || "none"}</dd>
      </dl>
      {parsed?.candidates && (
        <>
          <span className="section-label">Parsed candidates</span>
          <ol className="vis-cands">
            {parsed.candidates.map((c) => (
              <li key={c.name + c.rank}>
                <strong>{c.name}</strong> <span className={`pill ${c.status === "RECOMMENDED" ? "ready" : c.status === "REJECTED" ? "blocked" : "neutral"}`}>{c.status}</span>
                {c.reasons?.length ? <span className="small muted"> — {c.reasons.join("; ")}</span> : null}
              </li>
            ))}
          </ol>
        </>
      )}
      <span className="section-label">Raw model output</span>
      <pre className="notes-view vis-raw">{String(r.raw_output || "(empty)")}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Readability scorecard, improvements, delegation ladder
// ---------------------------------------------------------------------------------------------------
function Scorecard({ r }: { r: Detail["readability"] }) {
  const weakest = r.sections.find((s) => s.id === r.weakest);
  return (
    <section className="card" id="readability" aria-labelledby="rd-h">
      <div className="card-head">
        <h2 id="rd-h">Agent readability scorecard</h2>
        <a className="small" href="/agent-profile.json" target="_blank" rel="noreferrer">
          /agent-profile.json ↗
        </a>
      </div>
      <div className="card-body vis-score">
        <div className="vis-score-total">
          <span className="vis-kpi-n">{r.score}</span>
          <span className="muted small">of {r.max} · deterministic rules</span>
          {weakest && weakest.score < weakest.max && <span className="pill unknown">Weakest: {weakest.label}</span>}
        </div>
        <div className="stack">
          {r.sections.map((s) => (
            <details key={s.id} className="vis-sec">
              <summary>
                <span className="small">{s.label}</span>
                <span className="vis-mini-bar">
                  <span className="after" style={{ width: `${(s.score / s.max) * 100}%` }} />
                </span>
                <span className="small num">
                  {s.score}/{s.max}
                </span>
              </summary>
              <ul className="vis-crit">
                {s.criteria.map((c) => (
                  <li key={c.id} className={c.pass ? "pass" : "fail"}>
                    {c.pass ? <IconCheck width={13} height={13} /> : <IconAlert width={13} height={13} />} {c.label} <span className="muted num">({c.pass ? c.points : 0}/{c.points})</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Improvements({ recs }: { recs: Detail["recommendations"] }) {
  return (
    <section className="card" id="improve" aria-labelledby="im-h">
      <div className="card-head">
        <h2 id="im-h">What should improve</h2>
        <span className="pill neutral">Rule-based · not AI-generated</span>
      </div>
      <ul className="card-body vis-recs">
        {recs.map((x) => (
          <li key={x.id}>
            <strong>{x.text}</strong>
            <span className="small muted mono">Basis: {x.basis}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ladder() {
  const icon = (actor: string) => (actor === "HUMAN" ? <IconUsers width={16} height={16} /> : actor === "LOCKED" ? <IconLock width={16} height={16} /> : <IconSparkle width={16} height={16} />);
  return (
    <section className="card" id="delegation" aria-labelledby="dl-h">
      <div className="card-head">
        <div>
          <h2 id="dl-h">Delegation boundary</h2>
          <p className="hint">How far ActionReady lets AI act. The Visibility Lab itself never goes past “recommend”.</p>
        </div>
        <IconShield width={18} height={18} />
      </div>
      <ol className="vis-ladder card-body">
        {DELEGATION_LADDER.map((s) => (
          <li key={s.id} className={`vis-step ${s.actor.toLowerCase()} ${s.id === "RECOMMEND" ? "lab-stop" : ""}`}>
            <span className="vis-step-n mono">{s.level}</span>
            <span className="vis-step-icon" aria-hidden>
              {icon(s.actor)}
            </span>
            <strong>{s.label}</strong>
            <span className="vis-step-actor mono">{s.actor === "AI" ? "AI allowed" : s.actor === "HUMAN" ? "Human required" : "Only after approval"}</span>
            <span className="small muted">{s.note}</span>
            {s.id === "RECOMMEND" && (
              <span className="vis-stop mono">
                <IconArrowRight width={11} height={11} /> Lab stops here
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
