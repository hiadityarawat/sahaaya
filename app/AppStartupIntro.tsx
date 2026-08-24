"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

const INTRO_DURATION_MS = 6000;
const REDUCED_MOTION_DURATION_MS = 300;
const RESUME_THRESHOLD_MS = 1500;

function isInstalledApp() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

export default function AppStartupIntro() {
  const [visible, setVisible] = useState(true);
  const [run, setRun] = useState(0);
  const timer = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);

  const play = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setRun((value) => value + 1);
    setVisible(true);
    const reducedMotion = document.documentElement.classList.contains("reduce-motion");
    timer.current = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? REDUCED_MOTION_DURATION_MS : INTRO_DURATION_MS,
    );
  }, []);

  useEffect(() => {
    const reducedMotion = document.documentElement.classList.contains("reduce-motion");
    timer.current = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? REDUCED_MOTION_DURATION_MS : INTRO_DURATION_MS,
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const awayFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (isInstalledApp() && awayFor >= RESUME_THRESHOLD_MS) play();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [play]);

  if (!visible) return null;
  return (
    <div key={run} className="sahaaya-intro" role="status" aria-label="Sahaaya is loading">
      <div className="intro-emblem" aria-hidden="true">
        <span className="intro-orbit"><i /></span>
        <b className="brand-logo-mark" />
      </div>
      <div className="intro-wordmark" aria-hidden="true">
        {"SAHAAYA".split("").map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ "--letter": index } as CSSProperties}>{letter}</span>
        ))}
      </div>
      <p>Community Response Network</p>
      <span className="intro-progress" aria-hidden="true"><i /></span>
    </div>
  );
}
