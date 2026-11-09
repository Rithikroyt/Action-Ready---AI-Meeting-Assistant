import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { getConfig } from "@/lib/env";
import { SCENARIOS, DEMO_TIMEZONE } from "@/lib/fixtures";
import { NewMeetingForm, type ExampleOption } from "./NewMeetingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  const session = await requireSession();
  const cfg = getConfig();
  const liveNotApprover = cfg.mode === "live" && !session.canSend;
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
      {liveNotApprover && (
        <div className="banner warn" role="status" style={{ marginBottom: 16 }}>
          <span>
            <strong>Only approvers can start a live analysis.</strong> Each analysis runs the AI on the organizer&apos;s accounts. Ask the organizer to add your
            Google account to the approver list, or open an existing case from the Overview.
          </span>
        </div>
      )}
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
