"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rememberNotes } from "@/lib/sessionNotes";
import { preflightNotes, MAX_CHARS } from "@/lib/preflight";
import { exampleFormState, NOTES_PLACEHOLDER } from "@/lib/exampleForm";
import { PreflightPanel } from "./PreflightPanel";
import { IconAlert, IconDatabase, IconLock, IconSparkle, IconUpload } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export interface ExampleOption {
  id: string;
  title: string;
  summary: string;
  notes: string;
  period: { start: string; end: string };
  timezone: string;
}

const MAX_FILE_BYTES = 64 * 1024;
const COMMON_TZ = ["America/Phoenix", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC"];

type Phase =
  | { k: "idle" }
  | { k: "submitting" }
  | { k: "error"; message: string; code: string }
  | { k: "ambiguous"; message: string }
  | { k: "confirm" };

export function NewMeetingForm(props: {
  examples: ExampleOption[];
  initialExample: string | null;
  project: { id: string; label: string };
  mode: "live" | "demo";
  canSubmit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const ids ={ notes: useId(), start: useId(), end: useId(), tz: useId(), file: useId() };
  const init = props.examples.find((e) => e.id === props.initialExample) ?? null;
  const initValues = init ? exampleFormState(init) : null;
  const [notes, setNotes] = useState(initValues?.notes ?? "");
  const [start, setStart] = useState(initValues?.period_start ?? "");
  const [end, setEnd] = useState(initValues?.period_end ?? "");
  const [tz, setTz] = useState(initValues?.timezone ?? "America/Phoenix");
  const [loaded, setLoaded] = useState<ExampleOption | null>(init);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  // One request ID per distinct submission. It survives an ambiguous timeout so "Check again"
  // re-asks about the same request instead of starting a second analysis.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  // Request ID whose pre-submit warnings the user already accepted, so we ask only once per submission.
  const [warnAck, setWarnAck] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      if (!init) {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserTz) setTz(browserTz);
      }
      return;
    }
    setRequestId(crypto.randomUUID());
    if (phase.k === "ambiguous" || phase.k === "error" || phase.k === "confirm") setPhase({ k: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, start, end, tz]);

  const tzOptions = useMemo(() => Array.from(new Set([tz, ...COMMON_TZ])).filter(Boolean), [tz]);
  const edited = loaded !== null && (loaded.notes !== notes || loaded.period.start !== start || loaded.period.end !== end);
  const chars = notes.trim().length;
  // Local heuristics only; recomputed as the user types (deferred so typing stays smooth). No network.
  const deferredNotes = useDeferredValue(notes);
  const preflight = useMemo(() => preflightNotes({ notes: deferredNotes, period_start: start, period_end: end }), [deferredNotes, start, end]);
  const showPreflight = attempted || notes.trim().length > 0;

  function loadExample(e: ExampleOption) {
    const v = exampleFormState(e);
    setNotes(v.notes);
    setStart(v.period_start);
    setEnd(v.period_end);
    setTz(v.timezone);
    setLoaded(e);
    setFieldErr({});
    setFileMsg(null);
    toast({ tone: "info", title: "Synthetic example loaded", body: e.title });
  }

  async function onFile(f: File | undefined) {
    setFileMsg(null);
    if (!f) return;
    if (!/\.txt$/i.test(f.name) || (f.type && f.type !== "text/plain")) return setFileMsg("Only plain-text .txt files are supported.");
    if (f.size > MAX_FILE_BYTES) return setFileMsg("That file is larger than 64 KB.");
    const text = await f.text();
    if (text.trim().length > MAX_CHARS) return setFileMsg(`The file has ${text.trim().length.toLocaleString()} characters; the limit is 12,000. Nothing was truncated.`);
    setNotes(text);
    setLoaded(null);
    setFileMsg(`Loaded ${f.name}.`);
    toast({ tone: "success", title: "Notes loaded", body: f.name });
    if (fileRef.current) fileRef.current.value = "";
  }

  function reviewNotes() {
    setPhase({ k: "idle" });
    notesRef.current?.focus();
  }

  async function submit(opts: { acceptWarnings?: boolean; recheck?: boolean } = {}) {
    setAttempted(true);
    const pf = preflightNotes({ notes, period_start: start, period_end: end });
    const errs: Record<string, string> = {};
    for (const e of pf.errors) if (e.field) errs[e.field] ??= e.label + ".";
    setFieldErr(errs);
    if (!pf.canSubmit) return;
    // Warnings never block, but ask once before spending an AI run. "Check again" after an
    // ambiguous timeout re-sends the same request, so it never asks.
    if (pf.warnings.length && !opts.recheck && !opts.acceptWarnings && warnAck !== requestId) {
      setPhase({ k: "confirm" });
      return;
    }
    if (opts.acceptWarnings) setWarnAck(requestId);
    setPhase({ k: "submitting" });
    let res: Response;
    try {
      res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, notes, period_start: start, period_end: end, timezone: tz }),
      });
    } catch {
      setPhase({ k: "ambiguous", message: "The connection dropped before the app confirmed acceptance." });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      job_id?: string;
      error?: { code?: string; message?: string; fields?: Record<string, string> };
    };
    if ((res.status === 202 || res.status === 200) && body.job_id) {
      rememberNotes(body.job_id, notes);
      router.push(`/cases/${body.job_id}`);
      return;
    }
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const code = body.error?.code ?? "ERROR";
    const message = body.error?.message ?? `Request failed (HTTP ${res.status}).`;
    if (code === "AMBIGUOUS") return setPhase({ k: "ambiguous", message });
    if (body.error?.fields) setFieldErr(body.error.fields);
    setPhase({ k: "error", code, message });
  }

  const busy = phase.k === "submitting";

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <div className="stack" style={{ gap: 16 }}>
      <section className="card" aria-labelledby="notes-h">
        <div className="card-head">
          <h2 id="notes-h">Meeting notes</h2>
          <div className="row">
            {loaded && (
              <span className={`badge ${edited ? "unknown" : "demo"}`}>{edited ? "Synthetic example · edited" : "Synthetic example"}</span>
            )}
            <input
              ref={fileRef}
              id={ids.file}
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <label htmlFor={ids.file} className="btn sm" role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}>
              <IconUpload width={14} height={14} /> Upload .txt
            </label>
          </div>
        </div>
        <div className="card-body stack">
          <div className="field">
            <label htmlFor={ids.notes} className="sr-only">
              Meeting notes
            </label>
            <textarea
              ref={notesRef}
              id={ids.notes}
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={NOTES_PLACEHOLDER}
              aria-invalid={fieldErr.notes ? true : undefined}
              aria-describedby={`${ids.notes}-meta`}
              spellCheck
            />
            <div id={`${ids.notes}-meta`} className="row" style={{ justifyContent: "space-between" }}>
              <span className={fieldErr.notes ? "err" : "hint"}>{fieldErr.notes ?? "Include owners, deadlines and estimated hours. Notes are treated as data, never as instructions."}</span>
              <span className="hint" style={{ color: chars > MAX_CHARS ? "var(--blocked)" : undefined, fontVariantNumeric: "tabular-nums" }}>
                {chars.toLocaleString()} / 12,000
              </span>
            </div>
            {fileMsg && (
              <span className="hint" role="status">
                {fileMsg}
              </span>
            )}
          </div>
          {props.mode === "demo" && edited && (
            <div className="banner warn" role="note">
              <IconAlert />
              <span>Demo mode only evaluates the synthetic examples exactly as provided. Edited notes need live mode.</span>
            </div>
          )}
          <p className="muted small">
            <IconLock width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            This app does not store your notes. The workflow persists only allowlisted summaries and short source excerpts.
          </p>
        </div>
      </section>
        <div className="stack" style={{ gap: 10 }}>
          {phase.k === "error" && (
            <div className="banner error" role="alert">
              <IconAlert />
              <span>{phase.message}</span>
            </div>
          )}
          {phase.k === "ambiguous" && (
            <div className="banner warn" role="alert">
              <IconAlert />
              <div className="stack" style={{ gap: 8 }}>
                <span>
                  <strong>Acceptance not confirmed.</strong> {phase.message} Checking again re-sends the same request ID, so the workflow returns the existing job
                  instead of starting a second analysis.
                </span>
                <div>
                  <button type="button" className="btn sm" onClick={() => void submit({ recheck: true })} disabled={busy}>
                    Check again
                  </button>
                </div>
              </div>
            </div>
          )}
          {showPreflight && <PreflightPanel result={preflight} />}
          <Modal
            open={phase.k === "confirm"}
            onClose={reviewNotes}
            tone="unknown"
            eyebrow="Before you submit"
            title={`${preflight.warnings.length} possible gap${preflight.warnings.length === 1 ? "" : "s"} in the notes`}
            footer={
              <div className="row" style={{ marginLeft: "auto" }}>
                <button type="button" className="btn" onClick={reviewNotes}>
                  Review notes
                </button>
                <button type="button" className="btn primary" onClick={() => void submit({ acceptWarnings: true })} autoFocus>
                  Submit anyway
                </button>
              </div>
            }
          >
            <p id="confirm-msg">
              <strong>Submitting now may use an AI run and could return Needs Clarification.</strong> These warnings never block submission, but fixing them
              first usually gives a clearer result.
            </p>
            <ul className="modal-list">
              {preflight.warnings.map((w, n) => (
                <li key={n}>
                  <IconAlert width={15} height={15} aria-hidden />
                  <span>{w.label}</span>
                </li>
              ))}
            </ul>
          </Modal>
          <div className="submit-bar">
          <p className="hint">Nothing is sent or approved. You get a draft plus a readiness check.</p>
          <button type="submit" className="btn primary" disabled={busy || !props.canSubmit} style={{ height: 40, minWidth: 180 }}>
            {busy ? (
              <>
                <span className="pulse" aria-hidden /> Submitting…
              </>
            ) : (
              <>
                <IconSparkle width={16} height={16} /> Analyze meeting
              </>
            )}
          </button>
          </div>
          {!props.canSubmit && <p className="err small">Live mode is not configured, so submission is disabled.</p>}
        </div>
      </div>

      <div className="stack" style={{ gap: 20 }}>
        <section className="card" aria-labelledby="period-h">
          <div className="card-head">
            <h2 id="period-h">Planning period</h2>
          </div>
          <div className="card-body stack">
            <div className="two">
              <div className="field">
                <label htmlFor={ids.start}>Start</label>
                <input id={ids.start} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={fieldErr.period_start ? true : undefined} />
                {fieldErr.period_start && <span className="err">{fieldErr.period_start}</span>}
              </div>
              <div className="field">
                <label htmlFor={ids.end}>End</label>
                <input id={ids.end} type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={fieldErr.period_end ? true : undefined} />
                {fieldErr.period_end && <span className="err">{fieldErr.period_end}</span>}
              </div>
            </div>
            <div className="field">
              <label htmlFor={ids.tz}>Timezone</label>
              <select id={ids.tz} className="select" value={tz} onChange={(e) => setTz(e.target.value)} aria-invalid={fieldErr.timezone ? true : undefined}>
                {tzOptions.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              {fieldErr.timezone && <span className="err">{fieldErr.timezone}</span>}
            </div>
            <p className="hint">Records are matched to this exact period. If the notes state a different period, the workflow asks instead of guessing.</p>
          </div>
        </section>

        <section className="card" aria-labelledby="ctx-h">
          <div className="card-head">
            <h2 id="ctx-h">Authorized context</h2>
            <IconLock className="muted" />
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Project</dt>
              <dd>{props.project.label}</dd>
              <dt>Scope ID</dt>
              <dd className="mono">{props.project.id}</dd>
              <dt>Set by</dt>
              <dd className="muted">Server configuration — not editable here or by the notes</dd>
            </dl>
          </div>
        </section>

        <section className="card" aria-labelledby="ex-h">
          <div className="card-head">
            <h2 id="ex-h">Synthetic examples</h2>
            <IconDatabase className="muted" />
          </div>
          <div className="card-body stack" style={{ gap: 8 }}>
            <p className="hint">Invented Demo Atlas records for testing. Loading one replaces the notes and period.</p>
            {props.examples.map((e) => (
              <button key={e.id} type="button" className="example" onClick={() => loadExample(e)} aria-pressed={loaded?.id === e.id && !edited}>
                <span className="t">{e.title}</span>
                <span className="s">{e.summary}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </form>
  );
}
