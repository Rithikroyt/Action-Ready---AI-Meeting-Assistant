"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamPerson } from "@/lib/team";
import { useToast } from "@/components/Toast";
import { IconAlert, IconLock, IconPlus } from "@/components/Icons";

/** Monday–Friday of the week containing `d` (local dates), as YYYY-MM-DD. */
function workWeek(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: f(mon), end: f(fri) };
}
const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

interface Draft {
  owner_id?: string;
  display_name: string;
  aliases: string;
  period_start: string;
  period_end: string;
  hours: string;
}

export function TeamView({ people, freshnessDays, canEdit }: { people: TeamPerson[]; freshnessDays: number; canEdit: boolean }) {
  const ids = { name: useId(), aliases: useId(), start: useId(), end: useId(), hours: useId() };
  const router = useRouter();
  const toast = useToast();
  const week = useMemo(() => workWeek(), []);
  const blank: Draft = { display_name: "", aliases: "", period_start: week.start, period_end: week.end, hours: "" };
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft.owner_id ? people.find((p) => p.owner_id === draft.owner_id) : null;
  const staleMs = freshnessDays * 86400000;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const hours = draft.hours.trim() === "" ? undefined : Number(draft.hours);
    if (hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 80)) return setError("Hours must be a number from 0 to 80.");
    const body = {
      ...(draft.owner_id ? { owner_id: draft.owner_id } : {}),
      display_name: draft.display_name.trim(),
      aliases: draft.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      ...(hours !== undefined ? { period_start: draft.period_start, period_end: draft.period_end, available_hours: hours } : {}),
    };
    setBusy(true);
    try {
      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) return setError(b.error?.message ?? `Not saved (HTTP ${res.status}).`);
      toast({ tone: "success", title: `${body.display_name} saved`, body: hours !== undefined ? `${hours} h for ${fmt(draft.period_start)} – ${fmt(draft.period_end)}.` : "Names updated." });
      setDraft(blank);
      router.refresh();
    } catch {
      setError("No response — the change may or may not be saved. Reload to check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-grid">
      <section className="card" aria-labelledby="people-h">
        <div className="card-head">
          <h2 id="people-h">People</h2>
          <span className="small muted">{people.length} total</span>
        </div>
        <ul className="team-list">
          {people.map((p) => (
            <li key={p.owner_id} className={p.active ? "" : "inactive"}>
              <div className="team-person">
                <span className="draft-avatar" aria-hidden>
                  {p.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="team-person-text">
                  <strong>{p.display_name}</strong>
                  <span className="small muted">
                    {p.source === "CONFIGURED" ? "Configured in the workflow" : "Added on the Team page"} · ID <code>{p.owner_id}</code>
                  </span>
                  <span className="team-names">
                    {p.names.map((n) => (
                      <span key={n} className="team-name">
                        {n}
                      </span>
                    ))}
                  </span>
                </div>
                {canEdit && (
                  <button type="button" className="btn sm" onClick={() => { setError(null); setDraft({ ...blank, owner_id: p.owner_id, display_name: p.display_name }); }}>
                    Set hours / names
                  </button>
                )}
              </div>
              {p.capacity.length > 0 ? (
                <ul className="team-cap">
                  {p.capacity.map((c) => {
                    const stale = !c.updated_at || Date.now() - Date.parse(c.updated_at) > staleMs;
                    return (
                      <li key={c.capacity_id}>
                        <span>
                          {fmt(c.period_start)} – {fmt(c.period_end)}
                        </span>
                        <strong className="num">{c.available_hours ?? "?"} h</strong>
                        {stale && <span className="team-stale" title={`Older than ${freshnessDays} days: readiness treats it as Unknown until it is re-saved.`}>Stale</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="small muted team-none">No hours recorded yet — this person&apos;s tasks come out Unknown.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="form-h">
        <div className="card-head">
          <h2 id="form-h">{editing ? `Update ${editing.display_name}` : "Add a person"}</h2>
          {editing && (
            <button type="button" className="btn ghost sm" onClick={() => setDraft(blank)}>
              <IconPlus width={13} height={13} /> New person instead
            </button>
          )}
        </div>
        {canEdit ? (
          <form className="card-body stack" onSubmit={(e) => void save(e)}>
            <div className="field">
              <label htmlFor={ids.name}>Full name</label>
              <input id={ids.name} className="input" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="Priya Raman" required disabled={!!editing} />
            </div>
            <div className="field">
              <label htmlFor={ids.aliases}>Other names used in notes (optional, comma separated)</label>
              <input id={ids.aliases} className="input" value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="Priya R, PR" />
              <span className="hint">The first name is added automatically unless someone else already uses it (for example two people called Sam).</span>
            </div>
            <fieldset className="team-hours">
              <legend className="small">Available project hours for a planning period</legend>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <div className="field">
                  <label htmlFor={ids.start}>From</label>
                  <input id={ids.start} type="date" className="input" value={draft.period_start} onChange={(e) => setDraft({ ...draft, period_start: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={ids.end}>To</label>
                  <input id={ids.end} type="date" className="input" value={draft.period_end} onChange={(e) => setDraft({ ...draft, period_end: e.target.value })} />
                </div>
                <div className="field" style={{ maxWidth: 120 }}>
                  <label htmlFor={ids.hours}>Hours</label>
                  <input id={ids.hours} type="number" min={0} max={80} step={0.25} className="input" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} placeholder="30" />
                </div>
              </div>
              <span className="hint">Use the same dates as the meeting&apos;s planning period. Leave hours empty to change only names.</span>
            </fieldset>
            {error && (
              <div className="banner error" role="alert">
                <IconAlert />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="btn primary" disabled={busy || !draft.display_name.trim()}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add person"}
            </button>
          </form>
        ) : (
          <div className="card-body">
            <p className="muted">
              <IconLock width={13} height={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              Only approvers can change the team. Ask the organizer to add people or hours.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
