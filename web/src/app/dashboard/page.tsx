import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconPlus, IconSparkle } from "@/components/Icons";
import { ReadinessDonut } from "@/components/ReadinessDonut";
import { requireSession, OWNER } from "@/lib/session";
import { overview } from "@/lib/service";
import { getConfig } from "@/lib/env";
import { countBy, toCaseRow } from "@/lib/caseList";
import { REGISTRY_TEMPORARY } from "@/lib/registry";
import { CaseList } from "./CaseList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  await requireSession();
  const cfg = getConfig();
  const rows = (await overview(OWNER)).map(toCaseRow);
  const counts = countBy(rows);
  const attention = counts.blocked + counts.unknown;

  return (
    <AppShell>
      <section className="welcome">
        <div className="welcome-copy">
          <span className="eyebrow light">
            <IconSparkle width={14} height={14} /> Commitment Control Center
          </span>
          <h1>Overview</h1>
          <p>
            {rows.length === 0
              ? "No cases yet. Analyze a meeting to see its review, readiness and approval — always shown separately."
              : attention > 0
                ? `${attention} case${attention === 1 ? " needs" : "s need"} a decision before anything moves forward.`
                : "No listed case is blocked or unknown right now."}
          </p>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <Link href="/meetings/new" className="btn light">
              <IconPlus />
              New meeting
            </Link>
            <Link href="/meetings/new?example=overload" className="btn ghost-dark">
              Load the overload example
            </Link>
          </div>
        </div>
        <ReadinessDonut counts={counts} />
      </section>
      <CaseList rows={rows} disconnected={cfg.mode === "live" && !cfg.n8n} temporaryHistory={REGISTRY_TEMPORARY} />
    </AppShell>
  );
}
