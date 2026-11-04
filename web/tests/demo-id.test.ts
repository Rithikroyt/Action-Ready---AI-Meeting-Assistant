// OFFLINE tests: self-describing demo job IDs rebuild exactly the case that was submitted, and nothing else.
import { describe, expect, it } from "vitest";
import { buildDemoBody, demoJobId, rebuildDemoBody } from "@/lib/demo";
import { JOB_ID_RE } from "@/lib/contract";
import { DEMO_TIMEZONE, SCENARIOS } from "@/lib/fixtures";

const sub = (id: string, timezone = DEMO_TIMEZONE) => {
  const s = SCENARIOS.find((x) => x.id === id)!;
  return { s, sub: { request_id: "r", notes: s.notes, period_start: s.period!.start, period_end: s.period!.end, timezone } };
};
const AT = new Date("2026-11-03T18:00:00.000Z");

describe("demo job IDs", () => {
  it("are valid job IDs for every loadable example", () => {
    for (const s of SCENARIOS.filter((x) => x.period)) expect(JOB_ID_RE.test(demoJobId(s.id, AT, DEMO_TIMEZONE))).toBe(true);
  });

  it("rebuild the identical body (readiness, workload, timestamps)", () => {
    for (const id of ["overload", "missing-capacity", "within"]) {
      const { s, sub: x } = sub(id);
      const original = buildDemoBody(s, x, AT);
      expect(rebuildDemoBody(original.job_id)).toEqual(original);
    }
  });

  it("keep the submitted timezone", () => {
    const { s, sub: x } = sub("overload", "Asia/Kolkata");
    expect(rebuildDemoBody(buildDemoBody(s, x, AT).job_id)?.period.timezone).toBe("Asia/Kolkata");
  });

  it("reject tampered, unknown or non-demo IDs", () => {
    const good = buildDemoBody(sub("overload").s, sub("overload").sub, AT).job_id;
    expect(rebuildDemoBody(good.replace("overload", "not-a-scenario"))).toBeNull();
    expect(rebuildDemoBody(good + "x")).toBeNull();
    expect(rebuildDemoBody(`demo_overload_${(Date.now() + 86_400_000).toString(36)}`)).toBeNull(); // future time
    expect(rebuildDemoBody("demo_overload_abc123_" + Buffer.from("Not/AZone").toString("base64url"))).toBeNull();
    expect(rebuildDemoBody("8c0a7199-ec8a-461d-9849-064eda2de1b2")).toBeNull(); // a live job ID
  });
});
