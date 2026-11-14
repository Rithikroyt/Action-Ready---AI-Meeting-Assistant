"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { IconGrid, IconPlus, IconUsers } from "./Icons";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: IconGrid, match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/cases") },
  { href: "/meetings/new", label: "New meeting", icon: IconPlus, match: (p: string) => p.startsWith("/meetings/new") },
  { href: "/team", label: "Team", icon: IconUsers, match: (p: string) => p.startsWith("/team") },
];

// Survives client-side navigations (the shell re-mounts per page), so the pill slides from the previous tab.
let lastPill: { x: number; w: number } | null = null;

export function NavLinks() {
  const path = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number; animate: boolean } | null>(lastPill ? { ...lastPill, animate: false } : null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    if (!nav || !active) {
      setPill(null);
      return;
    }
    const measure = (animate: boolean) => {
      const next = { x: active.offsetLeft, w: active.offsetWidth };
      lastPill = next;
      setPill({ ...next, animate });
    };
    // first frame: stay where the previous page left the pill; next frame: slide to the new tab
    const raf = requestAnimationFrame(() => measure(true));
    const onResize = () => measure(false);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [path]);

  return (
    <nav ref={navRef} className="nav" aria-label="Primary">
      {pill && <span className={`nav-pill ${pill.animate ? "anim" : ""}`} style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden />}
      {LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(path) ? "page" : undefined}>
          <span className="nav-icon">
            <Icon />
          </span>
          <span className="nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
