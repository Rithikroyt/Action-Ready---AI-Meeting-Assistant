import { IconCheck, IconLock, IconMail, IconShield, IconTable } from "./Icons";

// Landing-page product preview: a case as it appears in ActionReady, labelled as a synthetic example.
// Decorative copy of the real layout; every number here is illustrative, not a live result.
const PEOPLE = [
  { name: "Maya", existing: 6, add: 1, cap: 8, tasks: 1 },
  { name: "Dev", existing: 0, add: 5, cap: 10, tasks: 2 },
];

export function HeroPreview() {
  return (
    <figure className="preview" aria-label="Synthetic example of a case in ActionReady: AI review passed 5.0 of 5, readiness Ready, human approval not yet given, routed to the Approver.">
      <div className="pv-bar">
        <span className="pv-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="pv-url mono">actionready / cases / AR-DEMO</span>
        <span className="pv-tag mono">Synthetic example</span>
      </div>

      <div className="pv-body">
        <div className="pv-col">
          <p className="pv-k mono">01 — Three separate states</p>
          <div className="pv-states">
            <div className="pv-state">
              <span>AI review</span>
              <strong className="pill ready">Pass · 5.0/5</strong>
            </div>
            <div className="pv-state">
              <span>Readiness</span>
              <strong className="pill ready">Ready</strong>
            </div>
            <div className="pv-state">
              <span>Human approval</span>
              <strong className="pill neutral">Not given</strong>
            </div>
          </div>

          <p className="pv-k mono">02 — Capacity check</p>
          <ul className="pv-wl">
            {PEOPLE.map((p, n) => (
              <li key={p.name}>
                <div className="pv-wl-head">
                  <strong>{p.name}</strong>
                  <span className="mono">
                    {p.existing} + {p.add} of {p.cap} h
                  </span>
                </div>
                <div className="pv-track">
                  <span className="pv-seg existing" style={{ width: `${(p.existing / p.cap) * 100}%`, animationDelay: `${600 + n * 220}ms` }} />
                  <span className="pv-seg new" style={{ left: `${(p.existing / p.cap) * 100}%`, width: `${(p.add / p.cap) * 100}%`, animationDelay: `${900 + n * 220}ms` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="pv-col">
          <div className="pv-route">
            <span className="pv-route-icon" aria-hidden>
              <IconShield width={18} height={18} />
            </span>
            <div>
              <span className="pv-k mono">03 — Routed to</span>
              <strong>Approver</strong>
              <span className="pv-why">AI review passed and capacity is verified.</span>
            </div>
          </div>

          <p className="pv-k mono">04 — One email per employee</p>
          <ul className="pv-drafts">
            {PEOPLE.map((p) => (
              <li key={p.name}>
                <span className="pv-avatar" aria-hidden>
                  {p.name[0]}
                </span>
                <span className="pv-draft-text">
                  <strong>{p.name}</strong>
                  <span>
                    {p.tasks} task{p.tasks === 1 ? "" : "s"} · {p.add} h
                  </span>
                </span>
                <span className="pv-draft-state">
                  <IconMail width={12} height={12} aria-hidden /> Draft
                </span>
              </li>
            ))}
          </ul>
          <div className="pv-approve">
            <IconLock width={13} height={13} aria-hidden />
            <span>Nothing is sent until a person approves this exact text.</span>
          </div>
        </div>
      </div>

      <span className="pv-chip c1" aria-hidden>
        <IconTable width={13} height={13} /> Tracker · published &amp; verified
      </span>
      <span className="pv-chip c2" aria-hidden>
        <IconCheck width={13} height={13} /> Server re-checks before Gmail
      </span>
    </figure>
  );
}
