"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SEEN_KEY = "apex_intro_seen";
/** The mark finishes drawing before the clip ends; fade out on the mark, not the tail. */
const HOLD_MS = 4200;

/**
 * The studio's logo animation, played once as the site opens.
 *
 * Deliberately restrained: it plays on the first visit of a session, fades into
 * the hero, and never blocks anything. It is skippable by click, key or scroll,
 * it is skipped outright for anyone who prefers reduced motion, and the page
 * underneath is fully rendered the whole time — so this costs nothing in
 * loading terms and search engines never see it.
 */
export function IntroReveal() {
  const [phase, setPhase] = useState<"idle" | "playing" | "leaving" | "done">(
    "idle",
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<number[]>([]);

  const finish = useCallback(() => {
    setPhase((p) => (p === "playing" ? "leaving" : p));
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* private browsing — just play it */
    }

    if (reduced || seen) {
      setPhase("done");
      return;
    }

    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}

    setPhase("playing");
    document.body.style.overflow = "hidden";
    timers.current.push(window.setTimeout(finish, HOLD_MS));

    return () => {
      timers.current.forEach(clearTimeout);
      document.body.style.overflow = "";
    };
  }, [finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    document.body.style.overflow = "";
    const t = window.setTimeout(() => setPhase("done"), 900);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") finish();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", finish, { passive: true, once: true });
    window.addEventListener("touchstart", finish, { passive: true, once: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("touchstart", finish);
    };
  }, [phase, finish]);

  if (phase === "done" || phase === "idle") return null;

  return (
    <div
      onClick={finish}
      role="presentation"
      className={[
        "fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-cream",
        "transition-opacity duration-[900ms] ease-silk",
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/media/logo-reveal-poster.jpg"
        onEnded={finish}
        onError={finish}
        className={[
          "w-[min(74vw,420px)] transition-transform duration-[1200ms] ease-silk",
          phase === "leaving" ? "scale-[1.04]" : "scale-100",
        ].join(" ")}
      >
        <source src="/media/logo-reveal.webm" type="video/webm" />
        <source src="/media/logo-reveal.mp4" type="video/mp4" />
      </video>

      <button
        onClick={finish}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-brand text-clay transition-colors hover:text-mocha-600"
      >
        Skip
      </button>
    </div>
  );
}
