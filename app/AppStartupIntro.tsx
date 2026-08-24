"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

const INTRO_DURATION_MS = 6000;
const REDUCED_MOTION_DURATION_MS = 300;
const RESUME_THRESHOLD_MS = 1500;

function prefersReducedMotion() {
  return document.documentElement.classList.contains("reduce-motion")
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
    const reducedMotion = prefersReducedMotion();
    timer.current = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? REDUCED_MOTION_DURATION_MS : INTRO_DURATION_MS,
    );
  }, []);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
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
    window.addEventListener("sahaaya-native-resume", play);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("sahaaya-native-resume", play);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [play]);

  if (!visible) return null;
  return (
    <div key={run} className="sahaaya-intro" role="status" aria-label="Sahaaya is loading">
      <span className="intro-grid" aria-hidden="true" />
      <span className="intro-bloom intro-bloom-one" aria-hidden="true" />
      <span className="intro-bloom intro-bloom-two" aria-hidden="true" />
      <div className="intro-emblem" aria-hidden="true">
        <span className="intro-halo intro-halo-outer" />
        <span className="intro-halo intro-halo-inner" />
        <span className="intro-orbit"><i /></span>
        <span className="intro-logo-frame"><b className="brand-logo-mark" /><i /></span>
      </div>
      <div className="intro-wordmark" aria-hidden="true">
        {"SAHAAYA".split("").map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ "--letter": index } as CSSProperties}>{letter}</span>
        ))}
      </div>
      <p className="intro-subtitle">Community Response Network</p>
      <div className="intro-load" aria-hidden="true">
        <span>Preparing your response network</span>
        <span className="intro-progress"><i /><b /></span>
      </div>
    </div>
  );
}
