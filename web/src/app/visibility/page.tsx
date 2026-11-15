import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { getConfig } from "@/lib/env";
import { getExperiment, listExperiments, type ExperimentDetail, type ExperimentSummary } from "@/lib/visibility/api";
import { syntheticSample } from "@/lib/visibility/fixtures";
import { VisibilityLab } from "./VisibilityLab";
import "./visibility.css";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "AI Visibility Lab" };

/**
 * Data source rules (never mixed):
 *  - demo / not connected → the synthetic sample, under a "Synthetic sample — not a measurement" banner;
 *  - live → only stored experiments from n8n; if n8n fails, "Disconnected / experiment unavailable" — never the sample.
 */
export default async function VisibilityPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const session = await requireSession();
  const cfg = getConfig();
  const live = cfg.mode === "live" && !!cfg.n8n;
  const { id } = await searchParams;

  let detail: ExperimentDetail | null = null;
  let list: ExperimentSummary[] = [];
  let unavailable: string | null = null;

  if (!live) {
    detail = syntheticSample() as unknown as ExperimentDetail;
  } else {
    const l = await listExperiments();
    if (l.kind !== "ok") unavailable = l.kind === "unavailable" ? l.message : "Not found.";
    else {
      list = l.data;
      const pick = id ?? list.find((e) => e.status === "COMPLETE" || e.status === "PARTIAL")?.experiment_id ?? list[0]?.experiment_id;
      if (pick) {
        const d = await getExperiment(pick);
        if (d.kind === "ok") detail = d.data;
        else if (d.kind === "unavailable") unavailable = d.message;
      }
    }
  }

  return (
    <AppShell>
      <VisibilityLab
        detail={detail}
        list={list}
        mode={live ? "live" : "synthetic"}
        unavailable={unavailable}
        canStart={live && session.canSend && !unavailable}
        startBlockedReason={!live ? "Live experiments need the n8n connection. This page is showing the synthetic sample." : !session.canSend ? "Only approvers can start live experiments, because they make model calls." : unavailable ? "The workflow is unavailable right now." : null}
      />
    </AppShell>
  );
}
