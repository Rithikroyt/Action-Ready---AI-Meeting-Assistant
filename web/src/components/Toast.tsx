"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IconAlert, IconCheckCircle, IconHelp, IconX } from "./Icons";

// Small, accessible toast notifications. They describe what the APP did (copied, loaded, reset…) and never
// announce an official business result that the workflow did not record.
export type ToastTone = "success" | "info" | "warn" | "error";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

const Ctx = createContext<(t: Omit<ToastItem, "id">) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

const ICON = { success: IconCheckCircle, info: IconHelp, warn: IconAlert, error: IconAlert } as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <Toast key={t.id} t={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function Toast({ t, onDone }: { t: ToastItem; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), 4200);
    const b = setTimeout(onDone, 4500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onDone]);
  const I = ICON[t.tone];
  return (
    <div className={`toast ${t.tone} ${leaving ? "leaving" : ""}`} role={t.tone === "error" ? "alert" : "status"}>
      <span className="toast-icon" aria-hidden>
        <I width={16} height={16} />
      </span>
      <div className="toast-text">
        <strong>{t.title}</strong>
        {t.body && <span>{t.body}</span>}
      </div>
      <button type="button" className="toast-x" onClick={onDone} aria-label="Dismiss notification">
        <IconX width={14} height={14} />
      </button>
      <span className="toast-timer" aria-hidden />
    </div>
  );
}
