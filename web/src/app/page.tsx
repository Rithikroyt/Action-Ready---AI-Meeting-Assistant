import { DemoVideoButton } from "@/components/DemoVideoButton";
import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/env";
import { ROUTES, type RouteId } from "@/lib/coordinator";
import { HeroPreview } from "@/components/HeroPreview";
import { HowItWorksButton } from "@/components/HowItWorks";
import { Reveal } from "@/components/Reveal";
import { ModeBadge } from "@/components/Badges";
import { RoleIcon } from "@/components/RoleIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CountUp } from "@/components/CountUp";
import { IconArrowRight, IconDatabase, IconDoc, IconHelp, IconLogo, IconMail, IconRoute, IconShield, IconSparkle, IconUsers, IconChart } from "@/components/Icons";

export const dynamic = "force-dynamic";
// The public product page is the one page crawlers may index; it points agents at the machine-readable profile.
export const metadata: Metadata = {
  title: "From meeting notes to verified, feasible action",
  robots: { index: true, follow: true },
  alternates: { types: { "application/json": "/agent-profile.json" } },
};

const PIPELINE = [
  { icon: IconDoc, title: "Notes in", body: "A structured intake form takes the notes, the planning week and the timezone." },
  { icon: IconSparkle, title: "AI writer", body: "Extracts owners, deadlines and hours, each with a source quote." },
  { icon: IconShield, title: "AI reviewer", body: "Checks every claim against the notes, the register and recorded capacity." },
  { icon: IconRoute, title: "Coordinator", body: "Deterministic rules route the case to the one role that must act next." },
  { icon: IconUsers, title: "Human approval", body: "The approver confirms one email per employee: exact text, exact recipients." },
  { icon: IconMail, title: "Send & track", body: "Gmail sends after a server re-check; approved tasks reach the tracker." },
] as const;

const ROUTE_CARDS: { id: RouteId; when: string; action: string }[] = [
  { id: "CLARIFICATION", when: "Information is missing from the notes", action: "Answers the clarification questions." },
  { id: "TECHNICAL_REVIEW", when: "The AI output failed validation", action: "Inspects the run. Nothing is published." },
  { id: "MANAGER_REVIEW", when: "Someone would be over capacity", action: "Decides: re-scope, re-assign or accept." },
  { id: "DATA_REVIEW", when: "Capacity or commitment records are missing", action: "Fixes the records. Missing is never zero." },
  { id: "APPROVAL", when: "AI review passed and capacity is verified", action: "Reviews each email and approves the send." },
  { id: "DISPATCH", when: "A person approved this exact version", action: "Gmail sends; the task tracker is published and verified." },
];

const PRINCIPLES = [
  { icon: IconHelp, title: "Missing is never zero", body: "A missing capacity record is Unknown — never 0 hours and never unlimited.", tone: "unknown" },
  { icon: IconDatabase, title: "Tool use is proven", body: "Commitment and capacity lookups count only when the call is observed in the run, not when an agent claims it.", tone: "accent" },
  { icon: IconChart, title: "Three separate states", body: "AI review, operational readiness and human approval are shown side by side and never merged.", tone: "ready" },
  { icon: IconShield, title: "Notes are data", body: "Instructions hidden inside notes or records cannot change scope, recipients or approval.", tone: "blocked" },
] as const;

const STATS = [
  { n: 2, label: "AI agents", sub: "One writes the plan, one checks it" },
  { n: 6, label: "Routes", sub: "Each with an owner and a next action" },
  { n: 3, label: "Separate states", sub: "Review, readiness, approval — never merged" },
  { n: 0, label: "Emails without approval", sub: "Re-checked on the server before Gmail" },
];

