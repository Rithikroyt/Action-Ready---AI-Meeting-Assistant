"use client";

import { useEffect, useId, useRef } from "react";
import { IconX } from "./Icons";

/** Side panel for supporting evidence, built on the native <dialog> (focus trap, Esc, backdrop close). */
export function Drawer({ open, onClose, title, eyebrow, children }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="drawer-panel">
          <div className="drawer-head">
            <div>
              {eyebrow && <span className="modal-eyebrow">{eyebrow}</span>}
              <h2 id={titleId}>{title}</h2>
            </div>
            <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
              <IconX width={16} height={16} />
            </button>
          </div>
          <div className="drawer-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
