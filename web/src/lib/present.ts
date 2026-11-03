// Formatting helpers shared by server and client. Status labels and tones live in ./status.ts.

export const fmtHours = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtPeriod(p: { start: string; end: string } | null | undefined) {
  if (!p) return "No period";
  const f = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const year = p.end.slice(0, 4);
  return `${f(p.start)} – ${f(p.end)}, ${year}`;
}

export function relTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.round((now - t) / 1000);
  const abs = Math.abs(s);
  const r = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  const out = abs < 45 ? r(abs, "second") : abs < 2700 ? r(Math.round(abs / 60), "minute") : abs < 64800 ? r(Math.round(abs / 3600), "hour") : r(Math.round(abs / 86400), "day");
  return s >= 0 ? `${out} ago` : `in ${out}`;
}
