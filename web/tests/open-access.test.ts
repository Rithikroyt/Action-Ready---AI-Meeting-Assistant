// OFFLINE tests: password-free access is a demo-only switch; live mode always requires sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig } from "@/lib/env";
import { getSession } from "@/lib/session";

const KEYS = ["ACTIONREADY_MODE", "ACTIONREADY_OPEN_ACCESS", "APP_PASSWORD", "SESSION_SECRET"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
});

describe("open access", () => {
  it("demo + ACTIONREADY_OPEN_ACCESS=true needs no password and grants the owner session", async () => {
    Object.assign(process.env, { ACTIONREADY_MODE: "demo", ACTIONREADY_OPEN_ACCESS: "true" });
    const cfg = getConfig();
    expect(cfg.openAccess).toBe(true);
    expect(cfg.problems).not.toContain("APP_PASSWORD (min 12 characters)");
    expect(await getSession()).toMatchObject({ sub: "owner", kind: "guest", canSend: false });
  });

  it("is ignored in live mode, which still requires sign-in", () => {
    Object.assign(process.env, { ACTIONREADY_MODE: "live", ACTIONREADY_OPEN_ACCESS: "true" });
    const cfg = getConfig();
    expect(cfg.openAccess).toBe(false);
    expect(cfg.problems).toContain("APP_PASSWORD (min 12 characters)");
    expect(cfg.problems).toContain("SESSION_SECRET or AUTH_SECRET (min 32 characters)");
  });

  it("is off unless set to exactly 'true'", () => {
    for (const v of [undefined, "", "1", "yes", "TRUE"]) {
      if (v === undefined) delete process.env.ACTIONREADY_OPEN_ACCESS;
      else process.env.ACTIONREADY_OPEN_ACCESS = v;
      process.env.ACTIONREADY_MODE = "demo";
      expect(getConfig().openAccess).toBe(false);
    }
  });
});

describe("settings pasted into a host", () => {
  it("tolerate spaces, quotes and capitals in ACTIONREADY_MODE", async () => {
    for (const v of [" live", "live ", '"live"', "'live'", "LIVE", "Live"]) {
      process.env.ACTIONREADY_MODE = v;
      expect(getConfig().mode).toBe("live");
    }
    process.env.ACTIONREADY_MODE = "demo";
    expect(getConfig().mode).toBe("demo");
  });
});
