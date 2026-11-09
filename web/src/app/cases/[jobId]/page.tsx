import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { JOB_ID_RE } from "@/lib/contract";
import { requireSession } from "@/lib/session";
import { getJobView } from "@/lib/service";
import { CaseWorkspace } from "./CaseWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case" };

export default async function CasePage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  const { jobId } = await params;
  if (!JOB_ID_RE.test(jobId)) notFound();
  const res = await getJobView(session.sub, jobId);
  const now = Date.now();
  const initial =
    res.kind === "ok"
      ? ({ k: "ok", job: res.view, checkedAt: now } as const)
      : res.kind === "unavailable"
        ? ({ k: "unavailable", message: res.message, last: res.last_known, checkedAt: now } as const)
        : ({ k: "not_found" } as const);
  return (
    <AppShell>
      <CaseWorkspace jobId={jobId} initial={initial} />
    </AppShell>
  );
}
