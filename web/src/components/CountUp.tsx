"use client";

import { useEffect, useRef } from "react";

/**
 * Counts up to `value` when it first appears. The real value is what React renders (server and client
 * agree, so hydration never differs); the animation only rewrites the text node afterwards, outside React state.
 * Reduced motion: no animation.
 */
export function CountUp({ value, duration = 900, className = "" }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value) || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let start = 0;
    const run = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = String(value);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
