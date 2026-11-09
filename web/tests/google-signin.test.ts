// OFFLINE: Google sign-in (identity only) and who may send. Google's token endpoint is mocked; no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error("REDIRECT " + u); } }));

const CLIENT = "1234567890-abcdefghijklmnop.apps.googleusercontent.com";
const KEYS = ["ACTIONREADY_MODE", "ACTIONREADY_OPEN_ACCESS", "APP_PASSWORD", "SESSION_SECRET", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ACTIONREADY_APPROVERS"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, { ACTIONREADY_MODE: "demo", ACTIONREADY_OPEN_ACCESS: "true", AUTH_SECRET: "s".repeat(43), AUTH_GOOGLE_ID: CLIENT, AUTH_GOOGLE_SECRET: "GOCSPX-" + "x".repeat(20), ACTIONREADY_APPROVERS: " Boss@Example.com ,not-an-email" });
  jar.clear();
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

const idToken = (claims: Record<string, unknown>) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");
const good = { aud: CLIENT, iss: "https://accounts.google.com", exp: Math.floor(Date.now() / 1000) + 600, email: "Maya@Example.com", email_verified: true, name: "Maya Chen" };
const tokenEndpoint = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("config", () => {
  it("reads the Google client, uses AUTH_SECRET for sessions, needs no passphrase, and normalizes approvers", async () => {
    const { getConfig } = await import("@/lib/env");
    const c = getConfig();
    expect(c.google?.clientId).toBe(CLIENT);
    expect(c.sessionSecret).toBe("s".repeat(43));
    expect(c.approvers).toEqual(["boss@example.com"]);
    expect(c.problems).toEqual([]);
  });
  it("a malformed client ID is reported and Google sign-in stays off", async () => {
    process.env.AUTH_GOOGLE_ID = "not-a-client-id";
    const { getConfig } = await import("@/lib/env");
    expect(getConfig().google).toBeNull();
    expect(getConfig().problems.join()).toMatch(/AUTH_GOOGLE_ID/);
  });
});

describe("Google OAuth request", () => {
  it("asks only for identity scopes, with PKCE (S256), state and the exact redirect URI", async () => {
    const { newOAuthRequest } = await import("@/lib/google");
    const r = newOAuthRequest(CLIENT, "https://app.example", "/cases/x");
    const u = new URL(r.url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    expect(u.searchParams.get("scope")).not.toMatch(/gmail/i);
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example/api/auth/callback/google");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(r.cookie.state);
    expect(r.cookie.next).toBe("/cases/x");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", 42])("never redirects off-site after sign-in: %s", async (n) => {
    const { safeNext } = await import("@/lib/google");
    expect(safeNext(n)).toBe("/dashboard");
  });
});

describe("code exchange checks the ID token claims", () => {
  const run = async (f: typeof fetch) => (await import("@/lib/google")).exchangeCode({ code: "c", verifier: "v", origin: "https://app.example", clientId: CLIENT, clientSecret: "s" }, f);
  it("accepts a verified email for this client and lower-cases it", async () => {
    expect(await run(tokenEndpoint({ id_token: idToken(good) }))).toEqual({ ok: true, identity: { email: "maya@example.com", name: "Maya Chen" } });
  });
  it.each([
    [{ ...good, aud: "someone-else.apps.googleusercontent.com" }, "bad_id_token"],
    [{ ...good, iss: "https://evil.example" }, "bad_id_token"],
    [{ ...good, exp: 1 }, "bad_id_token"],
    [{ ...good, email_verified: false }, "email_not_verified"],
  ])("refuses %#", async (claims, code) => {
    expect(await run(tokenEndpoint({ id_token: idToken(claims) }))).toEqual({ ok: false, code });
  });
  it("reports a rejected token request and a missing ID token", async () => {
    expect(await run(tokenEndpoint({ error: "invalid_grant" }, 400))).toEqual({ ok: false, code: "token_rejected" });
    expect(await run(tokenEndpoint({ access_token: "x" }))).toEqual({ ok: false, code: "no_id_token" });
  });
});

describe("sessions: signing in is not permission to send", () => {
  it("a listed approver can send; another Google user can only review; each gets their own case scope", async () => {
    const s = await import("@/lib/session");
    const boss = s.googleSessionCookie("boss@example.com", "Boss");
    jar.set(boss.name, boss.value);
    const a = await s.getSession();
    expect(a).toMatchObject({ kind: "google", email: "boss@example.com", canSend: true });
    expect(a!.sub).toMatch(/^g_[0-9a-f]{24}$/);
    expect(a!.sub).not.toContain("boss");
    const other = s.googleSessionCookie("maya@example.com", "Maya");
    jar.set(other.name, other.value);
    const b = await s.getSession();
    expect(b).toMatchObject({ kind: "google", canSend: false });
    expect(b!.sub).not.toBe(a!.sub);
  });
  it("a tampered cookie falls back to the open demo guest, who cannot send", async () => {
    const s = await import("@/lib/session");
    const c = s.googleSessionCookie("maya@example.com", null);
    jar.set(c.name, c.value.slice(0, -2) + "xx");
    expect(await s.getSession()).toMatchObject({ kind: "guest", canSend: false });
  });
  it("without open access, no cookie means no session", async () => {
    delete process.env.ACTIONREADY_OPEN_ACCESS;
    const s = await import("@/lib/session");
    expect(await s.getSession()).toBeNull();
  });
});
