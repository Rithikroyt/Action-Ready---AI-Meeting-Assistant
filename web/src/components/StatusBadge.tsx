import type { StatusDef, StatusIcon } from "@/lib/status";
import { IconAlert, IconCheckCircle, IconClock, IconDash, IconHelp, IconLock, IconX } from "./Icons";

const ICONS: Record<Exclude<StatusIcon, "pulse">, (p: { width: number; height: number }) => React.ReactElement> = {
  check: IconCheckCircle,
  x: IconX,
  alert: IconAlert,
  help: IconHelp,
  clock: IconClock,
  dash: IconDash,
  lock: IconLock,
};

export function StatusGlyph({ icon, size = 13 }: { icon: StatusIcon; size?: number }) {
  if (icon === "pulse") return <span className="pulse" aria-hidden />;
  const I = ICONS[icon];
  return <I width={size} height={size} />;
}

/** Icon + visible label + full screen-reader phrase. Meaning never depends on colour alone. */
export function StatusBadge({ def, size = "md", suffix }: { def: StatusDef; size?: "md" | "lg"; suffix?: string }) {
  return (
    <span className={`badge status ${def.tone} ${size === "lg" ? "lg" : ""}`} title={def.description}>
      <StatusGlyph icon={def.icon} size={size === "lg" ? 15 : 13} />
      <span aria-hidden>
        {def.label}
        {suffix ?? ""}
      </span>
      <span className="sr-only">
        {def.sr}
        {suffix ?? ""}
      </span>
    </span>
  );
}

/** The three official status families, side by side (stacked on small screens). Never merged into one. */
export function StatusSummary({ items }: { items: { def: StatusDef; note?: string | null; suffix?: string }[] }) {
  return (
    <section className="status-cards" aria-label="Official status">
      {items.map(({ def, note, suffix }) => (
        <div key={def.family} className={`status-card tone-${def.tone}`}>
          <span className="k">{def.family}</span>
          <StatusBadge def={def} size="lg" suffix={suffix} />
          <p className="why">{note ?? def.description}</p>
        </div>
      ))}
    </section>
  );
}
