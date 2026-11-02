import { acceptedSchema, JOB_ID_RE, type Submission } from "./contract";

// Server-side adapter for the two webhooks on the SAME ActionReady canvas.
// The shared secret stays on the server; the browser only talks to this app's own routes.
export interface N8nTarget {
  base: string;
  headerName: string;
  secret: string;
}

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
    res = await fetchImpl(`${t.base}/actionready/v1/jobs/${encodeURIComponent(job_id)}`, {
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
