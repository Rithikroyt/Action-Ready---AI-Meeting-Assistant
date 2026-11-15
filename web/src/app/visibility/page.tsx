import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { getConfig } from "@/lib/env";
import { readFileSync } from "node:fs";
import { detailFromStored, getExperiment, listExperiments, type ExperimentDetail, type ExperimentSummary } from "@/lib/visibility/api";
import { recommendations, type RunRow } from "@/lib/visibility/core";
import { syntheticSample } from "@/lib/visibility/fixtures";
import type { Slice } from "@/lib/visibility/core";
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
  let coldFrom: { experiment_id: string; slice: Slice } | null = null;

  const snapshotPath = !live && process.env.ACTIONREADY_W5_SNAPSHOT ? process.env.ACTIONREADY_W5_SNAPSHOT : null;
  let snapshot = false;
  if (snapshotPath) {
    // Local documentation only (never set in production): renders REAL stored runs exported read-only from n8n.
    const snap = JSON.parse(readFileSync(snapshotPath, "utf8")) as { experiments: ExperimentSummary[]; runs: RunRow[] };
    list = snap.experiments;
    const pickId = id ?? snap.experiments.find((e) => e.kind !== "COLD")?.experiment_id ?? snap.experiments[0]?.experiment_id;
    const build = (eid: string) => detailFromStored(snap.experiments.find((e) => e.experiment_id === eid) as ExperimentDetail["experiment"], snap.runs.filter((r) => r.experiment_id === eid));
    if (pickId) detail = build(pickId);
    const coldExp = snap.experiments.find((e) => e.experiment_id !== pickId && String(e.contexts).includes("COLD"));
    if (detail && !detail.metrics.cold && coldExp) {
      const c = build(coldExp.experiment_id);
      if (c.metrics.cold) coldFrom = { experiment_id: coldExp.experiment_id, slice: c.metrics.cold };
    }
    snapshot = true;
  } else if (!live) {
    // (synthetic sample below)
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
      // Cold recall may live in its own experiment: show the latest finished one beside the selected experiment, labelled with its source.
      if (detail && !detail.metrics.cold) {
        const coldExp = list.find((e) => e.experiment_id !== detail!.experiment.experiment_id && String(e.contexts).includes("COLD") && (e.status === "COMPLETE" || e.status === "PARTIAL"));
        if (coldExp) {
          const c = await getExperiment(coldExp.experiment_id);
          if (c.kind === "ok" && c.data.metrics.cold) coldFrom = { experiment_id: coldExp.experiment_id, slice: c.data.metrics.cold };
        }
      }
    }
  }

  // Recommendations also consider cold recall when it was measured in a separate experiment.
  if (detail && coldFrom && !detail.metrics.cold) detail = { ...detail, recommendations: recommendations({ ...detail.metrics, cold: coldFrom.slice }, detail.readability) };

  return (
    <AppShell demoNote={!snapshot}>
      <VisibilityLab
        detail={detail}
        list={list}
        mode={live ? "live" : snapshot ? "snapshot" : "synthetic"}
        unavailable={unavailable}
        coldFrom={coldFrom}
        canStart={live && session.canSend && !unavailable}
        startBlockedReason={!live ? "Live experiments need the n8n connection. This page is showing the synthetic sample." : !session.canSend ? "Only approvers can start live experiments, because they make model calls." : unavailable ? "The workflow is unavailable right now." : null}
      />
    </AppShell>
  );
}
