import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getConfig } from "@/lib/env";
import { exchangeCode, OAUTH_COOKIE, safeNext } from "@/lib/google";
import { googleSessionCookie, openToken, safeEqual } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Google redirects here. Check the state, exchange the code, and start a session for the verified email. */
export async function GET(req: Request) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const jar = await cookies();
  const fail = (code: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${code}`, url.origin), 303);
    r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return r;
  };
  if (!cfg.google || !cfg.sessionSecret) return fail("google_not_configured");
  if (url.searchParams.get("error")) return fail("google_cancelled");
  const saved = openToken(jar.get(OAUTH_COOKIE)?.value, cfg.sessionSecret);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!saved || typeof saved.state !== "string" || typeof saved.verifier !== "string" || !state || !safeEqual(state, saved.state)) return fail("state_mismatch");
  if (!code || code.length > 2048) return fail("no_code");
  const out = await exchangeCode({ code, verifier: saved.verifier, origin: url.origin, clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret });
  if (!out.ok) return fail(out.code);
  const r = NextResponse.redirect(new URL(safeNext(saved.next), url.origin), 303);
  const sc = googleSessionCookie(out.identity.email, out.identity.name);
  r.cookies.set(sc.name, sc.value, sc.options);
  r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  r.headers.set("Cache-Control", "no-store");
  return r;
}
