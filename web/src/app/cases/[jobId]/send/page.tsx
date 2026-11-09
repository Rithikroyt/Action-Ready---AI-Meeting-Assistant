import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { JOB_ID_RE, type JobView } from "@/lib/contract";
import { requireSession, OWNER } from "@/lib/session";
import { getJobView } from "@/lib/service";
import { routingFor } from "@/lib/coordinator";
import { ReviewSend } from "./ReviewSend";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review & Send" };

/** Why a case cannot be sent, or null when it is eligible. The n8n workflow re-checks all of this server-side. */
function blocker(job: JobView): string | null {
  if (job.mode !== "LIVE") return "Synthetic demo cases can never be sent. Review & Send works only on live workflow cases.";
  if (job.execution_status !== "SUCCEEDED") return "The analysis has not finished successfully.";
  if (job.review.state !== "PASSED") return "Only a version that passed AI review can be sent.";
  if (job.operational_readiness !== "READY") return `Operational readiness is ${job.operational_readiness.toLowerCase().replace("_", " ")}. Only READY plans can be sent.`;
  const r = routingFor(job);
  if (r.route.id !== "APPROVAL") return `This case is routed to ${r.route.label} (${r.route.role}), not to approval.`;
  if (!job.draft) return "This case has no reviewed draft to send.";
  if (job.version === null) return "The reviewed version is unknown.";
  return null;
}

export default async function SendPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireSession();
  const { jobId } = await params;
  if (!JOB_ID_RE.test(jobId)) notFound();
  const res = await getJobView(OWNER, jobId);
  const job = res.kind === "ok" ? res.view : null;
  const why = job ? blocker(job) : res.kind === "unavailable" ? res.message : "No case with this ID for this account.";
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/dashboard">Overview</Link>
            <span aria-hidden>/</span>
            <Link href={`/cases/${jobId}`}>Case</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">Review &amp; Send</span>
          </nav>
          <h1>Review &amp; Send</h1>
          <p className="sub">Approve the exact message and recipients for this version. The workflow re-checks every rule before Gmail is called.</p>
        </div>
      </div>
      {why || !job ? (
        <section className="card">
          <div className="empty">
            <h2>Not available for this case</h2>
            <p className="muted" style={{ maxWidth: 520 }}>
              {why}
            </p>
            <Link href={`/cases/${jobId}`} className="btn">
              Back to the case
            </Link>
          </div>
        </section>
      ) : (
        <ReviewSend job={job} />
      )}
    </AppShell>
  );
}
