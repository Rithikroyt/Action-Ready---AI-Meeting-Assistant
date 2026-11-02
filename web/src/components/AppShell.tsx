import { getConfig } from "@/lib/env";
import { logout } from "@/app/login/actions";
import { ModeBadge } from "./Badges";
import { IconLogo } from "./Icons";
import { NavLinks } from "./NavLinks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
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
            <div className="brand-sub">Commitment Control Center</div>
          </div>
        </div>
        <NavLinks />
        <div className="sidebar-foot">
          <div className="context-card" aria-label="Authorized context">
            <span className="label">Project</span>
            <span style={{ fontWeight: 580 }}>{cfg.projectLabel}</span>
            <span className="mono muted">{cfg.projectId}</span>
            <div className="row">
              <ModeBadge mode={cfg.mode} />
            </div>
          </div>
          <form action={logout}>
            <button className="btn ghost sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="main">
        <main id="main" className="content">
          {cfg.mode === "demo" && (
            <div className="banner demo" role="note">
              <span>
                <strong>Synthetic demo mode.</strong> Only labeled example meetings run, evaluated by this app&apos;s copy of the readiness rules. No n8n
                workflow, model, or tool call is involved, so no result here is a live test.
              </span>
            </div>
          )}
          {disconnected && (
            <div className="banner error" role="alert">
              <span>
                <strong>Disconnected.</strong> Live mode is selected but the server is missing: {cfg.problems.join(", ")}. Nothing will be submitted until
                this is fixed. Results are never replaced with demo data.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
