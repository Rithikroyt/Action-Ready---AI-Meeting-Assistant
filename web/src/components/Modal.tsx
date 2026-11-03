"use client";

import { useEffect, useId, useRef } from "react";
import { IconX } from "./Icons";

/**
 * Accessible pop-up built on the native <dialog>: focus is trapped and restored by the browser, Esc closes it,
 * clicking the backdrop closes it, and the page behind becomes inert.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  tone = "accent",
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  tone?: "accent" | "ready" | "blocked" | "unknown";
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
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
      className={`modal tone-${tone} ${size}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="modal-card">
          <div className="modal-head">
            <div>
              {eyebrow && <span className="modal-eyebrow">{eyebrow}</span>}
              <h2 id={titleId}>{title}</h2>
            </div>
            <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
              <IconX width={16} height={16} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
