import Link from "next/link";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { getSession } from "@/lib/session";
import { IconAlert, IconLock, IconLogo } from "@/components/Icons";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured on this server.",
  google_cancelled: "Google sign-in was cancelled or blocked. If the app is in testing mode, ask the organizer to add your Google account as a test user.",
  state_mismatch: "That sign-in link expired or was opened in a different browser. Please try again.",
  no_code: "Google did not return a sign-in code. Please try again.",
  google_unreachable: "Google could not be reached. Please try again in a moment.",
  token_rejected: "Google rejected the sign-in. Check that the redirect URI in Google Cloud matches this site exactly.",
  no_id_token: "Google did not return an identity. Please try again.",
  bad_id_token: "The identity returned by Google could not be verified. Please try again.",
  email_not_verified: "Your Google account's email address is not verified.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const s = await getSession();
  if (s && s.kind !== "guest") redirect("/dashboard");
  const cfg = getConfig();
  const sp = await searchParams;
  const error = sp.error ? (ERRORS[sp.error] ?? "Sign-in failed. Please try again.") : null;
  const passwordReady = !!cfg.appPassword && !!cfg.sessionSecret;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/dashboard";
  return (
    <div className="auth">
      <div className="card fade-in">
        <div className="card-body stack" style={{ gap: 18, padding: 24 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="brand-mark">
              <IconLogo />
            </div>
            <div>
              <h1 style={{ fontSize: 17 }}>ActionReady</h1>
              <p className="muted small">Meeting notes to approved, sent follow-ups</p>
            </div>
          </div>

          {error && (
            <div className="banner error" role="alert">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {cfg.mode === "live" && !cfg.n8n && (
            <div className="banner error" role="alert">
              <IconAlert />
              <span>
                <strong>Live mode is on, but the server is not connected to n8n.</strong> Missing or invalid setting(s): {cfg.problems.filter((p) => p.startsWith("N8N_")).join("; ") || cfg.problems.join("; ")}. Fix them in the host&apos;s
                environment variables (Production) and redeploy.
              </span>
            </div>
          )}

          {cfg.google && (
            <a className="btn google-btn" href={`/api/auth/signin/google?next=${encodeURIComponent(next)}`}>
              <GoogleMark /> Continue with Google
            </a>
          )}

          {passwordReady && (
            <>
              {cfg.google && <div className="or-rule">or the organizer passphrase</div>}
              <LoginForm />
            </>
          )}

          {cfg.openAccess && (
            <Link href="/dashboard" className="btn ghost">
              Explore the synthetic demo without signing in
            </Link>
          )}

          {!cfg.google && !passwordReady && !cfg.openAccess && (
            <div className="banner warn" role="alert">
              <IconLock />
              <span>
                <strong>Sign-in is not configured.</strong> Set <code>AUTH_GOOGLE_ID</code>, <code>AUTH_GOOGLE_SECRET</code> and <code>AUTH_SECRET</code> (Google sign-in),
                or <code>APP_PASSWORD</code> and <code>SESSION_SECRET</code>, in the host&apos;s environment variables. See <code>.env.example</code>.
              </span>
            </div>
          )}

          <p className="muted small">
            Google sign-in only shares your name and email with ActionReady. It never gives access to your Gmail. Emails are sent from the organizer&apos;s
            connected account, and only by approvers the organizer has listed.
          </p>
        </div>
      </div>
    </div>
  );
}
