"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { IconArrowRight, IconDatabase, IconDoc, IconShield, IconSparkle, IconUsers } from "./Icons";

const STEPS = [
  {
    icon: IconDoc,
    tone: "lavender",
    title: "Paste or upload the notes",
    body: "Give the meeting notes and the planning period. The notes are treated as data, never as instructions, and project scope comes from trusted configuration.",
  },
  {
    icon: IconSparkle,
    tone: "peach",
    title: "An AI writer drafts the plan",
    body: "It extracts decisions, owners, deadlines and estimated hours, each with a quote from the notes, and writes a follow-up draft. Missing facts stay empty instead of being guessed.",
  },
  {
    icon: IconShield,
    tone: "lime",
    title: "A second AI reviews it",
    body: "A separate reviewer checks every claim against the original notes and scores the draft. A pass means the draft matches the notes — it is not approval.",
  },
  {
    icon: IconDatabase,
    tone: "tomato",
    title: "Commitments meet capacity",
    body: "The reviewer looks up existing commitments and recorded capacity. Fixed rules then compute existing + new = projected load against capacity: Ready, Blocked or Unknown. Missing data is never treated as zero.",
  },
  {
    icon: IconUsers,
    tone: "chartreuse",
    title: "A human decides",
    body: "You see the decision, the evidence and the numbers, and can simulate changes. Nothing is sent without a person approving it — and in this build, sending is switched off entirely.",
  },
] as const;

export function HowItWorksButton({ className = "btn ghost-light lg" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const go = (n: number) => {
    setDir(n > i ? "fwd" : "back");
    setI(n);
  };
  const s = STEPS[i]!;
  const Icon = s.icon;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
      >
        See how a case is decided
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={`Step ${i + 1} of ${STEPS.length}`}
        title="How ActionReady decides a case"
        footer={
          <>
            <div className="step-dots" role="tablist" aria-label="Steps">
              {STEPS.map((x, n) => (
                <button key={x.title} type="button" role="tab" aria-selected={n === i} aria-label={`Step ${n + 1}: ${x.title}`} className={n === i ? "on" : ""} onClick={() => go(n)} />
              ))}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => go(i - 1)} disabled={i === 0}>
                Back
              </button>
              {i < STEPS.length - 1 ? (
                <button type="button" className="btn primary" onClick={() => go(i + 1)} autoFocus>
                  Next <IconArrowRight width={15} height={15} />
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => setOpen(false)}>
                  Got it
                </button>
              )}
            </div>
          </>
        }
      >
        <div key={i} className={`step-slide ${dir}`} aria-live="polite">
          <div className={`step-icon tone-${s.tone}`}>
            <Icon width={26} height={26} />
          </div>
          <h3 className="step-title">{s.title}</h3>
          <p className="step-body">{s.body}</p>
        </div>
      </Modal>
    </>
  );
}
