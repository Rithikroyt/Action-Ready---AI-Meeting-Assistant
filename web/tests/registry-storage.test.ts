// OFFLINE tests: job-registry location and the "can this case be recorded?" check that runs before any submission.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_PERIOD, DEMO_TIMEZONE, SCENARIOS } from "@/lib/fixtures";

const KEYS = ["ACTIONREADY_DATA_DIR", "VERCEL", "ACTIONREADY_MODE", "N8N_WEBHOOK_BASE", "N8N_WEBHOOK_HEADER_NAME", "N8N_WEBHOOK_SECRET", "N8N_JOB_STATUS_PATH"];
let saved: Record<string, string | undefined>;
let scratch: string;

// The registry folder is read at module load, so each test imports fresh modules after setting the environment.
const load = async () => {
  vi.resetModules();
  return { registry: await import("@/lib/registry"), service: await import("@/lib/service") };
};

const overload = SCENARIOS.find((s) => s.id === "overload")!;
const submission = () => ({
  request_id: crypto.randomUUID(),
  notes: overload.notes,
  period_start: DEMO_PERIOD.start,
  period_end: DEMO_PERIOD.end,
  timezone: DEMO_TIMEZONE,
});

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  scratch = mkdtempSync(path.join(tmpdir(), "ar-registry-"));
});

afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  vi.unstubAllGlobals();
  rmSync(scratch, { recursive: true, force: true });
});

// A folder path under a regular file can never be created, like a read-only serverless app directory.
const unwritableDir = () => {
  const file = path.join(scratch, "not-a-folder");
  writeFileSync(file, "");
  return path.join(file, "registry");
};

describe("registry location", () => {
  it("uses ACTIONREADY_DATA_DIR when set and reports it writable", async () => {
    process.env.ACTIONREADY_DATA_DIR = path.join(scratch, "data");
    const { registry } = await load();
    expect(await registry.registryWritable()).toBe(true);
    expect(registry.REGISTRY_TEMPORARY).toBe(false);
  });

  it("defaults to temporary /tmp storage on Vercel", async () => {
    process.env.VERCEL = "1";
    const { registry } = await load();
    expect(registry.REGISTRY_TEMPORARY).toBe(true);
  });

  it("reports an unwritable folder instead of throwing", async () => {
    process.env.ACTIONREADY_DATA_DIR = unwritableDir();
    const { registry } = await load();
    expect(await registry.registryWritable()).toBe(false);
  });
});

describe("submission when cases cannot be recorded", () => {
  it("LIVE: nothing is sent to n8n, so no untracked run starts", async () => {
    Object.assign(process.env, {
      ACTIONREADY_DATA_DIR: unwritableDir(),
      ACTIONREADY_MODE: "live",
      N8N_WEBHOOK_BASE: "https://example.invalid/webhook",
      N8N_WEBHOOK_HEADER_NAME: "X-ActionReady-Key",
      N8N_WEBHOOK_SECRET: "x".repeat(24),
      N8N_JOB_STATUS_PATH: "abc/actionready/v1/jobs",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { service } = await load();
    const out = await service.submitMeeting("owner", submission());
    expect(out.kind).toBe("unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DEMO: returns a clear message instead of a server error", async () => {
    process.env.ACTIONREADY_DATA_DIR = unwritableDir();
    const { service } = await load();
    const out = await service.submitMeeting("owner", submission());
    expect(out).toMatchObject({ kind: "unavailable", message: expect.stringContaining("cannot record cases") });
  });

  it("DEMO with writable storage still records and reopens the case", async () => {
    process.env.ACTIONREADY_DATA_DIR = path.join(scratch, "data");
    const { service } = await load();
    const out = await service.submitMeeting("owner", submission());
    expect(out.kind).toBe("accepted");
    if (out.kind !== "accepted") return;
    const view = await service.getJobView("owner", out.job_id);
    expect(view.kind).toBe("ok");
  });
});
