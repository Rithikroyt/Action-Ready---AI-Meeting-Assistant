import "server-only";
import { NextResponse } from "next/server";
import { getSession, type Session } from "./session";

const NO_STORE = { "Cache-Control": "no-store" };

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** API routes: require a session and, for unsafe methods, a same-origin request. */
export async function guardApi(req: Request): Promise<NextResponse | null> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) return json({ error: { code: "FORBIDDEN_ORIGIN", message: "Cross-origin request refused." } }, 403);
  }
  if (!(await getSession())) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in again." } }, 401);
  return null;
}

/** The session of a request that already passed guardApi. */
export async function apiSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("apiSession called without a session");
  return s;
}
