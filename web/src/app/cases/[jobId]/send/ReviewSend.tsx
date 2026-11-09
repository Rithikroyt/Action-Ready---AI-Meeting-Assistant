"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import type { JobView } from "@/lib/contract";
import type { DispatchOutcome, TrackerOutcome } from "@/lib/n8n";
import { approvalStatus, readinessStatus, reviewStatus } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { IconAlert, IconCheckCircle, IconLock, IconX } from "@/components/Icons";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

type Result = { kind: "outcome"; o: DispatchOutcome } | { kind: "error"; message: string };
interface DraftItem {
  key: string;
  /** null = the team summary draft. */
  employee: string | null;
  label: string;
  meta: string;
  subject: string;
  body: string;
}
interface DraftState {
  recipients: string[];
  input: string;
  inputErr: string | null;
  result: Result | null;
}
const EMPTY: DraftState = { recipients: [], input: "", inputErr: null, result: null };

/**
 * Exact-message approval, one draft at a time: a fixed-template draft per action owner plus the team summary.
 * The text shown is the workflow's stored text; the server sends exactly that text after n8n re-checks every rule.
 * `blocked` (a reason) turns the page into a read-only preview — nothing can be sent.
 */
export function ReviewSend({ job, blocked }: { job: JobView; blocked: string | null }) {
  const ids = { input: useId(), consent: useId() };
  const toast = useToast();
  const drafts = useMemo<DraftItem[]>(() => {
    const list: DraftItem[] = job.employee_drafts.map((d) => ({
      key: `emp:${d.employee.toLowerCase()}`,
      employee: d.employee,
      label: d.employee,
      meta: `${d.action_count} action item${d.action_count === 1 ? "" : "s"}`,
      subject: d.subject,
      body: d.body,
    }));
    if (job.draft) list.push({ key: "team", employee: null, label: "Team summary", meta: "Whole plan, one message", subject: job.draft.subject, body: job.draft.body });
    return list;
  }, [job]);
  const [activeKey, setActiveKey] = useState(drafts[0]?.key ?? "");
  const [states, setStates] = useState<Record<string, DraftState>>({});
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tracker, setTracker] = useState<TrackerOutcome | null>(null);
  const [syncing, setSyncing] = useState(false);

  const active = drafts.find((d) => d.key === activeKey) ?? drafts[0];
  if (!active) return null;
  const st = states[active.key] ?? EMPTY;
  const patch = (p: Partial<DraftState>) => setStates((s) => ({ ...s, [active.key]: { ...(s[active.key] ?? EMPTY), ...p } }));
  const done = (d: DraftItem) => {
    const r = states[d.key]?.result;
    return r?.kind === "outcome" ? r.o.state : null;
  };
  const locked = !!blocked || busy || ["SENT", "UNCERTAIN", "SENDING"].includes(done(active) ?? "");

  /** Adds whatever is typed in the box. Returns the new recipient list, or null if the input is invalid. */
  function add(): string[] | null {
    const parts = st.input.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL_RE.test(p));
    if (bad.length) {
      patch({ inputErr: `Not a valid email address: ${bad[0]}` });
      return null;
    }
    const next = [...new Set([...st.recipients, ...parts])];
    if (next.length > 10) {
      patch({ inputErr: "At most 10 recipients per message." });
      return null;
    }
    patch({ recipients: next, input: "", inputErr: null, result: null });
    return next;
  }

  /** "Review and approve" also picks up an address that was typed but not yet added. */
  function review() {
    const list = st.input.trim() ? add() : st.recipients;
    if (list && list.length) setOpen(true);
  }

  async function send() {
    const target = active!;
    const recipients = st.recipients;
    setBusy(true);
    let result: Result;
    try {
      const res = await fetch(`/api/jobs/${job.job_id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, version: job.version, employee: target.employee, confirm: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { dispatch?: DispatchOutcome; tracker?: TrackerOutcome | null; error?: { message?: string } };
      if (body.tracker) setTracker(body.tracker);
      if (body.dispatch) {
        result = { kind: "outcome", o: body.dispatch };
        if (body.dispatch.state === "SENT")
          toast({ tone: "success", title: body.dispatch.replay ? "Already sent earlier" : `Gmail accepted the message for ${target.label}`, body: "Delivery and reading are not confirmed." });
      } else result = { kind: "error", message: body.error?.message ?? `Request failed (HTTP ${res.status}). Nothing was sent.` };
    } catch {
      result = {
        kind: "outcome",
        o: { state: "UNCERTAIN", http: null, code: "NO_RESPONSE", message: "The connection dropped. The message may or may not have been sent — check the Sent folder before approving again.", gmail_message_id: null, replay: false },
      };
    }
    setStates((s) => ({ ...s, [target.key]: { ...(s[target.key] ?? EMPTY), result } }));
    setBusy(false);
    setOpen(false);
    setAgreed(false);
  }

  const sentCount = drafts.filter((d) => done(d) === "SENT").length;

  async function syncTracker() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/jobs/${job.job_id}/tracker`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: job.version }) });
      const body = (await res.json().catch(() => ({}))) as { tracker?: TrackerOutcome; error?: { message?: string } };
      setTracker(
        body.tracker ?? { state: "FAILED", code: "HTTP_" + res.status, message: body.error?.message ?? `Request failed (HTTP ${res.status}).`, tab: null, sheet_url: null, rows_added: null, rows_updated: null },
      );
    } catch {
      setTracker({ state: "UNKNOWN", code: "NO_RESPONSE", message: "No response, so the tracker state is unknown. Try again.", tab: null, sheet_url: null, rows_added: null, rows_updated: null });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      {blocked && (
        <div className="banner warn" role="status" style={{ marginBottom: 16 }}>
          <IconLock />
          <span>
            <strong>Preview only — sending is not available for this case.</strong> {blocked}
          </span>
        </div>
      )}
      <div className="send-grid send-grid-3">
        <section className="card" aria-labelledby="drafts-h">
          <div className="card-head">
            <h2 id="drafts-h">Drafts</h2>
            <span className="small muted">
              {sentCount} / {drafts.length} sent
            </span>
          </div>
          <ul className="draft-list" role="listbox" aria-label="Choose a draft to review">
            {drafts.map((d) => {
              const s = done(d);
              const n = states[d.key]?.recipients.length ?? 0;
              return (
                <li key={d.key}>
                  <button type="button" role="option" aria-selected={d.key === active.key} className={`draft-pick${d.key === active.key ? " on" : ""}`} onClick={() => setActiveKey(d.key)}>
                    <span className="draft-avatar" aria-hidden>
                      {d.employee ? d.employee.slice(0, 1).toUpperCase() : "∑"}
                    </span>
                    <span className="draft-pick-text">
                      <strong>{d.label}</strong>
                      <span className="small muted">
                        {d.meta}
                        {n > 0 && !s ? ` · ${n} recipient${n === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                    {s && <span className={`draft-state st-${s.toLowerCase()}`}>{s === "SENT" ? "Sent" : s === "SEND_DISABLED" ? "Approved" : s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="card-body">
            <dl className="kv">
              <dt>AI review</dt>
              <dd>
                <StatusBadge def={reviewStatus(job)} />
              </dd>
              <dt>Readiness</dt>
              <dd>
                <StatusBadge def={readinessStatus(job.operational_readiness)} />
              </dd>
              <dt>Approval</dt>
              <dd>
                <StatusBadge def={approvalStatus(job)} />
              </dd>
            </dl>
          </div>
        </section>

        <section className="card" aria-labelledby="preview-h">
          <div className="card-head">
            <h2 id="preview-h">Exact message · {active.label}</h2>
            <span className="small muted">
              {job.case_id ?? "Demo case"} · {job.version !== null ? `version ${job.version}` : "synthetic, no version"}
            </span>
          </div>
          <div className="card-body stack">
            <dl className="mail-head">
              <dt>From</dt>
              <dd>The organizer Gmail account connected in n8n</dd>
              <dt>To</dt>
              <dd>{st.recipients.length ? st.recipients.join(", ") : <span className="muted">No recipients yet</span>}</dd>
              <dt>Subject</dt>
              <dd>
                <strong>{active.subject}</strong>
              </dd>
            </dl>
            <pre className="mail-body">{active.body}</pre>
            <p className="small muted">Built from the reviewed action records with a fixed template — no extra AI call. It is sent exactly as shown.</p>
          </div>
        </section>

        <section className="card" aria-labelledby="recip-h">
          <div className="card-head">
            <h2 id="recip-h">Send to</h2>
            <span className="small muted">{st.recipients.length} / 10</span>
          </div>
          <div className="card-body stack">
            <label htmlFor={ids.input} className="small">
              {active.employee ? `${active.employee}'s email address` : "Email addresses"} (comma or space separated)
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id={ids.input}
                className="input"
                type="email"
                value={st.input}
                onChange={(e) => patch({ input: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="name@example.com"
                aria-invalid={st.inputErr ? true : undefined}
                aria-describedby={`${ids.input}-hint`}
                disabled={locked}
              />
              <button type="button" className="btn" onClick={() => void add()} disabled={locked || !st.input.trim()}>
                Add
              </button>
            </div>
            <span id={`${ids.input}-hint`} className={st.inputErr ? "err small" : "hint"}>
              {st.inputErr ?? "Recipients are part of what you approve. Changing them needs a new approval."}
            </span>
            {st.recipients.length > 0 && (
              <ul className="recip-list">
                {st.recipients.map((r) => (
                  <li key={r}>
                    <span className="mono">{r}</span>
                    <button type="button" className="toast-x" aria-label={`Remove ${r}`} onClick={() => patch({ recipients: st.recipients.filter((x) => x !== r), result: null })} disabled={locked}>
                      <IconX width={13} height={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {st.result && <ResultBanner r={st.result} />}
            {tracker && <TrackerBanner t={tracker} />}

            <button type="button" className="btn primary" onClick={review} disabled={locked || (st.recipients.length === 0 && !st.input.trim())}>
              Review and approve
            </button>
            <p className="hint">
              <IconLock width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Nothing is sent until you approve. The workflow re-checks the version, AI review, readiness, route, the exact text and the daily send limit.
            </p>
            {!blocked && (
              <button type="button" className="btn sm" onClick={() => void syncTracker()} disabled={syncing}>
                {syncing ? "Syncing tracker…" : "Sync task tracker"}
              </button>
            )}
            <Link href={`/cases/${job.job_id}`} className="small">
              ← Back to the case
            </Link>
          </div>
        </section>
      </div>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        tone="ready"
        eyebrow={`Approve version ${job.version} · ${active.label}`}
        title="Send this exact message?"
        footer={
          <div className="row" style={{ marginLeft: "auto" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => void send()} disabled={!agreed || busy}>
              {busy ? "Sending…" : "Approve and send"}
            </button>
          </div>
        }
      >
        <dl className="mail-head">
          <dt>To</dt>
          <dd>{st.recipients.join(", ")}</dd>
          <dt>Subject</dt>
          <dd>{active.subject}</dd>
          <dt>Case</dt>
          <dd>
            {job.case_id ?? "Demo case"} · {job.version !== null ? `version ${job.version}` : "synthetic, no version"}
          </dd>
        </dl>
        <label htmlFor={ids.consent} className="consent">
          <input id={ids.consent} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I approve sending this exact message to these recipients from the connected Gmail account.</span>
        </label>
      </Modal>
    </>
  );
}

function ResultBanner({ r }: { r: Result }) {
  if (r.kind === "error")
    return (
      <div className="banner error" role="alert">
        <IconAlert />
        <span>{r.message}</span>
      </div>
    );
  const o = r.o;
  const map: Record<string, { cls: string; title: string }> = {
    SENT: { cls: "info", title: o.replay ? "Already sent earlier — nothing was sent again." : "Gmail accepted the message." },
    SEND_DISABLED: { cls: "warn", title: "Approved, but sending is switched off." },
    UNCERTAIN: { cls: "warn", title: "Delivery status uncertain." },
    SENDING: { cls: "warn", title: "A send for this exact approval is already in progress." },
    FAILED: { cls: "error", title: "Not sent." },
    REFUSED: { cls: "error", title: "Refused — nothing was sent." },
    UNKNOWN: { cls: "warn", title: "Unrecognised response." },
  };
  const m = map[o.state] ?? map.UNKNOWN!;
  return (
    <div className={`banner ${m.cls}`} role={o.state === "SENT" ? "status" : "alert"}>
      {o.state === "SENT" ? <IconCheckCircle /> : <IconAlert />}
      <span>
        <strong>{m.title}</strong> {o.message}
        {o.gmail_message_id && (
          <>
            {" "}
            Gmail message ID <code>{o.gmail_message_id}</code>.
          </>
        )}
      </span>
    </div>
  );
}

/** The tracker result is reported separately from the email result: one can succeed while the other fails. */
function TrackerBanner({ t }: { t: TrackerOutcome }) {
  const ok = t.state === "PUBLISHED";
  const title = ok ? "Tracker: published and verified." : t.state === "REFUSED" ? "Tracker: not published." : t.state === "UNVERIFIED" ? "Tracker: written but not verified." : t.state === "FAILED" ? "Tracker: failed — needs attention." : "Tracker: state unknown.";
  const counts = ok && (t.rows_added !== null || t.rows_updated !== null) ? ` ${t.rows_added ?? 0} added, ${t.rows_updated ?? 0} updated in “${t.tab}”.` : "";
  return (
    <div className={`banner ${ok ? "info" : t.state === "REFUSED" ? "warn" : "error"}`} role={ok ? "status" : "alert"}>
      {ok ? <IconCheckCircle /> : <IconAlert />}
      <span>
        <strong>{title}</strong>
        {counts} {ok ? "Employees can update Status and Update note; re-syncing never overwrites them." : t.message}
        {t.sheet_url && (
          <>
            {" "}
            <a href={t.sheet_url} target="_blank" rel="noopener noreferrer">
              Open the tracker tab
            </a>
          </>
        )}
      </span>
    </div>
  );
}
