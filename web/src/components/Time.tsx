"use client";

import { useEffect, useState } from "react";
import { fmtDate, relTime } from "@/lib/present";

// Relative and local times depend on "now" and the viewer's timezone, which differ between the server render and
// the browser. Render them only after mount so server HTML and hydration always match (no React #418).
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** "5 minutes ago" — empty until mounted; `now` lets a ticking parent refresh it. */
export function RelTime({ iso, now }: { iso: string | null | undefined; now?: number }) {
  const mounted = useMounted();
  if (!iso) return <span>—</span>;
  return (
    <time dateTime={iso} title={iso}>
      {mounted ? relTime(iso, now ?? Date.now()) : ""}
    </time>
  );
}

/** Local date and time in the viewer's timezone. */
export function LocalTime({ iso }: { iso: string | null | undefined }) {
  const mounted = useMounted();
  if (!iso) return <span>—</span>;
  return (
    <time dateTime={iso} title={iso}>
      {mounted ? fmtDate(iso) : ""}
    </time>
  );
}
