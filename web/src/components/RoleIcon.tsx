import type { Role } from "@/lib/coordinator";
import { IconAlert, IconArrowRight, IconCheckCircle, IconClock, IconDatabase, IconDoc, IconShield, IconUsers } from "./Icons";

const ICONS: Record<Role, (p: { width: number; height: number }) => React.ReactElement> = {
  System: IconClock,
  Requester: IconDoc,
  "Technical reviewer": IconAlert,
  Manager: IconUsers,
  "Data steward": IconDatabase,
  Approver: IconShield,
  Dispatcher: IconArrowRight,
  Organizer: IconCheckCircle,
};

/** Decorative icon for a responsible role; the role name is always shown as text beside it. */
export function RoleIcon({ role, size = 16 }: { role: string; size?: number }) {
  const I = ICONS[role as Role] ?? IconClock;
  return <I width={size} height={size} />;
}
