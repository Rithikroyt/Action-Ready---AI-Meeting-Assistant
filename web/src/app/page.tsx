import Link from "next/link";
import { getConfig } from "@/lib/env";
import { HeroArt } from "@/components/HeroArt";
import { HowItWorksButton } from "@/components/HowItWorks";
import { Reveal } from "@/components/Reveal";
import { ModeBadge } from "@/components/Badges";
import { IconArrowRight, IconChart, IconDatabase, IconDoc, IconHelp, IconLogo, IconShield, IconSparkle, IconUsers } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "From meeting notes to verified, feasible action" };

const PIPELINE = [
  { icon: IconDoc, tone: "lavender", title: "Notes in", body: "Paste or upload meeting notes with an explicit planning period." },
  { icon: IconSparkle, tone: "peach", title: "AI writer", body: "Extracts owners, deadlines and hours — each with a source quote." },
  { icon: IconShield, tone: "lime", title: "AI reviewer", body: "Checks every claim against the notes and scores the draft." },
  { icon: IconDatabase, tone: "tomato", title: "Register + capacity", body: "Looks up existing commitments and recorded capacity." },
  { icon: IconUsers, tone: "chartreuse", title: "Human decides", body: "Sees the decision, the evidence and the numbers. Nothing is sent automatically." },
] as const;

const PRINCIPLES = [
  { icon: IconHelp, title: "Missing is never zero", body: "A missing capacity record is Unknown — never 0 hours and never unlimited.", tone: "unknown" },
  { icon: IconDatabase, title: "Tool use is proven", body: "Commitment and capacity lookups count only when the call is observed in the run, not when an agent claims it.", tone: "accent" },
  { icon: IconChart, title: "Three separate states", body: "AI review, operational readiness and human approval are shown side by side and never merged.", tone: "ready" },
  { icon: IconShield, title: "Notes are data", body: "Instructions hidden inside notes or records cannot change scope, recipients or approval.", tone: "blocked" },
] as const;

