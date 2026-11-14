"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./Icons";

type Theme = "dark" | "light";
export const THEME_KEY = "ar-theme";

/** Runs before first paint (inlined in <head>) so the stored theme never flashes. Dark ("Dusk") is the default. */
export const THEME_BOOT = `(function(){var d=document.documentElement,t='dark';try{var s=localStorage.getItem('${THEME_KEY}');if(s==='light'||s==='dark')t=s}catch(e){}d.setAttribute('data-theme',t)})();`;

function current(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Dusk / Daybreak switch. Uses a circular View Transition from the button where the browser supports it. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => setTheme(current()), []);

  function apply(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    setTheme(next);
  }

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce) return apply(next);
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.classList.add("theme-switching");
    const t = doc.startViewTransition(() => apply(next));
    t.ready
      .then(() =>
        document.documentElement
          .animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] }, { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" })
          .finished.finally(() => document.documentElement.classList.remove("theme-switching")),
      )
      .catch(() => document.documentElement.classList.remove("theme-switching"));
  }

  const label = theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme";
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={toggle} aria-label={label} title={label}>
      <span className="tt-icon tt-sun" aria-hidden>
        <IconSun width={16} height={16} />
      </span>
      <span className="tt-icon tt-moon" aria-hidden>
        <IconMoon width={16} height={16} />
      </span>
    </button>
  );
}
