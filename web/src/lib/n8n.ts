import { acceptedSchema, JOB_ID_RE, type Submission } from "./contract";

// Server-side adapter for the two webhooks on the SAME ActionReady canvas.
// The shared secret stays on the server; the browser only talks to this app's own routes.
export interface N8nTarget {
  base: string;
  headerName: string;
  secret: string;
  /** Status webhook path relative to `base`, without the job ID (instance-specific; see N8N_JOB_STATUS_PATH). */
  statusPath: string;
}

export const statusUrl = (t: N8nTarget, job_id: string) =>
  `${t.base.replace(/\/+$/, "")}/${t.statusPath.replace(/^\/+|\/+$/g, "")}/${encodeURIComponent(job_id)}`;

export type SubmitOutcome =
  | { kind: "accepted"; job_id: string }
  | { kind: "conflict"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "ambiguous"; message: string }
  | { kind: "unavailable"; message: string };

export type FetchJobOutcome = { kind: "ok"; body: unknown } | { kind: "not_found" } | { kind: "unavailable"; message: string };

const SUBMIT_TIMEOUT_MS = 25_000;
const STATUS_TIMEOUT_MS = 10_000;

async function safeMessage(res: Response): Promise<string | null> {
  try {
    const b = (await res.json()) as { error?: { message?: unknown }; message?: unknown };
    const m = b?.error?.message ?? b?.message;
    return typeof m === "string" ? m.slice(0, 300) : null;
  } catch {
    return null;
  }
}

export async function submitToN8n(t: N8nTarget, sub: Submission, fetchImpl: typeof fetch = fetch): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${t.base}/actionready/v1/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", [t.headerName]: t.secret },
      body: JSON.stringify(sub),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch {
    // We cannot know whether n8n accepted it. Never auto-retry; the user may re-check with the
    // SAME request_id, which the workflow treats idempotently.
    return { kind: "ambiguous", message: "No response from the workflow. It may or may not have accepted the meeting." };
  }
  if (res.status === 202 || res.status === 200) {
    try {
      const parsed = acceptedSchema.safeParse(await res.json());
      if (parsed.success) return { kind: "accepted", job_id: parsed.data.job_id };
    } catch {
      /* fall through */
    }
    return { kind: "ambiguous", message: "The workflow responded, but without a valid job ID." };
  }
  if (res.status === 409) return { kind: "conflict", message: (await safeMessage(res)) ?? "This request ID was already used with different content." };
  if (res.status === 400 || res.status === 422) return { kind: "invalid", message: (await safeMessage(res)) ?? "The workflow rejected the input." };
  if (res.status === 401 || res.status === 403) return { kind: "unavailable", message: "The workflow refused this app's credentials. Check the Header Auth setup." };
  if (res.status === 404) return { kind: "unavailable", message: "The submission webhook was not found. Is the workflow published?" };
  if (res.status === 504 || res.status === 524) return { kind: "ambiguous", message: "The workflow timed out before confirming acceptance." };
  return { kind: "unavailable", message: `The workflow returned HTTP ${res.status}.` };
}

export async function fetchJobFromN8n(t: N8nTarget, job_id: string, fetchImpl: typeof fetch = fetch): Promise<FetchJobOutcome> {
  if (!JOB_ID_RE.test(job_id)) return { kind: "not_found" };
  let res: Response;
  try {
    res = await fetchImpl(statusUrl(t, job_id), {
      method: "GET",
      headers: { Accept: "application/json", [t.headerName]: t.secret },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch {
    return { kind: "unavailable", message: "The status endpoint did not respond." };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) return { kind: "unavailable", message: `The status endpoint returned HTTP ${res.status}.` };
  try {
    return { kind: "ok", body: await res.json() };
  } catch {
    return { kind: "unavailable", message: "The status endpoint returned invalid JSON." };
  }
}

// ---------- Week 4: Review & Send ----------
export interface DispatchPayload {
  job_id: string;
  version: number;
  recipients: string[];
  subject: string;
  body: string;
  dispatch_key: string;
  confirm: true;
}

export type DispatchState = "SENT" | "SEND_DISABLED" | "REFUSED" | "FAILED" | "UNCERTAIN" | "SENDING" | "UNKNOWN";
export interface DispatchOutcome {
  state: DispatchState;
  http: number | null;
  code: string | null;
  message: string;
  gmail_message_id: string | null;
  replay: boolean;
}

const DISPATCH_TIMEOUT_MS = 30_000;
const DISPATCH_STATES: DispatchState[] = ["SENT", "SEND_DISABLED", "REFUSED", "FAILED", "UNCERTAIN", "SENDING"];

/** POST the approved message to the guarded n8n dispatch webhook. Never retries; a timeout is UNCERTAIN, not failed. */
export async function dispatchToN8n(t: N8nTarget, payload: DispatchPayload, fetchImpl: typeof fetch = fetch): Promise<DispatchOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${t.base}/actionready/v1/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", [t.headerName]: t.secret },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
  } catch {
    return { state: "UNCERTAIN", http: null, code: "NO_RESPONSE", message: "The workflow did not answer. The message may or may not have been sent — check the Sent folder before approving again.", gmail_message_id: null, replay: false };
  }
  if (res.status === 404) return { state: "REFUSED", http: 404, code: "ENDPOINT_NOT_PUBLISHED", message: "The dispatch endpoint is not published in n8n yet. Nothing was sent.", gmail_message_id: null, replay: false };
  if (res.status === 401 || res.status === 403) {
    const b = await res.json().catch(() => null);
    if (!b?.dispatch_status) return { state: "REFUSED", http: res.status, code: "UNAUTHORIZED", message: "The workflow refused this app's credentials. Nothing was sent.", gmail_message_id: null, replay: false };
    return outcomeFrom(res.status, b);
  }
  return outcomeFrom(res.status, await res.json().catch(() => null));
}

function outcomeFrom(http: number, b: { dispatch_status?: unknown; error?: { code?: unknown; message?: unknown }; note?: unknown; gmail_message_id?: unknown; replay?: unknown } | null): DispatchOutcome {
  const raw = typeof b?.dispatch_status === "string" ? (b.dispatch_status as DispatchState) : "UNKNOWN";
  const state: DispatchState = DISPATCH_STATES.includes(raw) ? raw : http === 504 ? "UNCERTAIN" : "UNKNOWN";
  const msg = typeof b?.error?.message === "string" ? b.error.message : typeof b?.note === "string" ? b.note : `The workflow returned HTTP ${http}.`;
  return {
    state,
    http,
    code: typeof b?.error?.code === "string" ? b.error.code.slice(0, 60) : null,
    message: msg.slice(0, 400),
    gmail_message_id: typeof b?.gmail_message_id === "string" && b.gmail_message_id ? b.gmail_message_id.slice(0, 120) : null,
    replay: b?.replay === true,
  };
}
