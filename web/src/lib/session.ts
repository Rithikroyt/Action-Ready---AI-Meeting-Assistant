import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "./env";

// Single-owner session for a private demonstration. Not a multi-tenant auth system.
const COOKIE = "ar_session";
const TTL_S = 8 * 60 * 60;
export const OWNER = "owner";

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  // Hash first so lengths always match and timing does not leak length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(candidate: string): boolean {
  const { appPassword } = getConfig();
  return !!appPassword && safeEqual(candidate, appPassword);
}

export async function createSession() {
  const { sessionSecret } = getConfig();
  if (!sessionSecret) throw new Error("SESSION_SECRET is not configured.");
  const payload = b64(JSON.stringify({ sub: OWNER, exp: Math.floor(Date.now() / 1000) + TTL_S }));
  (await cookies()).set(COOKIE, `${payload}.${sign(payload, sessionSecret)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TTL_S,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<{ sub: string } | null> {
  const { sessionSecret } = getConfig();
  if (!sessionSecret) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, sessionSecret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
    if (data.sub !== OWNER || typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return { sub: OWNER };
  } catch {
    return null;
  }
}

/** For pages: redirect to /login when there is no valid session. */
export async function requireSession() {
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
