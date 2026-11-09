"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { JobView } from "@/lib/contract";
import type { DispatchOutcome } from "@/lib/n8n";
import { approvalStatus, readinessStatus, reviewStatus } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { IconAlert, IconCheckCircle, IconLock, IconX } from "@/components/Icons";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

type Result = { kind: "outcome"; o: DispatchOutcome } | { kind: "error"; message: string };

/** Exact-message approval. The text shown is the stored reviewed draft; the server sends exactly that text. */
export function ReviewSend({ job }: { job: JobView }) {
  const ids = { input: useId(), consent: useId() };
  const toast = useToast();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [inputErr, setInputErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const draftMsg = job.draft!;
  const locked = busy || (result?.kind === "outcome" && ["SENT", "UNCERTAIN", "SENDING"].includes(result.o.state));

  function add() {
    const parts = draft.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL_RE.test(p));
    if (bad.length) return setInputErr(`Not a valid email address: ${bad[0]}`);
    const next = [...new Set([...recipients, ...parts])];
    if (next.length > 10) return setInputErr("At most 10 recipients per message.");
    setRecipients(next);
    setDraft("");
    setInputErr(null);
    setResult(null);
  }

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${job.job_id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, version: job.version, confirm: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { dispatch?: DispatchOutcome; error?: { message?: string } };
      if (body.dispatch) {
        setResult({ kind: "outcome", o: body.dispatch });
        if (body.dispatch.state === "SENT") toast({ tone: "success", title: body.dispatch.replay ? "Already sent earlier" : "Gmail accepted the message", body: "Delivery and reading are not confirmed." });
      } else setResult({ kind: "error", message: body.error?.message ?? `Request failed (HTTP ${res.status}). Nothing was sent.` });
    } catch {
      setResult({
        kind: "outcome",
        o: { state: "UNCERTAIN", http: null, code: "NO_RESPONSE", message: "The connection dropped. The message may or may not have been sent — check the Sent folder before approving again.", gmail_message_id: null, replay: false },
      });
    } finally {
      setBusy(false);
      setOpen(false);
      setAgreed(false);
    }
  }

  return (
    <div className="send-grid">
      <section className="card" aria-labelledby="recip-h">
        <div className="card-head">
          <h2 id="recip-h">Recipients</h2>
          <span className="small muted">{recipients.length} / 10</span>
        </div>
        <div className="card-body stack">
          <label htmlFor={ids.input} className="small">
            Add email addresses (comma or space separated)
          </label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id={ids.input}
              className="input"
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="name@asu.edu"
              aria-invalid={inputErr ? true : undefined}
              aria-describedby={`${ids.input}-hint`}
              disabled={locked}
            />
            <button type="button" className="btn" onClick={add} disabled={locked || !draft.trim()}>
              Add
            </button>
          </div>
          <span id={`${ids.input}-hint`} className={inputErr ? "err small" : "hint"}>
            {inputErr ?? "Only addresses on the allowlist in n8n (Week 4 Dispatch Settings) are accepted. Changing recipients needs a new approval."}
          </span>
          {recipients.length > 0 && (
            <ul className="recip-list">
              {recipients.map((r) => (
                <li key={r}>
                  <span className="mono">{r}</span>
                  <button type="button" className="toast-x" aria-label={`Remove ${r}`} onClick={() => setRecipients(recipients.filter((x) => x !== r))} disabled={locked}>
                    <IconX width={13} height={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <dl className="kv" style={{ marginTop: 6 }}>
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
          <h2 id="preview-h">Exact message</h2>
          <span className="small muted">
            {job.case_id} · version {job.version}
          </span>
        </div>
        <div className="card-body stack">
          <dl className="mail-head">
            <dt>From</dt>
            <dd>The organizer Gmail account connected in n8n</dd>
            <dt>To</dt>
            <dd>{recipients.length ? recipients.join(", ") : <span className="muted">No recipients yet</span>}</dd>
            <dt>Subject</dt>
            <dd>
              <strong>{draftMsg.subject}</strong>
            </dd>
          </dl>
          <pre className="mail-body">{draftMsg.body}</pre>
          {job.actions.length > 0 && (
            <p className="small muted">
              Included actions: {job.actions.map((a) => a.action_id).join(", ")} · reviewed draft, sent exactly as shown
            </p>
          )}

          {result && <ResultBanner r={result} />}

          <div className="submit-bar">
            <p className="hint">
              <IconLock width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Nothing is sent until you approve. The workflow re-checks version, review, readiness, route and recipients.
            </p>
            <button type="button" className="btn primary" onClick={() => setOpen(true)} disabled={locked || recipients.length === 0}>
              Review and approve
            </button>
          </div>
          <Link href={`/cases/${job.job_id}`} className="small">
            ← Back to the case
          </Link>
        </div>
      </section>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        tone="ready"
        eyebrow={`Approve version ${job.version}`}
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
          <dd>{recipients.join(", ")}</dd>
          <dt>Subject</dt>
          <dd>{draftMsg.subject}</dd>
          <dt>Case</dt>
          <dd>
            {job.case_id} · version {job.version}
          </dd>
        </dl>
        <label htmlFor={ids.consent} className="consent">
          <input id={ids.consent} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I approve sending this exact message to these recipients from the connected Gmail account.</span>
        </label>
      </Modal>
    </div>
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
