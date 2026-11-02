import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ApprovalBadge, Badge, ModeBadge, ReadinessBadge, ReviewBadge } from "@/components/Badges";
import { IconAlert, IconPlus } from "@/components/Icons";
import { requireSession, OWNER } from "@/lib/session";
import { overview } from "@/lib/service";
import { execLabel, fmtPeriod, relTime } from "@/lib/present";
import type { Readiness } from "@/lib/contract";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  await requireSession();
  const rows = await overview(OWNER);
  const finished = rows.filter((r) => r.view?.execution_status === "SUCCEEDED");
  const count = (r: Readiness) => finished.filter((x) => x.view?.operational_readiness === r).length;
  const inFlight = rows.filter((r) => r.view && (r.view.execution_status === "ACCEPTED" || r.view.execution_status === "RUNNING") && !r.view.stale).length;
  const awaiting = rows.filter((r) => r.view?.approval_status === "REQUESTED").length;

  const stats = [
    { n: rows.length, l: "Cases", tone: null },
    { n: count("READY"), l: "Ready", tone: "ready" },
    { n: count("BLOCKED"), l: "Blocked", tone: "blocked" },
    { n: count("UNKNOWN"), l: "Unknown", tone: "unknown" },
    { n: inFlight, l: "In progress", tone: "accent" },
    { n: awaiting, l: "Awaiting approval", tone: null },
  ] as const;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">Meetings submitted from this app, with review, readiness and approval kept separate.</p>
        </div>
        <Link href="/meetings/new" className="btn primary">
          <IconPlus />
          New meeting
        </Link>
      </div>

      <section className="stat-strip" aria-label="Case counts">
        {stats.map((s) => (
          <div className="stat" key={s.l}>
            <span className="n">{s.n}</span>
            <span className="l">
              {s.tone && <span className={`swatch`} style={{ background: `var(--${s.tone === "accent" ? "accent" : s.tone})`, borderRadius: 999, width: 7, height: 7 }} />}
              {s.l}
            </span>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="recent-h">
        <div className="card-head">
          <h2 id="recent-h">Recent cases</h2>
          <span className="muted small">Counts come only from cases listed here. Older chat-path cases live in the n8n report.</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon">
              <IconPlus />
            </div>
            <h2>No meetings yet</h2>
            <p className="muted" style={{ maxWidth: 420 }}>
              Paste meeting notes with an explicit planning period. ActionReady checks each new commitment against the register and recorded capacity.
            </p>
            <div className="row" style={{ justifyContent: "center", marginTop: 4 }}>
              <Link href="/meetings/new" className="btn primary">
                New meeting
              </Link>
              <Link href="/meetings/new?example=overload" className="btn">
                Load the synthetic overload example
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Meeting</th>
                  <th scope="col">Period</th>
                  <th scope="col">AI review</th>
                  <th scope="col">Readiness</th>
                  <th scope="col">Approval</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = r.view;
                  const done = v?.execution_status === "SUCCEEDED";
                  const exec = v ? execLabel(v) : null;
                  return (
                    <tr key={r.job_id}>
                      <td>
                        <div className="stack" style={{ gap: 4 }}>
                          <Link href={`/cases/${r.job_id}`} className="row-link">
                            {v?.meeting_title ?? (v?.case_id ? `Case ${v.case_id}` : "Untitled meeting")}
                          </Link>
                          <div className="row" style={{ gap: 6 }}>
                            <ModeBadge mode={r.mode} />
                            <span className="mono muted">{v?.case_id ?? r.job_id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="small">{fmtPeriod(r.period)}</td>
                      <td>{done && v ? <ReviewBadge value={v.review.state} score={v.review.score} /> : exec ? <Badge tone={exec.tone}>{exec.label}</Badge> : <Badge>Unknown</Badge>}</td>
                      <td>{done && v ? <ReadinessBadge value={v.operational_readiness} /> : <span className="muted">—</span>}</td>
                      <td>{v ? <ApprovalBadge value={v.approval_status} /> : <span className="muted">—</span>}</td>
                      <td className="small muted">
                        {relTime(r.submitted_at)}
                        {r.refresh_error && (
                          <div className="row" style={{ color: "var(--unknown)", gap: 4, marginTop: 2 }} title={r.refresh_error}>
                            <IconAlert width={13} height={13} /> stale view
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
