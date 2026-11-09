import Link from "next/link";
import { getConfig } from "@/lib/env";
import { getSession } from "@/lib/session";
import { logout } from "@/app/login/actions";
import { ModeBadge } from "./Badges";
import { IconLock, IconLogo } from "./Icons";
import { NavLinks } from "./NavLinks";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
  const session = await getSession();
  const disconnected = cfg.mode === "live" && !cfg.n8n;
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <IconLogo />
          </div>
          <div>
            <div className="brand-name">ActionReady</div>
            <div className="brand-sub">Meeting intelligence &amp; commitment governance</div>
          </div>
        </div>
        <NavLinks />
        <div className="sidebar-foot">
          <p className="brand-tagline">From meeting notes to verified, feasible action.</p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar" aria-label="Environment and session">
          <div className="topbar-scope">
            <IconLock width={13} height={13} aria-hidden />
            <span className="muted small">Project</span>
            <span className="small" style={{ fontWeight: 580 }}>
              {cfg.projectLabel}
            </span>
            <code className="muted">{cfg.projectId}</code>
          </div>
          <div className="topbar-right">
            <ModeBadge mode={cfg.mode} disconnected={disconnected} />
            {!session || session.kind === "guest" ? (
              <>
                <span className="small muted">Open demo · not signed in</span>
                {cfg.google && (
                  <Link href="/login" className="btn sm">
                    Sign in with Google
                  </Link>
                )}
              </>
            ) : (
              <>
                <span className="user-chip" title={session.email ?? "Organizer passphrase"}>
                  <span className="user-avatar" aria-hidden>
                    {(session.name ?? session.email ?? "O").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="user-text">
                    <span className="small" style={{ fontWeight: 600 }}>
                      {session.name ?? session.email ?? "Organizer"}
                    </span>
                    <span className="tiny muted">{session.canSend ? "Approver · can send" : "Reviewer · cannot send"}</span>
                  </span>
                </span>
                <form action={logout}>
                  <button className="btn ghost sm" type="submit">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </header>
        <main id="main" className="content">
          {cfg.mode === "demo" && (
            <div className="banner demo" role="note">
              <span>
                <strong>Synthetic demo.</strong> Only labeled example meetings run, evaluated by this app&apos;s copy of the readiness rules. No n8n workflow,
                model or tool call is involved, so nothing here is a live test.
              </span>
            </div>
          )}
          {disconnected && (
            <div className="banner error" role="alert">
              <span>
                <strong>Disconnected from n8n.</strong> Live mode is selected but the server is missing: {cfg.problems.join(", ")}. Nothing will be submitted
                until this is fixed, and results are never replaced with demo data.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
