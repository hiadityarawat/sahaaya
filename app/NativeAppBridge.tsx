"use client";

import { useEffect } from "react";

const SAHAAYA_ORIGIN = "https://sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site";

export default function NativeAppBridge() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let disposed = false;

    async function connectNativeFeatures() {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || disposed) return;

      document.documentElement.classList.add("native-app");
      const [{ App }, { Browser }, { Haptics, ImpactStyle }, { Network }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@capacitor/haptics"),
        import("@capacitor/network"),
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
      ]);

      await Promise.allSettled([
        StatusBar.setStyle({ style: Style.Dark }),
        StatusBar.setBackgroundColor({ color: "#f7f5ef" }),
        StatusBar.setOverlaysWebView({ overlay: false }),
        SplashScreen.hide(),
      ]);

      const appState = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) window.dispatchEvent(new Event("sahaaya-native-resume"));
      });
      const backButton = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.minimizeApp();
      });
      const network = await Network.addListener("networkStatusChange", ({ connected }) => {
        document.documentElement.classList.toggle("native-offline", !connected);
        window.dispatchEvent(new Event(connected ? "online" : "offline"));
      });
      const status = await Network.getStatus();
      document.documentElement.classList.toggle("native-offline", !status.connected);

      const openExternalLink = (event: MouseEvent) => {
        const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
        if (!anchor || !/^https?:$/i.test(anchor.protocol) || anchor.origin === SAHAAYA_ORIGIN) return;
        event.preventDefault();
        void Browser.open({ url: anchor.href, presentationStyle: "popover" });
      };
      const provideTapFeedback = (event: MouseEvent) => {
        const control = (event.target as Element | null)?.closest("button,.solid-btn,.floating-help");
        if (control) void Haptics.impact({ style: ImpactStyle.Light });
      };
      document.addEventListener("click", openExternalLink);
      document.addEventListener("click", provideTapFeedback);
      cleanups.push(
        () => void appState.remove(),
        () => void backButton.remove(),
        () => void network.remove(),
        () => document.removeEventListener("click", openExternalLink),
        () => document.removeEventListener("click", provideTapFeedback),
        () => document.documentElement.classList.remove("native-app", "native-offline"),
      );
    }

    void connectNativeFeatures();
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
