"use client";

import { useId, useMemo, useState } from "react";
import type { JobView, OwnerWorkload, Readiness } from "@/lib/contract";
import { fmtHours } from "@/lib/present";
import { officialInputs, simulate, suggestions } from "@/lib/whatif";
import { ReadinessBadge } from "./Badges";
import { WorkloadBar } from "./WorkloadBar";

// Local what-if: in-memory state only, no network, never writes to the official job object.
const ownerVerdict = (w: OwnerWorkload): Readiness => (w.status === "OVER_CAPACITY" ? "BLOCKED" : w.status === "WITHIN" ? "READY" : "UNKNOWN");
const toNum = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

export function WhatIf({ job }: { job: JobView }) {
  const simulatable = job.workload.filter((w) => officialInputs(w) !== null);
  const [ownerId, setOwnerId] = useState(simulatable[0]?.owner_id ?? null);
  if (job.workload.length === 0) return null;

  return (
    <section className="card" aria-labelledby="whatif-h">
      <div className="card-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 id="whatif-h">What-If Simulation</h2>
          <p className="hint">Simulation only — does not change the official ActionReady result or any stored record.</p>
        </div>
        {simulatable.length > 1 && (
          <select className="select" style={{ width: "auto" }} aria-label="Owner to simulate" value={ownerId ?? ""} onChange={(e) => setOwnerId(e.target.value)}>
            {simulatable.map((w) => (
              <option key={w.owner_id} value={w.owner_id}>
                {w.owner_label ?? w.owner_id}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="card-body">
        {simulatable.length === 0 ? (
          <p className="muted">
            Not available for this case: a simulation needs recorded existing work, new work and capacity. Missing values are never filled in with guesses.
          </p>
        ) : (
          <Simulator key={ownerId} job={job} official={simulatable.find((w) => w.owner_id === ownerId) ?? simulatable[0]!} />
        )}
      </div>
    </section>
  );
}

function Simulator({ job, official }: { job: JobView; official: OwnerWorkload }) {
  const start = officialInputs(official)!;
  const ids = { n: useId(), c: useId() };
  const [newH, setNewH] = useState(String(start.new_hours));
  const [capH, setCapH] = useState(String(start.capacity_hours));
  const sim = useMemo(
    () => simulate(official, { existing_hours: start.existing_hours, new_hours: toNum(newH), capacity_hours: toNum(capH) }),
    [official, start.existing_hours, newH, capH],
  );
  const changed = toNum(newH) !== start.new_hours || toNum(capH) !== start.capacity_hours;
  const max = Math.max(24, Math.ceil((start.existing_hours + start.new_hours) * 1.5), Math.ceil(start.capacity_hours * 1.5));
  const officialOwner = ownerVerdict(official);
  const otherIssues = job.issues.filter((i) => i.severity !== "NOTICE" && i.code !== "OVER_CAPACITY").length;
  const officialLabel = job.mode === "LIVE" ? "Official n8n result" : "Official result · synthetic demo";
  const reset = () => {
    setNewH(String(start.new_hours));
    setCapH(String(start.capacity_hours));
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="whatif-grid">
        <div className="wi-pane" aria-label={officialLabel}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="wi-tag official">{officialLabel}</span>
            <ReadinessBadge value={job.operational_readiness} />
          </div>
          <WorkloadBar w={official} compact />
        </div>

        <div className="wi-pane sim" aria-label="What-if simulation">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="wi-tag sim">What-if simulation</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="muted small">Simulated</span>
              <ReadinessBadge value={sim.readiness} />
            </span>
          </div>

          <div className="wi-controls">
            <div className="wi-control">
              <label htmlFor={ids.n}>New work</label>
              <div className="pair">
                <input type="range" min={0} max={max} step={0.5} value={Number.isFinite(toNum(newH)) ? toNum(newH) : 0} onChange={(e) => setNewH(e.target.value)} aria-label="New work hours slider" />
                <input id={ids.n} className="input" type="number" min={0} step={0.5} inputMode="decimal" value={newH} onChange={(e) => setNewH(e.target.value)} aria-describedby={`${ids.n}-h`} />
              </div>
              <span id={`${ids.n}-h`} className="hint">
                Official {fmtHours(start.new_hours)}
              </span>
            </div>
            <div className="wi-control">
              <label htmlFor={ids.c}>Recorded capacity</label>
              <div className="pair">
                <input type="range" min={0} max={max} step={0.5} value={Number.isFinite(toNum(capH)) ? toNum(capH) : 0} onChange={(e) => setCapH(e.target.value)} aria-label="Capacity hours slider" />
                <input id={ids.c} className="input" type="number" min={0} step={0.5} inputMode="decimal" value={capH} onChange={(e) => setCapH(e.target.value)} aria-describedby={`${ids.c}-h`} />
              </div>
              <span id={`${ids.c}-h`} className="hint">
                Official {fmtHours(start.capacity_hours)} · existing work fixed at {fmtHours(start.existing_hours)}
              </span>
            </div>
          </div>

          <div className="row">
            {suggestions(start).map((s) => (
              <button
                key={s.label}
                type="button"
                className="btn sm"
                onClick={() => {
                  setNewH(String(s.inputs.new_hours));
                  setCapH(String(s.inputs.capacity_hours));
                }}
              >
                Try: {s.label}
              </button>
            ))}
            <button type="button" className="btn sm ghost" onClick={reset} disabled={!changed}>
              Reset to official
            </button>
          </div>

          <div aria-live="polite">
            {sim.workload ? (
              <WorkloadBar w={sim.workload} compact />
            ) : (
              <p className="small" style={{ color: "var(--unknown)" }}>
                Simulation result UNKNOWN: {sim.invalid}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        {changed && sim.readiness !== officialOwner && sim.workload && (
          <p className="wi-diff" role="status">
            Only the hypothetical outcome changed. The official result is still <strong>{job.operational_readiness.replace("_", " ")}</strong> until the records or notes
            are actually updated and the meeting is re-analyzed.
          </p>
        )}
        {otherIssues > 0 && (
          <p className="hint">
            This simulation recalculates hours only. {otherIssues} other issue{otherIssues > 1 ? "s" : ""} in the official result still appl{otherIssues > 1 ? "y" : "ies"}.
          </p>
        )}
        <p className="hint">Calculated in this browser tab. Nothing is sent, saved, or used to change commitments, capacity, approval or email.</p>
      </div>
    </div>
  );
}
