"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconLogo, IconPlus } from "./Icons";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: IconGrid, match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/cases") },
  { href: "/meetings/new", label: "New meeting", icon: IconPlus, match: (p: string) => p.startsWith("/meetings/new") },
  { href: "/", label: "Home", icon: IconLogo, match: (p: string) => p === "/" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(path) ? "page" : undefined}>
          <span className="nav-icon">
            <Icon />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
