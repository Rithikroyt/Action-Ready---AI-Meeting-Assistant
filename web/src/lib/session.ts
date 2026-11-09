import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "./env";

// Sessions: Google sign-in (identity only), the owner passphrase, or the open synthetic demo ("guest").
// Signing in identifies a person; it never grants Gmail access and never, by itself, allows sending.
const COOKIE = "ar_session";
const TTL_S = 8 * 60 * 60;
/** Owner key for the passphrase owner and for open-demo guests (keeps existing local case history). */
export const OWNER = "owner";

export type SessionKind = "google" | "password" | "guest";
export interface Session {
  /** Stable owner key used to scope cases. Google users: g_<hash of email> (the email is never used as a key). */
  sub: string;
  kind: SessionKind;
  email: string | null;
  name: string | null;
  /** May approve and send email (passphrase owner, or a Google user listed in ACTIONREADY_APPROVERS). */
  canSend: boolean;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function safeEqual(a: string, b: string) {
  // Hash first so lengths always match and timing does not leak length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Signed, expiring token (HMAC-SHA256). Used for the session and the short-lived OAuth state cookie. */
export function sealToken(data: Record<string, unknown>, secret: string, ttlS: number): string {
  const payload = b64(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlS }));
  return `${payload}.${sign(payload, secret)}`;
}
export function openToken(raw: string | undefined, secret: string): Record<string, unknown> | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export const ownerKeyForEmail = (email: string) => "g_" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);

export function checkPassword(candidate: string): boolean {
  const { appPassword } = getConfig();
  return !!appPassword && safeEqual(candidate, appPassword);
}

async function setSessionCookie(data: Record<string, unknown>) {
  const { sessionSecret } = getConfig();
  if (!sessionSecret) throw new Error("SESSION_SECRET or AUTH_SECRET is not configured.");
  // Lax (not Strict): the Google callback is a top-level redirect from accounts.google.com, and a Strict cookie
  // would be withheld on the redirect chain that follows it. Unsafe requests are origin-checked separately.
  (await cookies()).set(COOKIE, sealToken(data, sessionSecret, TTL_S), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL_S });
}

/** Passphrase owner. */
export async function createSession() {
  await setSessionCookie({ sub: OWNER, kind: "password" });
}

/** Google user with a verified email: the cookie to set on the callback's redirect response. */
export function googleSessionCookie(email: string, name: string | null) {
  const { sessionSecret } = getConfig();
  if (!sessionSecret) throw new Error("SESSION_SECRET or AUTH_SECRET is not configured.");
  const value = sealToken({ sub: ownerKeyForEmail(email), kind: "google", email: email.toLowerCase(), name: name ? name.slice(0, 80) : null }, sessionSecret, TTL_S);
  return { name: COOKIE, value, options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: TTL_S } };
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const cfg = getConfig();
  if (cfg.sessionSecret) {
    const d = openToken((await cookies()).get(COOKIE)?.value, cfg.sessionSecret);
    if (d?.kind === "password" && d.sub === OWNER) return { sub: OWNER, kind: "password", email: null, name: null, canSend: true };
    if (d?.kind === "google" && typeof d.sub === "string" && typeof d.email === "string" && cfg.google) {
      // The owner key is re-derived from the signed email, never trusted on its own.
      if (d.sub !== ownerKeyForEmail(d.email)) return null;
      return { sub: d.sub, kind: "google", email: d.email, name: typeof d.name === "string" ? d.name : null, canSend: cfg.approvers.includes(d.email) };
    }
  }
  if (cfg.openAccess) return { sub: OWNER, kind: "guest", email: null, name: null, canSend: false }; // demo-only open access (see env.ts)
  return null;
}

/** For pages: redirect to /login when there is no valid session. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

// Naive per-process limiter for login attempts (adequate for a single-owner demo).
const attempts = new Map<string, number[]>();
export function loginAllowed(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 60_000);
  attempts.set(key, recent);
  return recent.length < 5;
}
export function recordLoginFailure(key: string) {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}
