import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { getSession } from "@/lib/session";
import { IconLock, IconLogo } from "@/components/Icons";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const cfg = getConfig();
  const authReady = !!cfg.appPassword && !!cfg.sessionSecret;
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
              <p className="muted small">Commitment Control Center</p>
            </div>
          </div>
          {authReady ? (
            <LoginForm />
          ) : (
            <div className="banner warn" role="alert">
              <IconLock />
              <span>
                <strong>Sign-in is not configured.</strong> Set <code>APP_PASSWORD</code> and <code>SESSION_SECRET</code> in <code>web/.env.local</code>, then
                restart. See <code>.env.example</code>.
              </span>
            </div>
          )}
          <p className="muted small">Private single-owner demonstration. Not a multi-user deployment.</p>
        </div>
      </div>
    </div>
  );
}
