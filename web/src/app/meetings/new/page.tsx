import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { getConfig } from "@/lib/env";
import { SCENARIOS, DEMO_TIMEZONE } from "@/lib/fixtures";
import { NewMeetingForm, type ExampleOption } from "./NewMeetingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  await requireSession();
  const cfg = getConfig();
  const { example } = await searchParams;
  const examples: ExampleOption[] = SCENARIOS.filter((s) => s.loadable && s.period).map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    notes: s.notes,
    period: s.period!,
    timezone: DEMO_TIMEZONE,
  }));
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="crumbs">Meetings / New</div>
          <h1>New meeting</h1>
          <p className="sub">Paste the complete notes. Owners, deadlines and estimates are checked against recorded commitments for the period you set.</p>
        </div>
      </div>
      <NewMeetingForm
        examples={examples}
        initialExample={examples.find((e) => e.id === example)?.id ?? null}
        project={{ id: cfg.projectId, label: cfg.projectLabel }}
        mode={cfg.mode}
        canSubmit={cfg.mode === "demo" || !!cfg.n8n}
      />
    </AppShell>
  );
}