export default function LandingPage() {
  const cfg = getConfig();
  const disconnected = cfg.mode === "live" && !cfg.n8n;
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="land-nav">
        <Link href="/" className="land-brand" aria-label="ActionReady home">
          <span className="brand-mark">
            <IconLogo />
          </span>
          <span>ActionReady</span>
        </Link>
        <nav aria-label="Sections" className="land-links">
          <a href="#how">How it works</a>
          <a href="#states">Statuses</a>
          <a href="#math">The math</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="land-nav-cta">
          <ModeBadge mode={cfg.mode} disconnected={disconnected} />
          <Link href="/dashboard" className="btn primary">
            Open workspace <IconArrowRight width={15} height={15} />
          </Link>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <IconSparkle width={14} height={14} /> Meeting intelligence · commitment governance
            </span>
            <h1 className="hero-title">
              From meeting notes to <span className="grad-text">verified, feasible</span> action.
            </h1>
            <p className="hero-sub">
              ActionReady turns rough meeting notes into a reviewed action plan, then checks every new commitment against existing work and recorded capacity —
              before anything moves forward.
            </p>
            <div className="hero-cta">
              <Link href="/meetings/new?example=overload" className="btn primary lg">
                Try the overload example <IconArrowRight width={16} height={16} />
              </Link>
              <HowItWorksButton />
            </div>
            <ul className="hero-proof" aria-label="Highlights">
              <li>
                <span className="dot lime" aria-hidden /> Two AI agents, one checks the other
              </li>
              <li>
                <span className="dot lav" aria-hidden /> Deterministic readiness rules
              </li>
              <li>
                <span className="dot peach" aria-hidden /> Human approval stays separate
              </li>
            </ul>
          </div>
          <div className="hero-visual">
            <HeroArt />
          </div>
        </section>

        <section id="how" className="land-section">
          <Reveal>
            <span className="eyebrow">How it works</span>
            <h2 className="land-h2">Five steps, every one visible</h2>
            <p className="land-lead">Each step leaves evidence you can inspect on the case page.</p>
          </Reveal>
          <ol className="pipeline">
            {PIPELINE.map((p, n) => (
              <Reveal as="li" key={p.title} delay={n * 90} className={`pipe-step tone-${p.tone}`}>
                <span className="pipe-num">{n + 1}</span>
                <span className="pipe-icon" aria-hidden>
                  <p.icon width={22} height={22} />
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="states" className="land-section">
          <Reveal>
            <span className="eyebrow">Statuses</span>
            <h2 className="land-h2">Three answers, never merged</h2>
            <p className="land-lead">A passing AI review never implies the plan is feasible, and neither implies a person approved it.</p>
          </Reveal>
          <div className="state-cards">
            <Reveal className="state-card lav" delay={0}>
              <span className="state-k">AI review</span>
              <strong>Does the draft match the notes?</strong>
              <div className="state-pills">
                <span className="pill ready">Pass</span>
                <span className="pill unknown">Needs clarification</span>
                <span className="pill neutral">Technical review</span>
              </div>
            </Reveal>
            <Reveal className="state-card lime" delay={100}>
              <span className="state-k">Operational readiness</span>
              <strong>Is there capacity for the work?</strong>
              <div className="state-pills">
                <span className="pill ready">Ready</span>
                <span className="pill blocked">Blocked</span>
                <span className="pill unknown">Unknown</span>
              </div>
            </Reveal>
            <Reveal className="state-card peach" delay={200}>
              <span className="state-k">Human approval</span>
              <strong>Has a person signed off?</strong>
              <div className="state-pills">
                <span className="pill neutral">Not requested</span>
                <span className="pill unknown">Pending</span>
                <span className="pill ready">Approved</span>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="math" className="land-section math">
          <Reveal className="math-copy">
            <span className="eyebrow">The math</span>
            <h2 className="land-h2">The notes look fine. The register disagrees.</h2>
            <p className="land-lead">
              Maya&apos;s new 4-hour task looks harmless on its own. Add the 6 hours she already owes and the plan is 2 hours over her recorded capacity — so the
              case is Blocked, with the decision spelled out.
            </p>
            <Link href="/meetings/new?example=overload" className="btn primary">
              Run this synthetic example <IconArrowRight width={15} height={15} />
            </Link>
          </Reveal>
          <Reveal className="math-card" delay={120}>
            <div className="math-head">
              <span className="pill blocked">Blocked</span>
              <span className="muted small">Synthetic example</span>
            </div>
            <div className="math-bar" role="img" aria-label="6 hours existing plus 4 hours new equals 10 hours projected, against 8 hours capacity: 2 hours over.">
              <span className="seg existing" style={{ width: "54.5%" }} />
              <span className="seg new" style={{ width: "18.2%" }} />
              <span className="seg over" style={{ width: "18.2%" }} />
              <span className="cap" style={{ left: "72.7%" }}>
                <em>Capacity 8 h</em>
              </span>
            </div>
            <dl className="math-eq">
              <div>
                <dt>Existing</dt>
                <dd>6 h</dd>
              </div>
              <span aria-hidden>+</span>
              <div>
                <dt>New</dt>
                <dd>4 h</dd>
              </div>
              <span aria-hidden>=</span>
              <div>
                <dt>Projected</dt>
                <dd>10 h</dd>
              </div>
              <span aria-hidden>vs</span>
              <div>
                <dt>Capacity</dt>
                <dd>8 h</dd>
              </div>
              <div className="neg">
                <dt>Margin</dt>
                <dd>−2 h</dd>
              </div>
            </dl>
          </Reveal>
        </section>

        <section id="safety" className="land-section">
          <Reveal>
            <span className="eyebrow">Safety</span>
            <h2 className="land-h2">Built to refuse a confident wrong answer</h2>
          </Reveal>
          <div className="principles">
            {PRINCIPLES.map((p, n) => (
              <Reveal key={p.title} className={`principle tone-${p.tone}`} delay={n * 80}>
                <p.icon width={18} height={18} aria-hidden />
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal as="section" className="cta-band">
          <IconChart width={28} height={28} aria-hidden />
          <h2>See a real decision in under a minute.</h2>
          <p>
            Open the workspace, load a synthetic example and watch the readiness check work
            {cfg.openAccess ? " — no account, no setup." : ". You will be asked for the workspace passphrase."}
          </p>
          <div className="hero-cta">
            <Link href="/dashboard" className="btn light lg">
              Open workspace <IconArrowRight width={16} height={16} />
            </Link>
            <HowItWorksButton className="btn ghost-dark lg" />
          </div>
        </Reveal>
      </main>

      <footer className="land-foot">
        <span>ActionReady · CIS 515 project</span>
        <span className="muted">{cfg.mode === "demo" ? "Synthetic demo — no n8n workflow, model or tool call runs here." : "Live results come from the n8n workflow."}</span>
      </footer>
    </div>
  );
}