export default function LandingPage() {
  const cfg = getConfig();
  const disconnected = cfg.mode === "live" && !cfg.n8n;
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="land-nav">
        <div className="land-nav-inner">
          <Link href="/" className="land-brand" aria-label="ActionReady home">
            <span className="brand-mark">
              <IconLogo />
            </span>
            <span>ActionReady</span>
          </Link>
          <nav aria-label="Sections" className="land-links">
            <a href="#how">How it works</a>
            <a href="#routing">Routing</a>
            <a href="#states">Statuses</a>
            <a href="#safety">Safety</a>
          </nav>
          <div className="land-nav-cta">
            <ModeBadge mode={cfg.mode} disconnected={disconnected} />
            <ThemeToggle />
            <DemoVideoButton className="btn ghost" compact />
            <Link href="/dashboard" className="btn primary">
              Open workspace <IconArrowRight width={15} height={15} />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-grid" aria-hidden />
          <div className="hero-horizon" aria-hidden />
          <div className="hero-copy">
            <span className="eyebrow">Meeting follow-through · roles, routing &amp; guardrails</span>
            <h1 className="hero-title">
              From meeting notes
              <br /> to <em className="grad-text">approved</em> action.
            </h1>
            <p className="hero-sub">
              ActionReady reads your meeting notes, checks every new commitment against real workload and capacity, routes each case to the person who must
              act — and sends nothing until a human approves it.
            </p>
            <div className="hero-cta">
              <Link href="/dashboard" className="btn sun lg">
                Open the workspace <IconArrowRight width={16} height={16} />
              </Link>
              <HowItWorksButton className="btn glass lg" />
              <DemoVideoButton className="btn glass lg" label="Watch the demo video" />
            </div>
          </div>
          <div className="hero-visual">
            <HeroPreview />
          </div>
        </section>

        <section className="stats-band" aria-label="ActionReady at a glance">
          {STATS.map((s, n) => (
            <Reveal key={s.label} className="stat-tile" delay={n * 80}>
              <CountUp value={s.n} className="stat-tile-n" />
              <strong>{s.label}</strong>
              <span>{s.sub}</span>
            </Reveal>
          ))}
        </section>

        <section id="how" className="land-section">
          <Reveal className="sec-head">
            <span className="eyebrow">01 — How it works</span>
            <h2 className="land-h2">
              Six steps, <em>every one</em> visible.
            </h2>
            <p className="land-lead">Each step leaves evidence you can inspect on the case page.</p>
          </Reveal>
          <ol className="pipeline">
            {PIPELINE.map((p, n) => (
              <Reveal as="li" key={p.title} delay={n * 80} className="pipe-step">
                <span className="pipe-num mono">{String(n + 1).padStart(2, "0")}</span>
                <span className="pipe-icon" aria-hidden>
                  <p.icon width={20} height={20} />
                </span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="routing" className="land-section">
          <Reveal className="sec-head">
            <span className="eyebrow">02 — Routing</span>
            <h2 className="land-h2">
              Every case lands with <em>the right person.</em>
            </h2>
            <p className="land-lead">
              A deterministic coordinator — plain rules, not another AI — classifies each result and hands it to one role, with a recorded reason and a next
              action.
            </p>
          </Reveal>
          <div className="routes-grid">
            {ROUTE_CARDS.map((c, n) => {
              const r = ROUTES[c.id];
              return (
                <Reveal key={c.id} className={`route-card tone-${r.tone}`} delay={n * 70}>
                  <div className="route-card-head">
                    <span className="route-icon" aria-hidden>
                      <RoleIcon role={r.role} size={18} />
                    </span>
                    <span className="mono route-card-n">R{n + 1}</span>
                  </div>
                  <span className="route-card-role">{r.role}</span>
                  <strong>{r.label}</strong>
                  <p className="route-card-when">
                    <span className="mono">When</span> {c.when}
                  </p>
                  <p className="route-card-action">
                    <span className="mono">Does</span> {c.action}
                  </p>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section id="states" className="land-section">
          <Reveal className="sec-head">
            <span className="eyebrow">03 — Statuses</span>
            <h2 className="land-h2">
              Three answers, <em>never merged.</em>
            </h2>
            <p className="land-lead">A passing AI review never implies the plan is feasible, and neither implies a person approved it.</p>
          </Reveal>
          <div className="state-cards">
            <Reveal className="state-card s1" delay={0}>
              <span className="state-k mono">AI review</span>
              <strong>Does the draft match the notes?</strong>
              <div className="state-pills">
                <span className="pill ready">Pass</span>
                <span className="pill unknown">Needs clarification</span>
                <span className="pill neutral">Technical review</span>
              </div>
            </Reveal>
            <Reveal className="state-card s2" delay={100}>
              <span className="state-k mono">Operational readiness</span>
              <strong>Is there capacity for the work?</strong>
              <div className="state-pills">
                <span className="pill ready">Ready</span>
                <span className="pill blocked">Blocked</span>
                <span className="pill unknown">Unknown</span>
              </div>
            </Reveal>
            <Reveal className="state-card s3" delay={200}>
              <span className="state-k mono">Human approval</span>
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
            <span className="eyebrow">04 — The math</span>
            <h2 className="land-h2">
              The notes look fine. <em>The register disagrees.</em>
            </h2>
            <p className="land-lead">
              Maya&apos;s new 4-hour task looks harmless on its own. Add the 6 hours she already owes and the plan is 2 hours over her recorded capacity — so the
              case is Blocked and routed to her manager, with the decision spelled out.
            </p>
            <Link href="/meetings/new?example=overload" className="btn primary">
              Run this synthetic example <IconArrowRight width={15} height={15} />
            </Link>
          </Reveal>
          <Reveal className="math-card" delay={120}>
            <div className="math-head">
              <span className="pill blocked">Blocked</span>
              <span className="muted small mono">Synthetic example</span>
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
          <Reveal className="sec-head">
            <span className="eyebrow">05 — Safety</span>
            <h2 className="land-h2">
              Built to refuse a <em>confident wrong answer.</em>
            </h2>
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
          <div className="cta-sun" aria-hidden />
          <span className="eyebrow">Try it</span>
          <h2>
            See a real decision <em>in under a minute.</em>
          </h2>
          <p>
            Open the workspace, load a synthetic example and watch the readiness check and the routing work
            {cfg.openAccess ? " — no account, no setup." : cfg.google ? ". Sign in with Google to open the workspace." : ". You will be asked for the workspace passphrase."}
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
        <span className="mono">
          ActionReady · CIS 515 project ·{" "}
          <a href="/agent-profile.json" type="application/json">
            Agent profile (JSON)
          </a>
        </span>
        <span className="muted">{cfg.mode === "demo" ? "Synthetic demo — no n8n workflow, model or tool call runs here." : "Live results come from the n8n workflow."}</span>
      </footer>
    </div>
  );
}
