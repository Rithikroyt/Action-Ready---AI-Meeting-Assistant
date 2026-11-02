"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionItem, EvidenceRecord, JobView, ToolEvidence } from "@/lib/contract";
import { isFinal } from "@/lib/contract";
import { APPROVAL_UI, READINESS_UI, REVIEW_UI, execLabel, fmtDate, fmtHours, fmtPeriod, relTime } from "@/lib/present";
import { recallNotes } from "@/lib/sessionNotes";
import { ApprovalBadge, Badge, ModeBadge, ReadinessBadge, ReviewBadge } from "@/components/Badges";
import { IconAlert, IconCheck, IconDatabase, IconHelp, IconLock, IconRefresh } from "@/components/Icons";
import { WorkloadBar } from "@/components/WorkloadBar";
import { WhatIf } from "@/components/WhatIf";

type Load =
  | { k: "ok"; job: JobView; checkedAt: number }
  | { k: "unavailable"; message: string; last: JobView | null; checkedAt: number }
  | { k: "not_found" };

// Bounded polling: backoff from 2 s to 8 s, at most ~40 polls (~5 minutes), then stop and say so.
const MAX_POLLS = 40;
const delayFor = (n: number) => Math.min(8000, 2000 + n * 500);

export function CaseWorkspace({ jobId, initial }: { jobId: string; initial: Load }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>(initial);
  const [polls, setPolls] = useState(0);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const job = load.k === "ok" ? load.job : load.k === "unavailable" ? load.last : null;
  const finished = job ? isFinal(job.execution_status) : false;
  const pollingActive = !finished && load.k !== "not_found" && polls < MAX_POLLS && !(job?.stale ?? false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      if (res.status === 401) return router.push("/login");
      const body = (await res.json().catch(() => ({}))) as { job?: JobView; error?: { message?: string }; last_known?: JobView | null };
      if (res.status === 404) setLoad({ k: "not_found" });
      else if (res.ok && body.job) setLoad({ k: "ok", job: body.job, checkedAt: Date.now() });
      else
        setLoad((prev) => ({
          k: "unavailable",
          message: body.error?.message ?? `Status check failed (HTTP ${res.status}).`,
          last: body.last_known ?? (prev.k === "ok" ? prev.job : prev.k === "unavailable" ? prev.last : null),
          checkedAt: Date.now(),
        }));
    } catch {
      setLoad((prev) => ({
        k: "unavailable",
        message: "Could not reach this app's server.",
        last: prev.k === "ok" ? prev.job : prev.k === "unavailable" ? prev.last : null,
        checkedAt: Date.now(),
      }));
    } finally {
      setChecking(false);
    }
  }, [jobId, router]);

  useEffect(() => {
    if (!pollingActive) return;
    timer.current = setTimeout(() => {
      setPolls((p) => p + 1);
      void check();
    }, delayFor(polls));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pollingActive, polls, check]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  if (load.k === "not_found") {
    return (
      <div className="card">
        <div className="empty">
          <div className="icon">
            <IconHelp />
          </div>
          <h2>Case not found</h2>
          <p className="muted">This job does not exist for your account, or it has expired from the workflow.</p>
          <Link href="/" className="btn">
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  const checkedAt = load.checkedAt;

  return (
    <>
      <Header job={job} jobId={jobId} />

      {load.k === "unavailable" && (
        <div className="banner error" role="alert">
          <IconAlert />
          <span>
            <strong>Disconnected.</strong> {load.message} {job ? "Showing the last state this app received — it may be out of date." : "No result has been received."}
          </span>
        </div>
      )}

      {job?.mode === "LIVE" && job.provenance_note && <p className="hint">{job.provenance_note}</p>}

      {!job ? (
        <PendingCard label="Waiting for the first status…" polls={polls} pollingActive={pollingActive} onCheck={check} checking={checking} />
      ) : !finished ? (
        <InFlight job={job} pollingActive={pollingActive} polls={polls} onCheck={check} checking={checking} checkedAt={checkedAt} now={now} />
      ) : job.execution_status === "FAILED" ? (
        <FailedCard job={job} />
      ) : (
        <Result job={job} jobId={jobId} />
      )}
    </>
  );
}

function Header({ job, jobId }: { job: JobView | null; jobId: string }) {
  return (
    <div className="page-head">
      <div>
        <div className="crumbs">
          <Link href="/">Overview</Link>
          <span aria-hidden>/</span>
          <span>Case</span>
        </div>
        <h1>{job?.meeting_title ?? (job?.case_id ? `Case ${job.case_id}` : "Meeting analysis")}</h1>
        <div className="row" style={{ marginTop: 8 }}>
          {job && <ModeBadge mode={job.mode} />}
          <span className="badge mono" title="Opaque job ID">
            job {jobId}
          </span>
          {job?.case_id && <span className="badge mono">case {job.case_id}</span>}
          {job?.version !== null && job?.version !== undefined && (
            <span className="badge mono">
              v{job.version}
              {job.max_versions ? ` of ${job.max_versions}` : ""}
            </span>
          )}
          <span className="muted small">{fmtPeriod(job?.period)}</span>
        </div>
      </div>
    </div>
  );
}

function PendingCard(props: { label: string; polls: number; pollingActive: boolean; onCheck: () => void; checking: boolean }) {
  return (
    <section className="card">
      <div className="card-body stack">
        <div className="row">
          <span className="pulse" aria-hidden />
          <strong>{props.label}</strong>
        </div>
        <div className="skeleton" style={{ width: "60%" }} />
        <div className="skeleton" style={{ width: "40%" }} />
        <div>
          <button className="btn sm" onClick={props.onCheck} disabled={props.checking}>
            <IconRefresh width={14} height={14} /> Check status now
          </button>
        </div>
      </div>
    </section>
  );
}

function InFlight({ job, pollingActive, polls, onCheck, checking, checkedAt, now }: { job: JobView; pollingActive: boolean; polls: number; onCheck: () => void; checking: boolean; checkedAt: number; now: number }) {
  const ex = execLabel(job);
  const steps = [
    { label: "Accepted and saved", at: job.timestamps.accepted_at, done: !!job.timestamps.accepted_at },
    { label: "Processing started", at: job.timestamps.started_at, done: !!job.timestamps.started_at },
    { label: "Writer, evidence review and readiness checks", at: null, done: false },
  ];
  return (
    <section className="card" aria-live="polite">
      <div className="card-head">
        <div className="row">
          {!job.stale && pollingActive && <span className="pulse" aria-hidden />}
          <h2>{ex.label}</h2>
        </div>
        <button className="btn sm" onClick={onCheck} disabled={checking}>
          <IconRefresh width={14} height={14} /> {checking ? "Checking…" : "Check status now"}
        </button>
      </div>
      <div className="card-body stack">
        {job.stale ? (
          <div className="banner warn">
            <IconAlert />
            <span>
              No update has been recorded for over 10 minutes. The analysis may have stopped. This is not reported as a success or a failure — check the n8n
              execution log before resubmitting.
            </span>
          </div>
        ) : !pollingActive && polls > 0 ? (
          <div className="banner warn">
            <IconAlert />
            <span>Automatic checks paused after {polls} attempts. The workflow may still be running; use “Check status now”. Do not resubmit the meeting.</span>
          </div>
        ) : (
          <p className="muted">The workflow is processing this meeting. Steps appear only when the workflow records them — there is no estimated progress.</p>
        )}
        <ol className="timeline">
          {steps.map((s) => (
            <li key={s.label}>
              <span className={`tl-dot ${s.done ? "ok" : ""}`} />
              <div>
                <div style={{ fontWeight: 560 }}>{s.label}</div>
                <div className="small muted">{s.at ? fmtDate(s.at) : s.done ? "" : "Not yet recorded"}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="hint">Last checked {relTime(new Date(checkedAt).toISOString(), now)}.</p>
      </div>
    </section>
  );
}

function FailedCard({ job }: { job: JobView }) {
  return (
    <section className="callout blocked" role="alert">
      <h2>
        <IconAlert /> The analysis did not complete
      </h2>
      <p>{job.error?.message ?? "The workflow recorded a failure."}</p>
      {job.error?.code && <span className="issue-code" style={{ justifySelf: "start" }}>{job.error.code}</span>}
      <p className="small">No result was saved as successful, and nothing was sent or approved.</p>
      <div>
        <Link className="btn" href="/meetings/new">
          Start a new meeting
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Result({ job, jobId }: { job: JobView; jobId: string }) {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"evidence" | "workload" | "history">(job.operational_readiness === "BLOCKED" ? "workload" : "evidence");
  const notes = useMemo(() => recallNotes(jobId), [jobId]);
  const action = job.actions[selected] ?? null;
  const blocking = job.issues.filter((i) => i.severity === "BLOCKING");
  const unknown = job.issues.filter((i) => i.severity === "UNKNOWN");
  const notices = job.issues.filter((i) => i.severity === "NOTICE");
  const r = job.operational_readiness;

  return (
    <>
      <section className="status-trio" aria-label="Case status">
        <div className="status-cell">
          <span className="k">AI review</span>
          <div className="v">
            <ReviewBadge value={job.review.state} score={job.review.score} />
          </div>
          <span className="why">
            {REVIEW_UI[job.review.state].why}
            {job.review.threshold ? ` Threshold ${job.review.threshold}/5.` : ""}
          </span>
        </div>
        <div className={`status-cell ${r === "BLOCKED" ? "emph-blocked" : r === "READY" ? "emph-ready" : r === "UNKNOWN" ? "emph-unknown" : ""}`}>
          <span className="k">Operational readiness</span>
          <div className="v">
            <ReadinessBadge value={r} />
          </div>
          <span className="why">{READINESS_UI[r].why}</span>
        </div>
        <div className="status-cell">
          <span className="k">Human approval</span>
          <div className="v">
            <ApprovalBadge value={job.approval_status} />
          </div>
          <span className="why">{APPROVAL_UI[job.approval_status].why}</span>
        </div>
        <div className="status-cell">
          <span className="k">External action</span>
          <div className="v">
            {job.external_action === "PERMITTED" ? <Badge tone="ready">Permitted</Badge> : <Badge tone="neutral">Not permitted</Badge>}
          </div>
          <span className="why">{job.external_action === "PERMITTED" ? "Approved and ready." : "No email or task is created from this screen."}</span>
        </div>
      </section>

      {(blocking.length > 0 || unknown.length > 0) && (
        <section className={`callout ${blocking.length ? "blocked" : "unknown"}`} aria-labelledby="issues-h">
          <h2 id="issues-h">
            <IconAlert />
            {blocking.length ? "Blocked — a person needs to decide" : "Cannot confirm readiness"}
          </h2>
          <ul className="issue-list">
            {[...blocking, ...unknown].map((i, n) => (
              <li key={n}>
                <span className="issue-code">{i.code}</span>
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
          {job.clarification_questions.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="section-label">Questions for the team</span>
              <ol className="questions">
                {job.clarification_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          )}
          <p className="small muted">ActionReady does not reassign tasks, move dates, or change capacity records. Update the notes or records, then submit a new meeting.</p>
        </section>
      )}

      {r === "READY" && (
        <div className="banner info" role="status">
          <IconCheck />
          <span>
            Records are consistent and within capacity. This does <strong>not</strong> approve anything — human approval remains a separate step.
          </span>
        </div>
      )}

      <div className="workspace">
        <div className="stack" style={{ gap: 20 }}>
          <ActionTable actions={job.actions} selected={selected} onSelect={(i) => { setSelected(i); setTab("evidence"); }} />
          <DraftCard job={job} />
        </div>

        <section className="card sticky-col" aria-label="Details">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: "evidence", label: "Evidence" },
              { id: "workload", label: "Workload", count: job.workload.length },
              { id: "history", label: "Review history", count: job.tool_evidence.length + job.review_history.length || undefined },
            ]}
          />
          <div className="tabpanel fade-in" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab}>
            {tab === "evidence" && <EvidencePanel job={job} action={action} notes={notes} />}
            {tab === "workload" && (
              <div className="stack" style={{ gap: 24 }}>
                {job.workload.length === 0 ? (
                  <p className="muted">No owner workload was calculated. {job.operational_readiness === "NOT_CHECKED" ? "Context checks did not run for this case." : "See the issues above."}</p>
                ) : (
                  job.workload.map((w) => <WorkloadBar key={w.owner_id} w={w} />)
                )}
              </div>
            )}
            {tab === "history" && <History job={job} />}
          </div>
        </section>
      </div>

      <WhatIf job={job} />

      {notices.length > 0 && (
        <details className="card">
          <summary className="card-body small muted" style={{ cursor: "pointer" }}>
            {notices.length} note{notices.length > 1 ? "s" : ""} (non-blocking)
          </summary>
          <ul className="issue-list card-body" style={{ paddingTop: 0 }}>
            {notices.map((i, n) => (
              <li key={n}>
                <span className="issue-code">{i.code}</span>
                <span className="small">{i.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + items.length) % items.length;
    onChange(items[n]!.id);
    refs.current[n]?.focus();
  };
  return (
    <div className="tablist" role="tablist" aria-label="Case details">
      {items.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`tab-${t.id}`}
          role="tab"
          className="tab"
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ActionTable({ actions, selected, onSelect }: { actions: ActionItem[]; selected: number; onSelect: (i: number) => void }) {
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowDown") n = Math.min(actions.length - 1, i + 1);
    else if (e.key === "ArrowUp") n = Math.max(0, i - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return onSelect(i);
    } else return;
    e.preventDefault();
    onSelect(n);
    rows.current[n]?.focus();
  };
  return (
    <section className="card" aria-labelledby="actions-h">
      <div className="card-head">
        <h2 id="actions-h">Actions</h2>
        <span className="muted small">{actions.length ? "Select a row to see its evidence" : ""}</span>
      </div>
      {actions.length === 0 ? (
        <p className="card-body muted">No confirmed actions were extracted from these notes.</p>
      ) : (
        <div className="table-wrap">
          <table className="data" aria-label="Extracted actions">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Task</th>
                <th scope="col">Owner</th>
                <th scope="col">Due</th>
                <th scope="col" className="num">
                  Est.
                </th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr
                  key={a.action_id + i}
                  ref={(el) => {
                    rows.current[i] = el;
                  }}
                  className="selectable"
                  tabIndex={i === selected ? 0 : -1}
                  aria-selected={i === selected}
                  onClick={() => onSelect(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <td className="mono">{a.action_id}</td>
                  <td style={{ fontWeight: 540 }}>{a.task}</td>
                  <td>
                    {a.owner ?? <span className="muted">Unassigned</span>}
                    {a.owner_id && <div className="mono muted">{a.owner_id}</div>}
                  </td>
                  <td className="small">{a.due_text ?? <span style={{ color: "var(--unknown)" }}>Not stated</span>}</td>
                  <td className="num">{a.estimated_hours === null ? <span style={{ color: "var(--unknown)" }}>—</span> : fmtHours(a.estimated_hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DraftCard({ job }: { job: JobView }) {
  return (
    <section className="card" aria-labelledby="draft-h">
      <div className="card-head">
        <h2 id="draft-h">Follow-up draft</h2>
        <span className="badge">
          <IconLock width={12} height={12} /> Not sent
        </span>
      </div>
      <div className="card-body stack">
        {job.draft ? (
          <>
            <p className="small muted">{job.draft.label}</p>
            <div className="draft-subject">{job.draft.subject}</div>
            <div className="draft">{job.draft.body}</div>
          </>
        ) : (
          <p className="muted">No draft preview is available for this case.</p>
        )}
        {job.operational_readiness !== "READY" && (
          <p className="hint">Even if the draft reads well, it cannot move to approval while readiness is {READINESS_UI[job.operational_readiness].label.toLowerCase()}.</p>
        )}
      </div>
    </section>
  );
}

function highlight(notes: string, quote: string | null) {
  if (!quote) return [notes];
  const at = notes.indexOf(quote);
  if (at < 0) return [notes];
  return [notes.slice(0, at), <mark key="m">{quote}</mark>, notes.slice(at + quote.length)];
}

function EvidencePanel({ job, action, notes }: { job: JobView; action: ActionItem | null; notes: string | null }) {
  const ownerId = action?.owner_id ?? null;
  const recs = job.records.filter((r) => !ownerId || r.owner_id === ownerId);
  const calls = job.tool_evidence.filter((t) => !ownerId || t.args.owner_id === ownerId);
  const counted = new Set(job.workload.flatMap((w) => w.existing_commitment_ids));
  const notesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notesRef.current?.querySelector("mark")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [action]);

  if (!action) return <p className="muted">Select an action to see its evidence.</p>;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-label">From these meeting notes · {action.action_id}</span>
        {action.source_quote ? <blockquote className="quote">{action.source_quote}</blockquote> : <p className="muted">No source excerpt was returned for this action.</p>}
        {notes ? (
          <details>
            <summary className="small" style={{ cursor: "pointer", color: "var(--accent-ink)" }}>
              Show in your notes (this tab only — not stored)
            </summary>
            <div className="notes-view" ref={notesRef} style={{ marginTop: 8 }}>
              {highlight(notes, action.source_quote)}
            </div>
          </details>
        ) : (
          <p className="hint">Full notes are not kept by this app, so only the stored excerpt is shown.</p>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="section-label">
          <IconDatabase width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          Retrieved records{ownerId ? ` · ${ownerId}` : ""}
        </span>
        <p className="hint">Business context from the register — kept separate from facts in the notes.</p>
        {recs.length === 0 ? (
          <p className="muted small">{job.operational_readiness === "NOT_CHECKED" ? "No records were retrieved for this case." : "No matching records were returned."}</p>
        ) : (
          recs.map((r) => <RecordRow key={r.kind + r.id} r={r} counted={r.kind === "capacity" || counted.has(r.id)} />)
        )}
      </div>

      {job.mode === "LIVE" && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="section-label">Observed tool calls</span>
          {calls.length === 0 ? <p className="small" style={{ color: "var(--unknown)" }}>No tool call was recorded for this owner.</p> : calls.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>
      )}
    </div>
  );
}

function RecordRow({ r, counted }: { r: EvidenceRecord; counted: boolean }) {
  return (
    <div className={`record ${counted ? "" : "excluded"}`}>
      <div>
        <div className="row" style={{ gap: 6 }}>
          <code>{r.id}</code>
          <span className="badge" style={{ height: 18, fontSize: 11 }}>
            {r.kind === "capacity" ? "Capacity" : "Commitment"}
          </span>
          {!counted && (
            <span className="small muted" title="Completed, cancelled, unconfirmed or stale records are not counted.">
              not counted
            </span>
          )}
        </div>
        <div style={{ marginTop: 4 }}>{r.label ?? <span className="muted">No description</span>}</div>
      </div>
      <div style={{ fontWeight: 620, fontVariantNumeric: "tabular-nums" }}>{fmtHours(r.hours)}</div>
      <div className="meta">
        {r.status && <span>{r.status}</span>}
        {r.due_text && <span>· {r.due_text}</span>}
        <span title={r.updated_at ?? ""}>· updated {relTime(r.updated_at)}</span>
        {r.provenance && <span>· {r.provenance === "SYNTHETIC_DEMO" ? "synthetic" : r.provenance}</span>}
      </div>
    </div>
  );
}

function ToolRow({ t }: { t: ToolEvidence }) {
  const ok = t.outcome === "OK" || t.outcome === "EMPTY";
  return (
    <div className="record">
      <div>
        <div className="row" style={{ gap: 6 }}>
          <strong style={{ fontWeight: 600 }}>{t.tool}</strong>
          <Badge tone={ok ? "ready" : t.outcome === "TRUNCATED" ? "unknown" : "blocked"}>{t.outcome}</Badge>
        </div>
        <div className="small mono muted" style={{ marginTop: 4 }}>
          {Object.entries(t.args)
            .map(([k, v]) => `${k}=${v}`)
            .join("  ")}
        </div>
      </div>
      <div className="small muted">{t.result_count ?? "?"} rows</div>
      <div className="meta">
        <span>retrieved {fmtDate(t.retrieved_at)}</span>
        {t.max_source_updated_at && <span>· newest source update {relTime(t.max_source_updated_at)}</span>}
        {t.returned_ids.length > 0 && <span>· {t.returned_ids.join(", ")}</span>}
      </div>
    </div>
  );
}

function History({ job }: { job: JobView }) {
  type Ev = { at: string | null; label: string; detail?: string; tone: "ok" | "err" | "accent" | "" };
  const events: Ev[] = [];
  if (job.timestamps.accepted_at) events.push({ at: job.timestamps.accepted_at, label: "Accepted", tone: "accent" });
  if (job.timestamps.started_at) events.push({ at: job.timestamps.started_at, label: "Processing started", tone: "" });
  for (const r of job.review_history)
    events.push({ at: r.at, label: `Version ${r.version} reviewed — ${r.gate}`, detail: r.score !== null ? `Score ${r.score}/5` : undefined, tone: r.gate === "PASS" ? "ok" : r.gate === "TECHNICAL" ? "err" : "" });
  for (const t of job.tool_evidence)
    events.push({
      at: t.retrieved_at,
      label: `${t.tool}(${Object.values(t.args).join(", ")})`,
      detail: `${t.outcome} · ${t.result_count ?? "?"} rows${t.returned_ids.length ? " · " + t.returned_ids.join(", ") : ""}`,
      tone: t.outcome === "OK" || t.outcome === "EMPTY" ? "ok" : "err",
    });
  if (job.timestamps.finished_at) events.push({ at: job.timestamps.finished_at, label: `Finished — ${execLabel(job).label}`, tone: "ok" });
  events.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  return (
    <div className="stack" style={{ gap: 14 }}>
      {job.mode === "DEMO" && (
        <p className="small" style={{ color: "var(--unknown)" }}>
          Demo mode runs no agent, so there are no tool calls or review versions to show. Nothing below is simulated.
        </p>
      )}
      {events.length === 0 ? (
        <p className="muted">No execution events were recorded.</p>
      ) : (
        <ol className="timeline" aria-label="Recorded execution events">
          {events.map((e, i) => (
            <li key={i}>
              <span className={`tl-dot ${e.tone}`} />
              <div>
                <div style={{ fontWeight: 560 }} className={e.label.includes("(") ? "mono" : ""}>
                  {e.label}
                </div>
                <div className="small muted">
                  {fmtDate(e.at)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {job.review.scores && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="section-label">Latest rubric scores</span>
          <dl className="kv">
            {Object.entries(job.review.scores).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k.replace(/_/g, " ")}</dt>
                <dd style={{ fontVariantNumeric: "tabular-nums" }}>{v}/5</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
