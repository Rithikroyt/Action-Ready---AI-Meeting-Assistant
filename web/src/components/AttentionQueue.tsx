import Link from "next/link";
import type { CaseRow } from "@/lib/caseList";
import { ATTENTION_ORDER, ROUTES } from "@/lib/coordinator";
import { RoleIcon } from "./RoleIcon";

/** "Needs your attention": cases grouped by the next responsible role, each with the reason it is there. */
export function AttentionQueue({ rows }: { rows: CaseRow[] }) {
  const lanes = ATTENTION_ORDER.map((id) => ({ def: ROUTES[id], items: rows.filter((r) => r.route?.id === id) })).filter((l) => l.items.length > 0);
  return (
    <section className="card attention" aria-labelledby="attn-h">
      <div className="card-head">
        <div>
          <h2 id="attn-h">Needs your attention</h2>
          <p className="hint">Each case is routed to the role that must act next, with the recorded reason.</p>
        </div>
        <span className="small muted">{lanes.reduce((n, l) => n + l.items.length, 0)} waiting</span>
      </div>
      {lanes.length === 0 ? (
        <p className="card-body muted">Nothing is waiting on a person right now. Routing appears here as soon as a result is recorded.</p>
      ) : (
        <div className="lanes">
          {lanes.map(({ def, items }) => (
            <div key={def.id} className={`lane tone-${def.tone}`}>
              <div className="lane-head">
                <span className="lane-icon" aria-hidden>
                  <RoleIcon role={def.role} />
                </span>
                <div>
                  <strong>{def.label}</strong>
                  <span className="small muted">Next: {def.role}</span>
                </div>
                <span className="lane-count num" aria-label={`${items.length} case${items.length === 1 ? "" : "s"}`}>
                  {items.length}
                </span>
              </div>
              <ul>
                {items.slice(0, 4).map((r) => (
                  <li key={r.job_id}>
                    <Link href={`/cases/${r.job_id}`} className="row-link">
                      {r.title}
                    </Link>
                    <span className="small muted">{r.route?.why}</span>
                  </li>
                ))}
              </ul>
              {items.length > 4 && <p className="small muted">+{items.length - 4} more in the list below</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
