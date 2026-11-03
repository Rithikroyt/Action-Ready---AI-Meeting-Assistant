import "server-only";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataMode, JobView } from "./contract";

// Server-side index of jobs submitted through this app, so the Overview can list them and the
// job route can enforce ownership. Stores NO meeting notes — only IDs, a fingerprint and the
// last allowlisted view. Single-process, serialized writes: a private-demo limitation.
export interface RegistryEntry {
  job_id: string;
  request_id: string;
  fingerprint: string;
  mode: DataMode;
  owner: string;
  submitted_at: string;
  period: { start: string; end: string; timezone: string };
  /** Last allowlisted view we rendered (cache for the Overview; refreshed on read). */
  snapshot: JobView | null;
  /** DEMO only: the synthetic result body. */
  demo_body?: unknown;
}

// Serverless hosts make the app directory read-only (on Vercel only /tmp is writable), so the folder is
// configurable and defaults to /tmp there. /tmp is per-instance and temporary: history there can reset.
const DIR = process.env.ACTIONREADY_DATA_DIR?.trim() || (process.env.VERCEL ? "/tmp/actionready" : path.join(process.cwd(), ".data"));
const FILE = path.join(DIR, "jobs.json");
/** True when case history lives in temporary storage that the host may discard. */
export const REGISTRY_TEMPORARY = DIR === "/tmp" || DIR.startsWith("/tmp/");
let chain: Promise<unknown> = Promise.resolve();

/** Probe that a job can be recorded BEFORE anything is sent, so no run is started that this app cannot track. */
export async function registryWritable(): Promise<boolean> {
  const probe = path.join(DIR, `.probe.${process.pid}.${Date.now()}`);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(probe, "", "utf8");
    await unlink(probe);
    return true;
  } catch {
    return false;
  }
}

async function load(): Promise<RegistryEntry[]> {
  try {
    const data = JSON.parse(await readFile(FILE, "utf8")) as unknown;
    return Array.isArray(data) ? (data as RegistryEntry[]) : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Job registry is unreadable.");
  }
}

async function save(rows: RegistryEntry[]) {
  await mkdir(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(rows, null, 1), "utf8");
  await rename(tmp, FILE);
}

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export const listJobs = async (owner: string) =>
  (await load()).filter((r) => r.owner === owner).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

export const findJob = async (owner: string, job_id: string) =>
  (await load()).find((r) => r.owner === owner && r.job_id === job_id) ?? null;

export const findByRequest = async (owner: string, request_id: string) =>
  (await load()).find((r) => r.owner === owner && r.request_id === request_id) ?? null;

export const addJob = (entry: RegistryEntry) =>
  serialized(async () => {
    const rows = await load();
    if (rows.some((r) => r.job_id === entry.job_id)) return;
    rows.push(entry);
    await save(rows);
  });

export const updateSnapshot = (job_id: string, snapshot: JobView) =>
  serialized(async () => {
    const rows = await load();
    const r = rows.find((x) => x.job_id === job_id);
    if (!r) return;
    r.snapshot = snapshot;
    await save(rows);
  });
