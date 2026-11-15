import Link from "next/link";
import { getConfig } from "@/lib/env";
import { getSession } from "@/lib/session";
import { logout } from "@/app/login/actions";
import { ModeBadge } from "./Badges";
import { IconLock, IconLogo } from "./Icons";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export async function AppShell({ children, demoNote = true }: { children: React.ReactNode; demoNote?: boolean }) {
  const cfg = getConfig();
  const session = await getSession();
  const disconnected = cfg.mode === "live" && !cfg.n8n;
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="appbar" aria-label="ActionReady">
        <div className="appbar-inner">
          <Link href="/" className="brand" aria-label="ActionReady home">
            <span className="brand-mark">
              <IconLogo />
            </span>
            <span className="brand-name">ActionReady</span>
          </Link>
          <NavLinks />
          <div className="appbar-right">
            <span className="scope-chip" title={`Project ${cfg.projectLabel} (${cfg.projectId}), set by trusted configuration`}>
              <IconLock width={12} height={12} aria-hidden />
              <span className="sr-only">Project</span>
              <span className="scope-label">{cfg.projectLabel}</span>
            </span>
            <ModeBadge mode={cfg.mode} disconnected={disconnected} />
            <ThemeToggle />
            {!session || session.kind === "guest" ? (
              <>
                <span className="small muted guest-note">Open demo · not signed in</span>
                {cfg.google && (
                  <Link href="/login" className="btn sm primary">
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
        </div>
      </header>
      <main id="main" className="content">
        {cfg.mode === "demo" && demoNote && (
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
      <footer className="app-foot">
        <span className="mono">ActionReady</span>
        <span>From meeting notes to verified, feasible action.</span>
      </footer>
    </div>
  );
}
