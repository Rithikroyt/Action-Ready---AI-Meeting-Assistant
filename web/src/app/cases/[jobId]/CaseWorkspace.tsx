"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionItem, EvidenceRecord, Issue, JobView, ToolEvidence } from "@/lib/contract";
import { isFinal } from "@/lib/contract";
import { fmtHours, fmtPeriod } from "@/lib/present";
import { LocalTime, RelTime } from "@/components/Time";
import { approvalStatus, executionStatus, officialScore, readinessStatus, reviewInvalidated, reviewStatus } from "@/lib/status";
import { deriveDecision, ownerName } from "@/lib/decision";
import { recallNotes } from "@/lib/sessionNotes";
import { Badge, ModeBadge } from "@/components/Badges";
import { StatusBadge, StatusSummary } from "@/components/StatusBadge";
import { DecisionCard } from "@/components/DecisionCard";
import { IconAlert, IconDatabase, IconHelp, IconLock, IconRefresh } from "@/components/Icons";
import { WorkloadBar, workloadFormulas } from "@/components/WorkloadBar";
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

  // A clock for "elapsed" / "last checked" text only; it stops once the job is final.
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [finished]);

  if (load.k === "not_found") {
    return (
      <div className="card">
        <div className="empty">
          <div className="icon">
            <IconHelp />
          </div>
          <h1 style={{ fontSize: 18 }}>Case not found</h1>
          <p className="muted">This job does not exist for your account, or it has expired from the workflow. Nothing was changed.</p>
          <Link href="/" className="btn">
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <CaseHeader job={job} />

      {load.k === "unavailable" && (
        <div className="banner error" role="alert">
          <IconAlert />
          <span>
            <strong>Disconnected.</strong> {load.message}{" "}
            {job ? "Showing the last state this app received — it may be out of date." : "No result has been received yet."}
          </span>
        </div>
      )}

      {!job ? (
        <Processing job={null} pollingActive={pollingActive} polls={polls} onCheck={check} checking={checking} checkedAt={load.checkedAt} now={now} />
      ) : !finished ? (
        <Processing job={job} pollingActive={pollingActive} polls={polls} onCheck={check} checking={checking} checkedAt={load.checkedAt} now={now} />
      ) : job.execution_status === "FAILED" ? (
        <>
          <DecisionCard decision={deriveDecision(job)} reasons={[]} questions={[]} />
          <div>
            <Link className="btn" href="/meetings/new">
              Start a new meeting
            </Link>
          </div>
          <TechnicalDetails job={job} jobId={jobId} />
        </>
      ) : (
        <Result job={job} jobId={jobId} />
      )}
    </>
  );
}

function CaseHeader({ job }: { job: JobView | null }) {
  const exec = job ? executionStatus(job) : null;
  return (
    <div className="case-head">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Overview</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">Case</span>
      </nav>
      <h1>{job?.meeting_title ?? (job?.case_id ? `Case ${job.case_id}` : "Meeting analysis")}</h1>
      <div className="case-meta">
        {job && <ModeBadge mode={job.mode} />}
        {job?.case_id && <code className="case-id">{job.case_id}</code>}
        {exec && <StatusBadge def={exec} />}
        {job?.version !== null && job?.version !== undefined && (
          <span className="small muted">
            Official version <span className="num">v{job.version}</span>
            {job.max_versions ? ` of ${job.max_versions}` : ""}
          </span>
        )}
        {job?.period && <span className="small muted">{fmtPeriod(job.period)}</span>}
        {job?.timestamps.updated_at && (
          <span className="small muted" title={job.timestamps.updated_at}>
            Updated <RelTime iso={job.timestamps.updated_at} />
          </span>
        )}
      </div>
    </div>
  );
}

