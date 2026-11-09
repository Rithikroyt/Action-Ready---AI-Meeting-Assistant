import { NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { newOAuthRequest, OAUTH_COOKIE } from "@/lib/google";
import { sealToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start Google sign-in: redirect to Google with a fresh state + PKCE challenge held in a signed 10-minute cookie. */
export async function GET(req: Request) {
  const cfg = getConfig();
  const url = new URL(req.url);
  if (!cfg.google || !cfg.sessionSecret) return NextResponse.redirect(new URL("/login?error=google_not_configured", url.origin), 303);
  const { url: target, cookie } = newOAuthRequest(cfg.google.clientId, url.origin, url.searchParams.get("next") ?? "/dashboard");
  const res = NextResponse.redirect(target, 303);
  res.cookies.set(OAUTH_COOKIE, sealToken(cookie, cfg.sessionSecret, 600), { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth", maxAge: 600 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
