import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconPlus } from "@/components/Icons";
import { requireSession, OWNER } from "@/lib/session";
import { overview } from "@/lib/service";
import { getConfig } from "@/lib/env";
import { toCaseRow } from "@/lib/caseList";
import { CaseList } from "./CaseList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  await requireSession();
  const cfg = getConfig();
  const rows = (await overview(OWNER)).map(toCaseRow);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">From meeting notes to verified, feasible action. Review, readiness and approval are always shown separately.</p>
        </div>
        <Link href="/meetings/new" className="btn primary">
          <IconPlus />
          New meeting
        </Link>
      </div>
      <CaseList rows={rows} disconnected={cfg.mode === "live" && !cfg.n8n} />
    </AppShell>
  );
}
