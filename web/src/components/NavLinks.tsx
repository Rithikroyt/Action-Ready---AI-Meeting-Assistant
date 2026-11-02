"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconPlus } from "./Icons";

const LINKS = [
  { href: "/", label: "Overview", icon: IconGrid, match: (p: string) => p === "/" || p.startsWith("/cases") },
  { href: "/meetings/new", label: "New meeting", icon: IconPlus, match: (p: string) => p.startsWith("/meetings/new") },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(path) ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
