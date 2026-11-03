"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { countBy, FILTER_LABEL, FILTERS, matchesFilter, matchesQuery, sortCases, type CaseFilter, type CaseRow, type CaseSort } from "@/lib/caseList";
import { APPROVAL, EXECUTION, READINESS, REVIEW, type StatusDef } from "@/lib/status";
import { fmtPeriod } from "@/lib/present";
import { RelTime } from "@/components/Time";
import { ModeBadge } from "@/components/Badges";
import { StatusBadge } from "@/components/StatusBadge";
import { IconAlert, IconPlus, IconSearch } from "@/components/Icons";

const lookup = <T extends Record<string, StatusDef>>(table: T, key: string, fallback: StatusDef): StatusDef => (table as Record<string, StatusDef>)[key] ?? fallback;

/** Searchable, filterable list of cases submitted through this app. Pure client-side; no network. */
export function CaseList({ rows, disconnected, temporaryHistory = false }: { rows: CaseRow[]; disconnected: boolean; temporaryHistory?: boolean }) {
  const historyNote = temporaryHistory
    ? "This deployment keeps case history in temporary server storage, so it can reset at any time. Cases from other environments are not shown here."
    : null;
  const ids = { q: useId(), sort: useId() };
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CaseFilter>("ALL");
  const [sort, setSort] = useState<CaseSort>("attention");
  const counts = useMemo(() => countBy(rows), [rows]);
  const shown = useMemo(() => sortCases(rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, q)), sort), [rows, filter, q, sort]);

  const stats: { n: number; l: string; tone: string | null; f: CaseFilter }[] = [
    { n: counts.cases, l: "Cases", tone: null, f: "ALL" },
    { n: counts.ready, l: "Ready", tone: "ready", f: "READY" },
    { n: counts.blocked, l: "Blocked", tone: "blocked", f: "BLOCKED" },
    { n: counts.unknown, l: "Unknown", tone: "unknown", f: "UNKNOWN" },
    { n: counts.inProgress, l: "In progress", tone: "accent", f: "IN_PROGRESS" },
    { n: counts.awaiting, l: "Awaiting approval", tone: null, f: "AWAITING_APPROVAL" },
  ];

  if (rows.length === 0)
    return (
      <section className="card">
        <div className="empty">
          <div className="icon">
            <IconPlus />
          </div>
          <h2>No meetings yet</h2>
          <p className="muted" style={{ maxWidth: 460 }}>
            {disconnected
              ? "The n8n connection is not configured, so no live meetings can be submitted yet."
              : "Paste meeting notes with an explicit planning period. ActionReady checks each new commitment against the register and recorded capacity before anything moves forward."}
          </p>
          {historyNote && (
            <p className="small muted" style={{ maxWidth: 460 }}>
              {historyNote}
            </p>
          )}
          {!disconnected && (
            <div className="row" style={{ justifyContent: "center", marginTop: 4 }}>
              <Link href="/meetings/new" className="btn primary">
                New meeting
              </Link>
              <Link href="/meetings/new?example=overload" className="btn">
                Load the synthetic overload example
              </Link>
            </div>
          )}
        </div>
      </section>
    );

  return (
    <>
      <section className="stat-strip" aria-label="Case counts (cases listed here only)">
        {stats.map((s) => (
          <button
            key={s.l}
            type="button"
            className={`stat ${filter === s.f ? "active" : ""}`}
            aria-pressed={filter === s.f}
            onClick={() => setFilter(filter === s.f ? "ALL" : s.f)}
          >
            <span className="n num">{s.n}</span>
            <span className="l">
              {s.tone && <span className="swatch dot" style={{ background: `var(--${s.tone})` }} aria-hidden />}
              {s.l}
            </span>
          </button>
        ))}
      </section>

      <section className="card" aria-labelledby="recent-h">
        <div className="card-head wrap">
          <h2 id="recent-h">Recent cases</h2>
          <div className="toolbar">
            <label htmlFor={ids.q} className="sr-only">
              Search cases
            </label>
            <div className="search">
              <IconSearch width={14} height={14} aria-hidden />
              <input id={ids.q} className="input" type="search" placeholder="Search title, case ID or reason" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label htmlFor={ids.sort} className="sr-only">
              Sort cases
            </label>
            <select id={ids.sort} className="select" value={sort} onChange={(e) => setSort(e.target.value as CaseSort)}>
              <option value="attention">Needs attention first</option>
              <option value="updated">Recently updated</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>
        <div className="filter-row" role="group" aria-label="Filter cases">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status">
          {shown.length} of {rows.length} cases shown
        </p>
        {shown.length === 0 ? (
          <div className="empty">
            <h2>No matching cases</h2>
            <p className="muted">Nothing matches this search or filter. Official results are unchanged.</p>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setQ("");
                setFilter("ALL");
              }}
            >
              Clear search and filter
            </button>
          </div>
        ) : (
          <ul className="case-list">
            {shown.map((r) => (
              <CaseItem key={r.job_id} r={r} />
            ))}
          </ul>
        )}
        <p className="card-foot hint">
          Counts include only cases submitted through this app. Older chat-path cases live in the n8n report.{historyNote && " " + historyNote}
        </p>
      </section>
    </>
  );
}

function CaseItem({ r }: { r: CaseRow }) {
  const exec = lookup(EXECUTION, r.execution, EXECUTION.UNKNOWN);
  const done = r.execution === "SUCCEEDED";
  const attention = r.readiness === "BLOCKED" || r.readiness === "UNKNOWN" || r.execution === "FAILED" || r.execution === "STALE" || r.review === "TECHNICAL_REVIEW";
  return (
    <li className={`case-item ${r.readiness === "BLOCKED" || r.execution === "FAILED" ? "attn-blocked" : attention ? "attn-unknown" : ""}`}>
      <div className="case-main">
        <Link href={`/cases/${r.job_id}`} className="row-link">
          {r.title}
        </Link>
        <div className="row" style={{ gap: 6 }}>
          <ModeBadge mode={r.mode} />
          {r.case_id && <code className="muted">{r.case_id}</code>}
          <span className="small muted" title={r.updated_at}>
            Updated <RelTime iso={r.updated_at} />
          </span>
          {r.period && <span className="small muted">· {fmtPeriod(r.period)}</span>}
        </div>
        {r.reason ? <p className="case-reason">{r.reason}</p> : <p className="case-reason muted">{exec.description}</p>}
        {r.refresh_error && (
          <p className="small" style={{ color: "var(--unknown)" }}>
            <IconAlert width={12} height={12} style={{ verticalAlign: -2 }} /> Showing the last known state: {r.refresh_error}
          </p>
        )}
      </div>
      <dl className="case-statuses">
        <div>
          <dt>Execution</dt>
          <dd>
            <StatusBadge def={exec} />
          </dd>
        </div>
        <div>
          <dt>AI review</dt>
          <dd>{done ? <StatusBadge def={lookup(REVIEW, r.review, REVIEW.PENDING)} /> : <span className="muted small">—</span>}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{done ? <StatusBadge def={lookup(READINESS, r.readiness, READINESS.NOT_CHECKED)} /> : <span className="muted small">—</span>}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>
            <StatusBadge def={lookup(APPROVAL, r.approval, APPROVAL.UNKNOWN)} />
          </dd>
        </div>
      </dl>
    </li>
  );
}
