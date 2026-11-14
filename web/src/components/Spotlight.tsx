"use client";

import { useEffect } from "react";

const SELECTOR = ".card, .lane, button.stat, .pipe-step, .route-card, .principle, .state-card, .status-card, .stat-tile, .math-card";

/** A soft light that follows the pointer across cards (sets --mx / --my on the hovered card). Pointer devices only; purely decorative. */
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let el: HTMLElement | null = null;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const target = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
        if (el && el !== target) {
          el.style.removeProperty("--mx");
          el.style.removeProperty("--my");
        }
        el = target;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