function elapsed(fromIso: string | null, now: number) {
  const t = Date.parse(fromIso ?? "");
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Processing({
  job,
  pollingActive,
  polls,
  onCheck,
  checking,
  checkedAt,
  now,
}: {
  job: JobView | null;
  pollingActive: boolean;
  polls: number;
  onCheck: () => void;
  checking: boolean;
  checkedAt: number;
  now: number;
}) {
  const exec = job ? executionStatus(job) : null;
  const since = job ? elapsed(job.timestamps.accepted_at, now) : null;
  return (
    <section className="card" aria-labelledby="proc-h">
      <div className="card-head">
        <div className="row">
          {exec ? <StatusBadge def={exec} size="lg" /> : <span className="pulse" aria-hidden />}
          <h2 id="proc-h" className="sr-only">
            Processing status
          </h2>
        </div>
        <button className="btn sm" onClick={onCheck} disabled={checking}>
          <IconRefresh width={14} height={14} /> {checking ? "Checking…" : "Check status now"}
        </button>
      </div>
      <div className="card-body stack" aria-live="polite">
        {job?.stale ? (
          <div className="banner warn">
            <IconAlert />
            <span>
              No update has been recorded for over 10 minutes. The analysis may have stopped. This is <strong>not</strong> reported as a success or a failure.
              Check the n8n execution log before resubmitting.
            </span>
          </div>
        ) : !pollingActive && polls > 0 ? (
          <div className="banner warn">
            <IconAlert />
            <span>
              Automatic checks paused after {polls} attempts. The workflow may still be running; use “Check status now”. The meeting is never resubmitted
              automatically.
            </span>
          </div>
        ) : (
          <p>{job ? "ActionReady is analyzing the meeting and checking the stored result." : "Waiting for the first status from the workflow."}</p>
        )}
        <dl className="kv">
          <dt>Accepted</dt>
          <dd>{job?.timestamps.accepted_at ? <LocalTime iso={job.timestamps.accepted_at} /> : "Not yet recorded"}</dd>
          <dt>Processing started</dt>
          <dd>{job?.timestamps.started_at ? <LocalTime iso={job.timestamps.started_at} /> : "Not yet recorded"}</dd>
          {since && (
            <>
              <dt>Elapsed</dt>
              <dd className="num">{since}</dd>
            </>
          )}
          <dt>Last checked</dt>
          <dd>
            <RelTime iso={new Date(checkedAt).toISOString()} now={now} />
          </dd>
        </dl>
        <p className="hint">Only states the workflow records are shown — there is no estimated progress.</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Result({ job, jobId }: { job: JobView; jobId: string }) {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"evidence" | "workload" | "history">("evidence");
  const notes = useMemo(() => recallNotes(jobId), [jobId]);
  const decision = useMemo(() => deriveDecision(job), [job]);
  const action = job.actions[selected] ?? null;
  const reasons = job.issues.filter((i) => i.severity === "BLOCKING" || i.severity === "UNKNOWN");
  const notices = job.issues.filter((i) => i.severity === "NOTICE");
  const review = reviewStatus(job);
  const score = officialScore(job);
  const invalid = reviewInvalidated(job);

  const selectAction = (i: number) => {
    setSelected(i);
    setTab("evidence");
  };

  return (
    <>
      <StatusSummary
        items={[
          {
            def: review,
            suffix: score !== null ? ` · ${score.toFixed(1)}/5` : undefined,
            note: score !== null ? `Reviewer rubric score: ${score.toFixed(1)} / 5 — a rubric, not a probability of correctness. Not human approval.` : review.description,
          },
          { def: readinessStatus(job.operational_readiness) },
          { def: approvalStatus(job) },
        ]}
      />

      <DecisionCard decision={decision} reasons={reasons} questions={job.clarification_questions} />

      <WorkloadSection job={job} />

      <div className="workspace">
        <ActionList job={job} selected={selected} onSelect={selectAction} invalid={invalid} />
        <DraftPanel job={job} invalid={invalid} />
      </div>

      <section className="card" aria-label="Case details">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "evidence", label: "Evidence" },
            { id: "workload", label: "Workload", count: job.workload.length || undefined },
            { id: "history", label: "Review history", count: job.review_history.length || undefined },
          ]}
        />
        <div className="tabpanel fade-in" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} key={tab}>
          {tab === "evidence" && <EvidencePanel job={job} action={action} notes={notes} />}
          {tab === "workload" && <WorkloadDetail job={job} />}
          {tab === "history" && <History job={job} />}
        </div>
      </section>

      <WhatIf job={job} />

      {notices.length > 0 && (
        <details className="card disclosure">
          <summary>
            {notices.length} non-blocking note{notices.length > 1 ? "s" : ""}
          </summary>
          <ul className="issue-list disclosure-body">
            {notices.map((i, n) => (
              <li key={n}>
                <span className="issue-sev notice">Note</span>
                <span className="small">
                  {i.message} <code className="muted">{i.code}</code>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <TechnicalDetails job={job} jobId={jobId} />
    </>
  );
}

function WorkloadSection({ job }: { job: JobView }) {
  return (
    <section className="card" aria-labelledby="wl-h">
      <div className="card-head">
        <h2 id="wl-h">Workload calculation</h2>
        <span className="muted small">Official result · deterministic workflow check</span>
      </div>
      <div className="card-body stack" style={{ gap: 24 }}>
        {job.workload.length === 0 ? (
          <p className="muted">
            {job.operational_readiness === "NOT_CHECKED"
              ? "Commitment and capacity checks did not run for this result, so no workload was calculated."
              : "No owner workload was returned for this result. See the recorded reasons above."}
          </p>
        ) : (
          job.workload.map((w) => <WorkloadBar key={w.owner_id} w={w} name={ownerName(job, w.owner_id)} />)
        )}
      </div>
    </section>
  );
}

function UnvalidatedNote({ job }: { job: JobView }) {
  return (
    <div className="banner warn" role="note">
      <IconAlert />
      <span>
        <strong>Unvalidated version{job.version ? ` v${job.version}` : ""}.</strong> The review gate did not accept this version. These items may include content
        that is not supported by the meeting notes — check the evidence before relying on them.
      </span>
    </div>
  );
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    else return;
    e.preventDefault();
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

function ActionList({ job, selected, onSelect, invalid }: { job: JobView; selected: number; onSelect: (i: number) => void; invalid: boolean }) {
  const actions = job.actions;
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
  const unspecified = <span className="unknown-val">Not specified</span>;
  return (
    <section className="card" aria-labelledby="actions-h">
      <div className="card-head">
        <h2 id="actions-h">Extracted actions</h2>
        <span className="muted small">{actions.length ? "Select an action to see its evidence" : ""}</span>
      </div>
      {invalid && (
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <UnvalidatedNote job={job} />
        </div>
      )}
      {actions.length === 0 ? (
        <p className="card-body muted">No confirmed actions were extracted from these notes.</p>
      ) : (
        <div className="table-wrap">
          <table className="data actions-table" aria-label="Extracted actions">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Task</th>
                <th scope="col">Owner</th>
                <th scope="col">Due</th>
                <th scope="col" className="num">
                  Est.
                </th>
                <th scope="col">Evidence</th>
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
                  <td data-label="ID" className="mono">
                    {a.action_id}
                  </td>
                  <td data-label="Task" style={{ fontWeight: 540 }}>
                    {a.task}
                  </td>
                  <td data-label="Owner">{a.owner ?? unspecified}</td>
                  <td data-label="Due" className="small">
                    {a.due_text ?? unspecified}
                  </td>
                  <td data-label="Est." className="num">
                    {a.estimated_hours === null ? unspecified : fmtHours(a.estimated_hours)}
                  </td>
                  <td data-label="Evidence" className="small">
                    {a.source_quote ? <Badge tone="ready">Excerpt</Badge> : <span className="unknown-val">Not available</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DraftPanel({ job, invalid }: { job: JobView; invalid: boolean }) {
  const review = reviewStatus(job);
  const label =
    job.mode === "DEMO"
      ? "Synthetic sample draft — not sent"
      : invalid
        ? "Draft — not validated, not sent"
        : job.review.state === "PASSED"
          ? "Reviewed draft — not sent"
          : "Draft — not sent";
  return (
    <section className="card" aria-labelledby="draft-h">
      <div className="card-head">
        <h2 id="draft-h">{label}</h2>
        <span className="badge">
          <IconLock width={12} height={12} /> Not sent
        </span>
      </div>
      <div className="card-body stack">
        <div className="row small muted">
          {job.version !== null && <span className="num">Version v{job.version}</span>}
          <StatusBadge def={review} />
        </div>
        {invalid && <UnvalidatedNote job={job} />}
        {job.draft ? (
          <>
            <div className="draft-subject">{job.draft.subject}</div>
            <div className="draft">{job.draft.body}</div>
          </>
        ) : (
          <p className="muted">No draft preview is available for this case.</p>
        )}
        {job.operational_readiness !== "READY" && (
          <p className="hint">Even if the draft reads well, it cannot move to approval while operational readiness is {readinessStatus(job.operational_readiness).label.toLowerCase()}.</p>
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

const TOOL_LABEL: Record<string, string> = {
  Commitment_Register: "Existing commitments",
  Capacity_Lookup: "Recorded capacity",
};

function EvidencePanel({ job, action, notes }: { job: JobView; action: ActionItem | null; notes: string | null }) {
  const ownerId = action?.owner_id ?? (action?.owner ? action.owner.toLowerCase() : null);
  const recs = job.records.filter((r) => !ownerId || !r.owner_id || r.owner_id.toLowerCase() === ownerId.toLowerCase());
  const calls = job.tool_evidence.filter((t) => !ownerId || !t.args.owner_id || t.args.owner_id.toLowerCase() === ownerId.toLowerCase());
  const counted = new Set(job.workload.flatMap((w) => w.existing_commitment_ids));
  const idOnly = recs.length > 0 && recs.every((r) => r.id_only);
  const notesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notesRef.current?.querySelector("mark")?.scrollIntoView({ block: "nearest" });
  }, [action]);

  if (!action) return <p className="muted">Select an action to see its evidence.</p>;
  const toolNames = ["Commitment_Register", "Capacity_Lookup"];

  return (
    <div className="evidence-grid">
      <div className="stack" style={{ gap: 8 }}>
        <h3 className="section-label">Meeting evidence · {action.action_id}</h3>
        <p className="small muted">Supports: {action.task}</p>
        {action.source_quote ? (
          <blockquote className="quote">{action.source_quote}</blockquote>
        ) : (
          <p className="small">
            <span className="unknown-val">No source excerpt was returned for this action.</span> The excerpt check still ran in the workflow; this response just
            does not include the text.
          </p>
        )}
        {notes ? (
          <details>
            <summary className="small link">Show in your notes (this tab only — not stored)</summary>
            <div className="notes-view" ref={notesRef} style={{ marginTop: 8 }}>
              {highlight(notes, action.source_quote)}
            </div>
          </details>
        ) : (
          <p className="hint">Full notes are not kept by this app.</p>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3 className="section-label">
          <IconDatabase width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          Business context{ownerId ? ` · ${ownerName(job, ownerId)}` : ""}
        </h3>
        <p className="hint">Pre-existing records from the register — kept separate from facts in the notes.</p>
        {recs.length === 0 ? (
          <p className="small muted">{job.operational_readiness === "NOT_CHECKED" ? "No records were retrieved for this case." : "No matching records were returned."}</p>
        ) : (
          <>
            {idOnly && <p className="small unknown-val">Record detail is limited in this response — only record IDs were returned.</p>}
            {recs.map((r) => (
              <RecordRow key={r.kind + r.id} r={r} counted={r.id_only ? null : r.kind === "capacity" || counted.has(r.id)} />
            ))}
          </>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3 className="section-label">Tool evidence</h3>
        {job.mode === "DEMO" ? (
          <p className="small unknown-val">Synthetic demo: no agent ran, so there are no tool calls. Nothing here is simulated.</p>
        ) : (
          <ul className="tool-list">
            <li>
              <span className="tool-name">Source_Evidence</span>
              <span className="small muted">Not reported in this response</span>
            </li>
            {toolNames.map((name) => {
              const c = calls.filter((t) => t.tool === name);
              const last = c[c.length - 1];
              return (
                <li key={name}>
                  <span className="tool-name">{name}</span>
                  <span className="small muted">{TOOL_LABEL[name]}</span>
                  {!last ? (
                    <Badge tone="unknown">No call recorded</Badge>
                  ) : last.outcome === "OK" ? (
                    <Badge tone="ready">Called · {last.result_count ?? "?"} record{last.result_count === 1 ? "" : "s"}</Badge>
                  ) : last.outcome === "EMPTY" ? (
                    <Badge tone="neutral">Called · empty</Badge>
                  ) : (
                    <Badge tone="blocked">{last.outcome === "TRUNCATED" ? "Truncated" : "Error"}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {calls.length > 0 && (
          <details className="disclosure-inline">
            <summary className="small link">Technical call detail</summary>
            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
              {calls.map((t, i) => (
                <ToolRow key={i} t={t} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function RecordRow({ r, counted }: { r: EvidenceRecord; counted: boolean | null }) {
  return (
    <div className={`record ${counted === false ? "excluded" : ""}`}>
      <div>
        <div className="row" style={{ gap: 6 }}>
          <code>{r.id}</code>
          <span className="badge" style={{ height: 18, fontSize: 11 }}>
            {r.kind === "capacity" ? "Capacity" : "Commitment"}
          </span>
          {counted === false && (
            <span className="small muted" title="Completed, cancelled, unconfirmed or stale records are not counted.">
              not counted
            </span>
          )}
        </div>
        {(r.label || !r.id_only) && <div style={{ marginTop: 4 }}>{r.label ?? <span className="muted">No description</span>}</div>}
      </div>
      <div className="num" style={{ fontWeight: 620 }}>
        {r.hours === null ? <span className="unknown-val small">—</span> : fmtHours(r.hours)}
      </div>
      {!r.id_only && (
        <div className="meta">
          {r.status && <span>{r.status}</span>}
          {r.due_text && <span>· {r.due_text}</span>}
          {r.updated_at && (
            <span>
              · updated <RelTime iso={r.updated_at} />
            </span>
          )}
          {r.provenance && <span>· {r.provenance === "SYNTHETIC_DEMO" ? "synthetic" : r.provenance}</span>}
        </div>
      )}
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
        {Object.keys(t.args).length > 0 && (
          <div className="small mono muted" style={{ marginTop: 4 }}>
            {Object.entries(t.args)
              .map(([k, v]) => `${k}=${v}`)
              .join("  ")}
          </div>
        )}
      </div>
      <div className="small muted num">{t.result_count ?? "?"} rows</div>
      <div className="meta">
        <span>
          {t.retrieved_at ? (
            <>
              retrieved <LocalTime iso={t.retrieved_at} />
            </>
          ) : t.retrieved_note ? (
            `retrieved ${t.retrieved_note}`
          ) : (
            "retrieval time not reported"
          )}
        </span>
        {t.max_source_updated_at && (
          <span>
            · newest source update <RelTime iso={t.max_source_updated_at} />
          </span>
        )}
        {t.returned_ids.length > 0 && <span>· {t.returned_ids.join(", ")}</span>}
      </div>
    </div>
  );
}

function WorkloadDetail({ job }: { job: JobView }) {
  if (job.workload.length === 0) return <p className="muted">No owner workload was calculated for this result.</p>;
  return (
    <div className="stack" style={{ gap: 28 }}>
      {job.workload.map((w) => {
        const name = ownerName(job, w.owner_id);
        const commitments = job.records.filter((r) => r.kind === "commitment" && (!r.owner_id || r.owner_id.toLowerCase() === w.owner_id.toLowerCase()));
        const mine = job.actions.filter((a) => (a.owner_id ?? a.owner ?? "").toLowerCase() === w.owner_id.toLowerCase());
        const reasons: Issue[] = job.issues.filter((i) => i.severity !== "NOTICE" && (!i.owner_id || i.owner_id.toLowerCase() === w.owner_id.toLowerCase()));
        return (
          <div key={w.owner_id} className="stack" style={{ gap: 12 }}>
            <h3 style={{ fontSize: 15 }}>{name}</h3>
            <div className="two">
              <div className="stack" style={{ gap: 6 }}>
                <span className="section-label">Existing commitments</span>
                {commitments.length === 0 ? (
                  <p className="small muted">None returned.</p>
                ) : (
                  <ul className="plain-list small">
                    {commitments.map((c) => (
                      <li key={c.id}>
                        <code>{c.id}</code> {c.label ?? (c.id_only ? <span className="unknown-val">detail not included</span> : null)}{" "}
                        {c.hours !== null && <span className="num">· {fmtHours(c.hours)} remaining</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="section-label">New proposed work</span>
                {mine.length === 0 ? (
                  <p className="small muted">None attributed to this owner.</p>
                ) : (
                  <ul className="plain-list small">
                    {mine.map((a) => (
                      <li key={a.action_id}>
                        <code>{a.action_id}</code> {a.task} ·{" "}
                        <span className="num">{a.estimated_hours === null ? <span className="unknown-val">no estimate</span> : fmtHours(a.estimated_hours)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {workloadFormulas(w).length > 0 && (
              <ul className="formulas">
                {workloadFormulas(w).map((f) => (
                  <li key={f} className="mono">
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <span className="section-label">Readiness reason</span>
              {reasons.length === 0 ? (
                <p className="small muted">{w.status === "WITHIN" ? "Within recorded project capacity." : "No owner-specific reason was recorded."}</p>
              ) : (
                <ul className="plain-list small">
                  {reasons.map((i, n) => (
                    <li key={n}>
                      {i.message} <code className="muted">{i.code}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="hint">Recorded project capacity only — not every project or calendar this person works on.</p>
          </div>
        );
      })}
    </div>
  );
}

function History({ job }: { job: JobView }) {
  const versions = [...job.review_history].sort((a, b) => a.version - b.version);
  return (
    <div className="stack" style={{ gap: 14 }}>
      {job.mode === "DEMO" && (
        <p className="small unknown-val">Synthetic demo: no agent ran, so there are no review versions to show. Nothing below is simulated.</p>
      )}
      {versions.length === 0 ? (
        <p className="muted">No review events were recorded for this case.</p>
      ) : (
        <ol className="timeline" aria-label="Recorded review versions">
          {versions.map((r) => {
            const pass = r.gate === "PASS";
            const tone = pass ? "ok" : r.gate === "TECHNICAL" || r.gate === "STOP" ? "err" : "";
            const gateLabel =
              { PASS: "Passed the review gate", REVISE: "Revision requested", CLARIFY: "Clarification needed", STOP: "Revision limit reached", TECHNICAL: "Technical stop — reviewer result not validated" }[
                r.gate
              ] ?? r.gate;
            return (
              <li key={r.version}>
                <span className={`tl-dot ${tone}`} />
                <div>
                  <div style={{ fontWeight: 580 }}>
                    Version {r.version} · {gateLabel}
                  </div>
                  <div className="small muted">
                    <LocalTime iso={r.at} />
                    {pass && r.score !== null ? ` · Reviewer rubric score ${r.score.toFixed(1)} / 5` : !pass ? " · No valid score (version not accepted)" : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {job.timestamps.finished_at && (
        <p className="small muted">
          Analysis finished <LocalTime iso={job.timestamps.finished_at} /> — {executionStatus(job).label.toLowerCase()}.
        </p>
      )}
      <p className="hint">Rubric scores describe the reviewer&apos;s assessment of the draft. They are not a probability of correctness and not human approval.</p>
    </div>
  );
}

function TechnicalDetails({ job, jobId }: { job: JobView; jobId: string }) {
  return (
    <details className="card disclosure">
      <summary>Technical details</summary>
      <dl className="kv disclosure-body">
        <dt>Job ID</dt>
        <dd className="mono">{jobId}</dd>
        <dt>Case ID</dt>
        <dd className="mono">{job.case_id ?? "Not assigned"}</dd>
        <dt>Data source</dt>
        <dd>{job.mode === "LIVE" ? "Live n8n workflow" : "Synthetic demo (local readiness rules)"}</dd>
        <dt>Schema version</dt>
        <dd className="mono">{job.schema_version}</dd>
        <dt>Accepted</dt>
        <dd>
          <LocalTime iso={job.timestamps.accepted_at} />
        </dd>
        <dt>Finished</dt>
        <dd>
          <LocalTime iso={job.timestamps.finished_at} />
        </dd>
        {job.error && (
          <>
            <dt>Error code</dt>
            <dd className="mono">{job.error.code}</dd>
          </>
        )}
        {job.provenance_note && (
          <>
            <dt>Provenance</dt>
            <dd>{job.provenance_note}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
