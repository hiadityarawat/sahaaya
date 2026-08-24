"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export default function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    if (isStandalone() || localStorage.getItem("sahaaya_install_dismissed") === "1") return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const iosTimer = isIOS ? window.setTimeout(() => setVisible(true), 1400) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setShowIOSHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setPrompt(null);
  }

  function dismiss() {
    localStorage.setItem("sahaaya_install_dismissed", "1");
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <aside className="pwa-install" aria-label="Install Sahaaya app">
      <span className="pwa-install-mark brand-logo-mark" aria-hidden="true" />
      <div>
        <b>Install Sahaaya</b>
        <small>{showIOSHelp ? "Tap Share, then Add to Home Screen." : "Faster access on this device"}</small>
      </div>
      {!showIOSHelp && <button className="pwa-install-action" onClick={install}>Install</button>}
      <button className="pwa-install-close" onClick={dismiss} aria-label="Dismiss install suggestion">×</button>
    </aside>
  );
}
