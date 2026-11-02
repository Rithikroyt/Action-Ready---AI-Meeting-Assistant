"use client";

// Transient, in-memory copy of notes the user just submitted, used only to highlight evidence
// in this browser tab. Not localStorage, not sessionStorage: a reload clears it by design.
const store = new Map<string, string>();

export const rememberNotes = (jobId: string, notes: string) => {
  store.clear(); // keep at most one meeting's notes in memory
  store.set(jobId, notes);
};
export const recallNotes = (jobId: string) => store.get(jobId) ?? null;
export const forgetNotes = (jobId: string) => store.delete(jobId);
