"use client";

import { useEffect, useId, useRef, useState } from "react";

// "+" attach menu for the notes box. Each option opens the file picker filtered to that format; the file is
// read in the browser by extractNotesFile (never uploaded). Recordings are listed as unsupported on purpose,
// so nobody wonders where the audio option went.
const OPTIONS = [
  { k: "pdf", label: "PDF document", ext: ".pdf", accept: ".pdf,application/pdf", icon: "PDF", tone: "pdf" },
  { k: "docx", label: "Word document", ext: ".docx", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: "DOC", tone: "doc" },
  { k: "txt", label: "Text file", ext: ".txt", accept: ".txt,text/plain", icon: "TXT", tone: "txt" },
] as const;

export function AttachMenu({ busy, onPick }: { busy: boolean; onPick: (f: File | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [accept, setAccept] = useState<string>(OPTIONS[0].accept);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    wrap.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choose = (a: string) => {
    setAccept(a);
    setOpen(false);
    // let React apply the new accept attribute before the picker opens
    requestAnimationFrame(() => input.current?.click());
  };

  return (
    <div className="attach" ref={wrap}>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className={`btn sm attach-btn ${open ? "open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        title="Add notes from a file"
      >
        <span className="attach-plus" aria-hidden>
          +
        </span>
        {busy ? "Reading file…" : "Add from file"}
      </button>
      {open && (
        <div className="attach-menu" role="menu" id={menuId} aria-label="Add notes from a file">
          {OPTIONS.map((o) => (
            <button key={o.k} type="button" role="menuitem" className="attach-item" onClick={() => choose(o.accept)}>
              <span className={`ftype ${o.tone}`}>{o.icon}</span>
              <span className="attach-text">
                <strong>{o.label}</strong>
                <span>{o.ext} · read on this device, never uploaded</span>
              </span>
            </button>
          ))}
          <div className="attach-item disabled" role="menuitem" aria-disabled="true">
            <span className="ftype rec">REC</span>
            <span className="attach-text">
              <strong>Recording (.mp3, .mp4)</strong>
              <span>Not supported — ActionReady does not transcribe audio</span>
            </span>
          </div>
          <p className="attach-foot">Or drag a file onto the notes box. Max 12,000 characters of text.</p>
        </div>
      )}
    </div>
  );
}
