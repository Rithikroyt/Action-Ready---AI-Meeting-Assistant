"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowRight, IconLogo, IconX } from "@/components/Icons";
import { CHAPTERS, SCENES, sceneDuration } from "./scenes";

const DUR = SCENES.map(sceneDuration);
const START = DUR.map((_, i) => DUR.slice(0, i).reduce((a, b) => a + b, 0));
const TOTAL = DUR.reduce((a, b) => a + b, 0);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Preferred narration voices: natural/neural English voices first, then common good defaults.
const VOICE_PREF = [/natural.*english|english.*natural/i, /neural/i, /aria|jenny|guy|ava|andrew|emma|brian/i, /google us english/i, /samantha|daniel|karen/i];
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const en = window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const re of VOICE_PREF) {
    const v = en.find((x) => re.test(x.name));
    if (v) return v;
  }
  return en[0] ?? null;
}

export function DemoVideo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [take, setTake] = useState(0); // re-mounts the scene so its animations restart
  const [leaving, setLeaving] = useState<{ idx: number; take: number } | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [cc, setCc] = useState(true);
  const [idle, setIdle] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const tRef = useRef(0);
  const speaking = useRef(false);
  const utter = useRef<SpeechSynthesisUtterance | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  tRef.current = t;
  const scene = SCENES[idx]!;
  const dur = DUR[idx]!;

  // ---- narration -------------------------------------------------------------------------------
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    setCanSpeak(true);
    const load = () => (voice.current = pickVoice());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stopVoice = useCallback(() => {
    utter.current = null;
    speaking.current = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    stopVoice();
    if (!playing || !voiceOn || !canSpeak) return;
    const words = scene.say.split(/\s+/);
    // Resume mid-scene from the word the captions have reached.
    const from = Math.min(words.length - 1, Math.floor((tRef.current / dur) * words.length * 1.05));
    const text = words.slice(Math.max(0, from)).join(" ");
    const u = new SpeechSynthesisUtterance(text);
    if (voice.current) u.voice = voice.current;
    u.rate = 1.04;
    u.pitch = 1;
    u.onend = u.onerror = () => {
      if (utter.current === u) speaking.current = false;
    };
    utter.current = u;
    speaking.current = true;
    window.speechSynthesis.speak(u);
    return stopVoice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, take, playing, voiceOn, canSpeak]);

  // ---- clock -----------------------------------------------------------------------------------
  const go = useCallback(
    (n: number) => {
      if (n >= SCENES.length) {
        setPlaying(false);
        setEnded(true);
        return;
      }
      const target = Math.max(0, n);
      setLeaving({ idx, take });
      setIdx(target);
      setT(0);
      setTake((k) => k + 1);
      setEnded(false);
    },
    [idx, take],
  );

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setT((x) => x + dt);
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (!playing || t < dur) return;
    // Let the narrator finish its sentence (bounded), then cut.
    if (voiceOn && speaking.current && t < dur + 6) return;
    go(idx + 1);
  }, [t, dur, playing, voiceOn, go, idx]);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(null), 900);
    return () => window.clearTimeout(id);
  }, [leaving]);

  // ---- controls --------------------------------------------------------------------------------
  const start = () => {
    setStarted(true);
    setEnded(false);
    setLeaving(null);
    setIdx(0);
    setT(0);
    setTake((k) => k + 1);
    setPlaying(true);
  };
  const toggle = useCallback(() => {
    if (!started || ended) return start();
    setPlaying((p) => !p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, ended]);
  const seekScene = (n: number) => {
    if (!started) setStarted(true);
    go(Math.min(SCENES.length - 1, Math.max(0, n)));
    setPlaying(true);
  };
  const fullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") {
        e.preventDefault();
        toggle();
      } else if (k === "arrowright" && started) seekScene(idx + 1);
      else if (k === "arrowleft" && started) seekScene(t > 1.5 ? idx : idx - 1);
      else if (k === "m") setVoiceOn((v) => !v);
      else if (k === "c") setCc((v) => !v);
      else if (k === "f") fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Hide the controls while the video plays and the pointer rests.
  useEffect(() => {
    let id = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setIdle(true), 2600);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // ---- captions --------------------------------------------------------------------------------
  const words = useMemo(() => scene.say.split(/\s+/), [scene]);
  const spoken = Math.min(words.length, Math.floor((t / Math.max(1, dur - 1.2)) * words.length) + 1);
  const elapsed = START[idx]! + Math.min(t, dur);

  const Prev = leaving ? SCENES[leaving.idx]!.View : null;
  const Cur = scene.View;

  return (
    <div
      ref={rootRef}
      className={`dv ${playing ? "is-playing" : "is-paused"} ${idle && playing ? "is-idle" : ""}`}
      data-ch={scene.chapter}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, .dv-bar")) return;
        toggle();
      }}
    >
      <div className="dv-bg" aria-hidden>
        <i className="blob b1" />
        <i className="blob b2" />
        <i className="blob b3" />
        <div className="dv-grid" />
        <div className="dv-stars" />
      </div>

      <div className="dv-stage" aria-live="off">
        {started && Prev && (
          <section key={`p-${leaving!.take}`} className="scene exit" aria-hidden>
            <Prev />
          </section>
        )}
        {started && (
          <section key={`s-${take}`} className="scene enter" data-tr={scene.tr} aria-label={`Scene ${idx + 1} of ${SCENES.length}`}>
            <Cur />
          </section>
        )}
        {started && <span key={`f-${take}`} className="flash" aria-hidden />}
      </div>

      {started && (
        <div className="dv-hud" aria-hidden={idle && playing}>
          <span className="hud-ch">
            {String(scene.chapter + 1).padStart(2, "0")} · {CHAPTERS[scene.chapter]}
          </span>
          {scene.tag === "synthetic" && <span className="hud-tag syn">Synthetic example data</span>}
          {scene.tag === "measured" && <span className="hud-tag meas">Measured · Gemini 3.5 Flash · Nov 2026</span>}
        </div>
      )}

      {started && cc && !ended && (
        <p className="dv-cc" aria-live="polite">
          {words.map((w, i) => (
            <span key={i} className={i < spoken ? "on" : ""}>
              {w}{" "}
            </span>
          ))}
        </p>
      )}

      {!started && (
        <div className="dv-poster">
          <span className="poster-logo">
            <IconLogo />
          </span>
          <p className="v-eyebrow">ActionReady · demo video</p>
          <h1 className="poster-title">
            From meeting notes to <em className="grad">approved</em> action.
          </h1>
          <p className="poster-sub">
            A {fmt(TOTAL)} narrated tour: the full workflow, the safety rules, and the Week 5 AI Visibility Lab results.
          </p>
          <button type="button" className="play-big" onClick={start} aria-label="Play the demo video">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </button>
          <div className="poster-opts">
            <label>
              <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} disabled={!canSpeak} /> Voice narration
              {!canSpeak && " (not supported in this browser)"}
            </label>
            <label>
              <input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} /> Captions
            </label>
          </div>
          <p className="poster-keys">Space play/pause · ← → scenes · M voice · C captions · F full screen</p>
        </div>
      )}

      {ended && (
        <div className="dv-end">
          <button type="button" className="v-btn" onClick={start}>
            ↺ Replay
          </button>
          <Link href="/dashboard" className="v-btn primary">
            Open the workspace <IconArrowRight width={15} height={15} />
          </Link>
        </div>
      )}

      <div className="dv-bar">
        <div className="dv-progress" role="group" aria-label="Scenes">
          {SCENES.map((s, i) => {
            const fill = i < idx ? 1 : i > idx ? 0 : Math.min(1, t / DUR[i]!);
            return (
              <button
                key={s.id}
                type="button"
                className={`seg ${i === idx && started ? "cur" : ""} ch${s.chapter}`}
                style={{ flexGrow: DUR[i] }}
                onClick={() => seekScene(i)}
                aria-label={`Scene ${i + 1}: ${CHAPTERS[s.chapter]}`}
                title={`${CHAPTERS[s.chapter]} · ${fmt(START[i]!)}`}
              >
                <i style={{ transform: `scaleX(${started ? fill : 0})` }} />
              </button>
            );
          })}
        </div>
        <div className="dv-ctrls">
          <button type="button" className="ic" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            )}
          </button>
          <button type="button" className="ic" onClick={() => seekScene(idx - 1)} aria-label="Previous scene" disabled={!started}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 5h2v14H6zM19 5.5v13L9.5 12z" />
            </svg>
          </button>
          <button type="button" className="ic" onClick={() => seekScene(idx + 1)} aria-label="Next scene" disabled={!started}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M16 5h2v14h-2zM5 5.5v13L14.5 12z" />
            </svg>
          </button>
          <span className="time mono">
            {fmt(started ? elapsed : 0)} / {fmt(TOTAL)}
          </span>
          <span className="spacer" />
          <button type="button" className={`ic txt ${voiceOn ? "on" : ""}`} onClick={() => setVoiceOn((v) => !v)} aria-pressed={voiceOn} disabled={!canSpeak} title="Voice narration (M)">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
              {voiceOn ? <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
            <span>Voice</span>
          </button>
          <button type="button" className={`ic txt ${cc ? "on" : ""}`} onClick={() => setCc((v) => !v)} aria-pressed={cc} title="Captions (C)">
            <span className="cc-box">CC</span>
          </button>
          <button type="button" className="ic" onClick={fullscreen} aria-label="Full screen" title="Full screen (F)">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/" className="ic" aria-label="Close the demo video" title="Close">
            <IconX width={18} height={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
