import "server-only";

// Server-only configuration. Values are never sent to the browser; only booleans/labels are.
export type Mode = "live" | "demo";

export interface AppConfig {
  mode: Mode;
  projectId: string;
  projectLabel: string;
  appPassword: string | null;
  sessionSecret: string | null;
  n8n: { base: string; headerName: string; secret: string } | null;
  /** Names of missing/invalid settings — never their values. */
  problems: string[];
}

export function getConfig(): AppConfig {
  const e = process.env;
  const problems: string[] = [];
  const mode: Mode = e.ACTIONREADY_MODE === "live" ? "live" : "demo";

  const appPassword = e.APP_PASSWORD && e.APP_PASSWORD.length >= 12 ? e.APP_PASSWORD : null;
  if (!appPassword) problems.push("APP_PASSWORD (min 12 characters)");
  const sessionSecret = e.SESSION_SECRET && e.SESSION_SECRET.length >= 32 ? e.SESSION_SECRET : null;
  if (!sessionSecret) problems.push("SESSION_SECRET (min 32 characters)");

  let n8n: AppConfig["n8n"] = null;
  if (mode === "live") {
    const base = (e.N8N_WEBHOOK_BASE ?? "").replace(/\/+$/, "");
    const headerName = e.N8N_WEBHOOK_HEADER_NAME ?? "";
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
    if (secret.length < 16) problems.push("N8N_WEBHOOK_SECRET (min 16 characters)");
    if (baseOk && headerName && secret.length >= 16) n8n = { base, headerName, secret };
  }

  return {
    mode,
    projectId: e.ACTIONREADY_PROJECT_ID || "DEMO_ATLAS",
    projectLabel: e.ACTIONREADY_PROJECT_LABEL || "Demo Atlas (synthetic)",
    appPassword,
    sessionSecret,
    n8n,
    problems,
  };
}
