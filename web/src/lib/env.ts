import "server-only";

// Server-only configuration. Values are never sent to the browser; only booleans/labels are.
export type Mode = "live" | "demo";

export interface AppConfig {
  mode: Mode;
  /** No sign-in. Honoured only in DEMO mode (synthetic data, no n8n calls); live mode always requires sign-in. */
  openAccess: boolean;
  projectId: string;
  projectLabel: string;
  appPassword: string | null;
  /** Signs session cookies: SESSION_SECRET, or AUTH_SECRET when only Google sign-in is configured. */
  sessionSecret: string | null;
  /** Google sign-in (identity only — never Gmail access). Null when AUTH_GOOGLE_ID/SECRET are not set. */
  google: { clientId: string; clientSecret: string } | null;
  /** Lower-case emails allowed to approve and send (ACTIONREADY_APPROVERS). Signing in alone never allows sending. */
  approvers: string[];
  n8n: { base: string; headerName: string; secret: string; statusPath: string } | null;
  /** Names of missing/invalid settings — never their values. */
  problems: string[];
}

/** Trim slashes; allow only plain path segments (no scheme, query, '..' or ':param'). Empty = invalid. */
export function normalizeStatusPath(raw: string): string {
  const p = raw.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/").replace(/\/:job_id$/, "");
  if (!p || p.split("/").some((seg) => !/^[A-Za-z0-9._~-]+$/.test(seg) || seg === "." || seg === "..")) return "";
  return p;
}

export function getConfig(): AppConfig {
  // Values pasted into a host's settings page often carry stray spaces or surrounding quotes; strip them.
  const e: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) e[k] = typeof v === "string" ? v.trim().replace(/^(["'])(.*)\1$/, "$2").trim() : v;
  const problems: string[] = [];
  const mode: Mode = (e.ACTIONREADY_MODE ?? "").toLowerCase() === "live" ? "live" : "demo";
  // Live mode can start paid workflow runs, so an open (password-free) site is never allowed there.
  const openAccess = mode === "demo" && e.ACTIONREADY_OPEN_ACCESS === "true";

  const gid = (e.AUTH_GOOGLE_ID ?? "").trim();
  const gsecret = (e.AUTH_GOOGLE_SECRET ?? "").trim();
  const google = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(gid) && gsecret.length >= 16 ? { clientId: gid, clientSecret: gsecret } : null;
  if ((gid || gsecret) && !google) problems.push("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET (Google OAuth web client)");
  const approvers = [...new Set((e.ACTIONREADY_APPROVERS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/.test(x)))];

  const appPassword = e.APP_PASSWORD && e.APP_PASSWORD.length >= 12 ? e.APP_PASSWORD : null;
  if (!appPassword && !openAccess && !google) problems.push("APP_PASSWORD (min 12 characters)");
  const rawSecret = e.SESSION_SECRET && e.SESSION_SECRET.length >= 32 ? e.SESSION_SECRET : e.AUTH_SECRET && e.AUTH_SECRET.length >= 32 ? e.AUTH_SECRET : null;
  const sessionSecret = rawSecret;
  if (!sessionSecret && (!openAccess || google)) problems.push("SESSION_SECRET or AUTH_SECRET (min 32 characters)");

  let n8n: AppConfig["n8n"] = null;
  if (mode === "live") {
    const base = (e.N8N_WEBHOOK_BASE ?? "").replace(/\/+$/, "");
    const headerName = e.N8N_WEBHOOK_HEADER_NAME ?? "";
    // n8n prefixes path-parameter webhooks with a webhook ID, so the status path is instance-specific.
    const statusPath = normalizeStatusPath(e.N8N_JOB_STATUS_PATH ?? "");
    const secret = e.N8N_WEBHOOK_SECRET ?? "";
    let baseOk = false;
    try {
      const u = new URL(base);
      baseOk = u.protocol === "https:" && !u.pathname.includes("webhook-test");
    } catch {
      baseOk = false;
    }
    if (!baseOk) problems.push("N8N_WEBHOOK_BASE (https production /webhook URL, not /webhook-test)");
    if (!/^[A-Za-z0-9-]{3,64}$/.test(headerName)) problems.push("N8N_WEBHOOK_HEADER_NAME");
    if (!statusPath) problems.push("N8N_JOB_STATUS_PATH (status webhook path without the job ID, e.g. <webhook-id>/actionready/v1/jobs)");
    if (secret.length < 16) problems.push("N8N_WEBHOOK_SECRET (min 16 characters)");
    if (baseOk && headerName && secret.length >= 16 && statusPath) n8n = { base, headerName, secret, statusPath };
  }

  return {
    mode,
    openAccess,
    projectId: e.ACTIONREADY_PROJECT_ID || "DEMO_ATLAS",
    projectLabel: e.ACTIONREADY_PROJECT_LABEL || "Demo Atlas (synthetic)",
    appPassword,
    sessionSecret,
    google: sessionSecret ? google : null,
    approvers,
    n8n,
    problems,
  };
}
