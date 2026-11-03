import type { Decision, DecisionPart } from "@/lib/decision";
import type { Issue } from "@/lib/contract";
import { StatusGlyph } from "./StatusBadge";

const ICON = { blocked: "x", unknown: "help", ready: "check", neutral: "dash", accent: "clock" } as const;

function Part({ part, level }: { part: DecisionPart; level: "primary" | "secondary" }) {
  const H = level === "primary" ? "h2" : "h3";
  return (
    <div className={`decision-part ${level}`}>
      <H className="decision-title">
        <StatusGlyph icon={ICON[part.tone]} size={level === "primary" ? 18 : 15} />
        {part.title}
      </H>
      <p className="decision-summary">{part.summary}</p>
      {part.question && (
        <p className="decision-question">
          <span className="section-label">Decision needed</span>
          {part.question}
        </p>
      )}
    </div>
  );
}

/** The official conclusion in plain language, placed directly under the status cards. */
export function DecisionCard({ decision, reasons, questions }: { decision: Decision; reasons: Issue[]; questions: string[] }) {
  const { primary, secondary } = decision;
  // Show official clarification questions that add something beyond the headline question.
  const extraQuestions = questions.filter((q) => q !== primary.question && q !== secondary?.question);
  return (
    <section className={`decision tone-${primary.tone}`} aria-labelledby="decision-h" aria-live="polite">
      <span id="decision-h" className="sr-only">
        Official conclusion
      </span>
      <Part part={primary} level="primary" />
      {secondary && (
        <div className={`decision-secondary tone-${secondary.tone}`}>
          <span className="section-label">Operational readiness — decided independently</span>
          <Part part={secondary} level="secondary" />
        </div>
      )}
      {(reasons.length > 0 || extraQuestions.length > 0) && (
        <div className="decision-reasons">
          {reasons.length > 0 && (
            <>
              <span className="section-label">Recorded reasons</span>
              <ul className="issue-list">
                {reasons.map((i, n) => (
                  <li key={n}>
                    <span className={`issue-sev ${i.severity.toLowerCase()}`}>{i.severity === "BLOCKING" ? "Blocking" : "Unresolved"}</span>
                    <span>
                      {i.message} <code className="muted small">{i.code}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {extraQuestions.length > 0 && (
            <>
              <span className="section-label">Questions recorded by the workflow</span>
              <ol className="questions">
                {extraQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
      <p className="decision-foot">
        ActionReady does not reassign tasks, move dates, change capacity records or send anything. External action is not permitted from this screen.
      </p>
    </section>
  );
}
