import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Google sign-in: OAuth 2.0 authorization-code flow with PKCE and a signed state cookie.
// Scopes are identity only (openid email profile). This never requests Gmail access.

export const OAUTH_COOKIE = "ar_oauth";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const callbackPath = "/api/auth/callback/google";
export const redirectUri = (origin: string) => `${origin}${callbackPath}`;

/** Only relative in-app paths may be used as the post-sign-in destination (no open redirects). */
export const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?![/\\])[A-Za-z0-9/_\-?=&.%]*$/.test(n) && n.length <= 200 ? n : "/dashboard");

export function newOAuthRequest(clientId: string, origin: string, next: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: { state, verifier, next: safeNext(next) } };
}

export type GoogleIdentity = { email: string; name: string | null };
export type ExchangeResult = { ok: true; identity: GoogleIdentity } | { ok: false; code: string };

/**
 * Exchange the code and read the ID token. The token comes straight from Google's token endpoint over TLS in
 * response to our authenticated request, so (per Google's OpenID guidance) its claims are checked rather than its
 * signature: audience, issuer, expiry, and a verified email.
 */
export async function exchangeCode(
  p: { code: string; verifier: string; origin: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: p.code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: redirectUri(p.origin), grant_type: "authorization_code", code_verifier: p.verifier }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, code: "google_unreachable" };
  }
  if (!res.ok) return { ok: false, code: "token_rejected" };
  const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  const parts = typeof body?.id_token === "string" ? body.id_token.split(".") : [];
  if (parts.length !== 3) return { ok: false, code: "no_id_token" };
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "bad_id_token" };
  }
  if (c.aud !== p.clientId || !ISSUERS.includes(String(c.iss)) || typeof c.exp !== "number" || c.exp * 1000 < Date.now()) return { ok: false, code: "bad_id_token" };
  if (c.email_verified !== true || typeof c.email !== "string" || !c.email.includes("@")) return { ok: false, code: "email_not_verified" };
  return { ok: true, identity: { email: c.email.toLowerCase(), name: typeof c.name === "string" ? c.name : null } };
}
