// MOCKED: the n8n adapter against a fake fetch. No network, no live workflow.
import { describe, expect, it, vi } from "vitest";
import { fetchJobFromN8n, statusUrl, submitToN8n } from "@/lib/n8n";
import { normalizeStatusPath } from "@/lib/env";

const STATUS_PATH = "102388a4-df67-43ee-8af5-75fd76f9b81d/actionready/v1/jobs";
const target = { base: "https://example.app.n8n.cloud/webhook", headerName: "X-ActionReady-Key", secret: "s".repeat(24), statusPath: STATUS_PATH };
const sub = {
  request_id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427",
  notes: "Maya will prepare the walkthrough by 6 November 2026, estimated 4 hours.",
  period_start: "2026-11-02",
  period_end: "2026-11-06",
  timezone: "America/Phoenix",
};
const res = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("submitToN8n (MOCKED)", () => {
  it("sends the secret as a header, never in the URL or body", async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => res(202, { job_id: "job_abcdefgh", execution_status: "ACCEPTED" }));
    const out = await submitToN8n(target, sub, f as unknown as typeof fetch);
    expect(out).toEqual({ kind: "accepted", job_id: "job_abcdefgh" });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://example.app.n8n.cloud/webhook/actionready/v1/meetings");
    expect(String(url)).not.toContain(target.secret);
    expect(String(init?.body)).not.toContain(target.secret);
    expect((init?.headers as Record<string, string>)["X-ActionReady-Key"]).toBe(target.secret);
  });

  it("network failure is ambiguous and is not retried", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const out = await submitToN8n(target, sub, f as unknown as typeof fetch);
    expect(out.kind).toBe("ambiguous");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("202 without a valid job id is ambiguous, not accepted", async () => {
    const out = await submitToN8n(target, sub, (async () => res(202, { ok: true })) as unknown as typeof fetch);
    expect(out.kind).toBe("ambiguous");
  });

  it.each([
    [409, "conflict"],
    [422, "invalid"],
    [401, "unavailable"],
    [404, "unavailable"],
    [504, "ambiguous"],
    [500, "unavailable"],
  ])("HTTP %i → %s", async (status, kind) => {
    const out = await submitToN8n(target, sub, (async () => res(status, { error: { message: "x" } })) as unknown as typeof fetch);
    expect(out.kind).toBe(kind);
  });
});

describe("status URL (OFFLINE)", () => {
  it("matches n8n's production path, which includes the webhook-ID prefix", () => {
    expect(statusUrl(target, "0c6f2f0e-1d2b-4c3a-9e8f-1234567890ab")).toBe(
      "https://example.app.n8n.cloud/webhook/102388a4-df67-43ee-8af5-75fd76f9b81d/actionready/v1/jobs/0c6f2f0e-1d2b-4c3a-9e8f-1234567890ab",
    );
  });
  it("normalizes slashes and a copied ':job_id' suffix; rejects unsafe paths", () => {
    expect(normalizeStatusPath(`/${STATUS_PATH}/`)).toBe(STATUS_PATH);
    expect(normalizeStatusPath(`${STATUS_PATH}/:job_id`)).toBe(STATUS_PATH);
    expect(normalizeStatusPath("a//b")).toBe("a/b");
    for (const bad of ["", "   ", "../admin", "a/../b", "https://evil.example/x", "jobs?x=1"]) expect(normalizeStatusPath(bad)).toBe("");
  });
  it("GET uses the configured status path; POST path is unchanged", async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => res(200, { job_id: "job_abcdefgh" }));
    await fetchJobFromN8n(target, "job_abcdefgh", f as unknown as typeof fetch);
    expect(String(f.mock.calls[0]![0])).toBe(`https://example.app.n8n.cloud/webhook/${STATUS_PATH}/job_abcdefgh`);
  });
});

describe("fetchJobFromN8n (MOCKED)", () => {
  it("rejects malformed job ids without calling n8n", async () => {
    const f = vi.fn();
    expect(await fetchJobFromN8n(target, "../../admin", f as unknown as typeof fetch)).toEqual({ kind: "not_found" });
    expect(f).not.toHaveBeenCalled();
  });
  it("maps 404 and invalid JSON honestly", async () => {
    expect((await fetchJobFromN8n(target, "job_abcdefgh", (async () => res(404)) as unknown as typeof fetch)).kind).toBe("not_found");
    const bad = async () => new Response("<html>", { status: 200 });
    expect((await fetchJobFromN8n(target, "job_abcdefgh", bad as unknown as typeof fetch)).kind).toBe("unavailable");
  });
});
