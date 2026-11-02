// OFFLINE: normalization allowlist + submission validation.
import { describe, expect, it } from "vitest";
import { normalizeJob, submissionSchema, STALE_AFTER_MS } from "@/lib/contract";

const valid = {
  request_id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  notes: "Project Atlas weekly planning. Maya will prepare the walkthrough by 6 November 2026, estimated 4 hours.",
  period_start: "2026-11-02",
  period_end: "2026-11-06",
  timezone: "America/Phoenix",
};

describe("submission schema", () => {
  it("accepts a valid body", () => expect(submissionSchema.safeParse(valid).success).toBe(true));
  it("rejects extra fields such as project_id or approval flags", () => {
    expect(submissionSchema.safeParse({ ...valid, project_id: "OTHER" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...valid, approved: true }).success).toBe(false);
  });
  it("rejects reversed, impossible and over-long periods", () => {
    expect(submissionSchema.safeParse({ ...valid, period_end: "2026-11-01" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...valid, period_start: "2026-02-30" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...valid, period_end: "2026-12-31" }).success).toBe(false);
  });
  it("rejects unknown timezones and oversized notes without truncating", () => {
    expect(submissionSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...valid, notes: "word ".repeat(3000) }).success).toBe(false);
  });
  it("rejects a non-UUID request id", () => expect(submissionSchema.safeParse({ ...valid, request_id: "abc" }).success).toBe(false));
});

describe("normalizeJob", () => {
  it("drops fields outside the allowlist (notes, transcripts, credentials)", () => {
    const v = normalizeJob(
      {
        job_id: "job_abcdefgh",
        execution_status: "SUCCEEDED",
        raw_notes: "FULL NOTES",
        intermediateSteps: [{ observation: "secret" }],
        credentials: { token: "x" },
        operational_readiness: "BLOCKED",
      },
      "LIVE",
    );
    const s = JSON.stringify(v);
    expect(s).not.toContain("FULL NOTES");
    expect(s).not.toContain("secret");
    expect(s).not.toContain("token");
  });

  it("missing readiness is NOT_CHECKED, never READY", () => {
    const v = normalizeJob({ job_id: "job_abcdefgh", execution_status: "SUCCEEDED", review_status: "AI_REVIEWED_NOT_HUMAN_APPROVED" }, "LIVE");
    expect(v.operational_readiness).toBe("NOT_CHECKED");
    expect(v.review.state).toBe("PASSED");
  });

  it("unknown numbers stay null, not zero", () => {
    const v = normalizeJob(
      { job_id: "job_abcdefgh", execution_status: "SUCCEEDED", workload: [{ owner_id: "maya", existing_open_hours: "", available_hours: null, projected_load: "n/a" }] },
      "LIVE",
    );
    expect(v.workload[0]).toMatchObject({ existing_open_hours: null, available_hours: null, projected_load: null });
  });

  it("parses JSON-string fields as stored by n8n Code nodes", () => {
    const v = normalizeJob(
      { job_id: "job_abcdefgh", execution_status: "SUCCEEDED", actions: JSON.stringify([{ action_id: "A1", task: "T", owner: "Maya", estimated_hours: "4" }]) },
      "LIVE",
    );
    expect(v.actions[0]).toMatchObject({ action_id: "A1", estimated_hours: 4 });
  });

  it("unknown execution status → UNKNOWN; external action defaults to NOT_PERMITTED", () => {
    const v = normalizeJob({ job_id: "job_abcdefgh", execution_status: "DONE?" }, "LIVE");
    expect(v.execution_status).toBe("UNKNOWN");
    expect(v.external_action).toBe("NOT_PERMITTED");
  });

  it("an old RUNNING job becomes a stale observation, not a success", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    const v = normalizeJob({ job_id: "job_abcdefgh", execution_status: "RUNNING", timestamps: { updated_at: new Date(now - STALE_AFTER_MS - 1000).toISOString() } }, "LIVE", now);
    expect(v.stale).toBe(true);
    expect(v.execution_status).toBe("RUNNING");
  });

  it("FAILED without an error body still gets a safe message", () => {
    const v = normalizeJob({ job_id: "job_abcdefgh", execution_status: "FAILED" }, "LIVE");
    expect(v.error?.message).toMatch(/did not complete/);
  });
});
