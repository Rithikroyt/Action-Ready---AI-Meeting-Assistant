"use client";

import { useEffect, useState } from "react";

/** Counts up to `value` when it first appears. The real value is rendered on the server and for reduced motion. */
export function CountUp({ value, duration = 900, className = "" }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!Number.isFinite(value) || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    let raf = 0;
    let start = 0;
    const run = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    setShown(0);
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={className}>
      {shown}
    </span>
  );
}
