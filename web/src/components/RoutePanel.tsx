"use client";

import { useMemo, useState } from "react";
import type { JobView } from "@/lib/contract";
import { coordinate } from "@/lib/coordinator";
import { Drawer } from "./Drawer";
import { RoleIcon } from "./RoleIcon";
import { IconHelp } from "./Icons";

/** Week 4: the next responsible role for this case, with a "Why this route?" evidence drawer. */
export function RoutePanel({ job }: { job: JobView }) {
  const r = useMemo(() => coordinate(job), [job]);
  const [open, setOpen] = useState(false);
  return (
    <section className={`route-strip tone-${r.route.tone}`} aria-labelledby="route-h">
      <span className="route-icon" aria-hidden>
        <RoleIcon role={r.route.role} size={18} />
      </span>
      <div className="route-text">
        <span className="section-label" id="route-h">
          Next responsible role
        </span>
        <strong>
          {r.route.role} · {r.route.label}
        </strong>
        <span className="small">{r.why[0]}</span>
      </div>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        <IconHelp width={14} height={14} /> Why this route?
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} eyebrow="Coordinator" title={`Routed to: ${r.route.label}`}>
        <div className="route-detail">
          <section>
            <h3>Why</h3>
            <ul className="plain-list">
              {r.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Evidence</h3>
            <dl className="kv">
              {r.evidence.map((e) => (
                <div key={e.label} style={{ display: "contents" }}>
                  <dt>{e.label}</dt>
                  <dd className="num">{e.value}</dd>
                </div>
              ))}
            </dl>
            {r.codes.length > 0 && (
              <p className="small muted" style={{ marginTop: 8 }}>
                Recorded reason codes: {r.codes.map((c) => <code key={c} style={{ marginRight: 6 }}>{c}</code>)}
              </p>
            )}
          </section>
          <section>
            <h3>What happens next</h3>
            <p>
              <strong>{r.route.role}:</strong> {r.route.next}
            </p>
            <p className="route-not-done">{r.not_done}</p>
          </section>
          {r.also.length > 0 && (
            <section>
              <h3>Also open</h3>
              <ul className="plain-list">
                {r.also.map((a) => (
                  <li key={a.route.id}>
                    <strong>
                      {a.route.label} ({a.route.role}):
                    </strong>{" "}
                    {a.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="hint">
            Routed by ActionReady&apos;s deterministic Coordinator rules applied to the official {job.mode === "LIVE" ? "workflow" : "synthetic"} result — no model call
            and no confidence score. The n8n Coordinator node is not deployed yet, so this route is computed by the app, not recorded by the workflow.
          </p>
        </div>
      </Drawer>
    </section>
  );
}
