import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { fetchTeam } from "@/lib/team";
import { TeamView } from "./TeamView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireSession();
  const team = await fetchTeam();
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <div className="crumbs">Team</div>
          <h1>Team &amp; capacity</h1>
          <p className="sub">
            Who can own tasks, the names they go by in meeting notes, and how many project hours each person has per planning week. The readiness check uses
            exactly this — the AI never invents people or capacity, and a week without hours stays Unknown.
          </p>
        </div>
      </div>
      {team.kind === "ok" ? (
        <TeamView people={team.people} freshnessDays={team.freshness_days} canEdit={session.canSend} />
      ) : (
        <section className="card">
          <div className="empty">
            <h2>Team roster unavailable</h2>
            <p className="muted">{team.message}</p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
