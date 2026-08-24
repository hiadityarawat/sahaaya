import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hiadityarawat.sahaaya",
  appName: "Sahaaya",
  webDir: "mobile-shell",
  loggingBehavior: "debug",
  appendUserAgent: "SahaayaNative/1.0",
  backgroundColor: "#f7f5ef",
  server: {
    url: "https://sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site",
    cleartext: false,
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#f7f5ef",
    allowMixedContent: false,
    captureInput: true,
  },
  ios: {
    backgroundColor: "#f7f5ef",
    contentInset: "automatic",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#0d2b24",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#f7f5ef",
      overlaysWebView: false,
    },
  },
};

export default config;
