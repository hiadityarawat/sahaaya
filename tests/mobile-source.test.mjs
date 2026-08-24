import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("native Android and iOS application configuration is production constrained", async () => {
  const [config, bridge, layout] = await Promise.all([
    readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/NativeAppBridge.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(config, /com\.hiadityarawat\.sahaaya/);
  assert.match(config, /https:\/\/sahaaya-disaster-response\.hi-aditya-rawat\.chatgpt\.site/);
  assert.match(config, /cleartext: false/);
  assert.doesNotMatch(config, /allowNavigation/);
  assert.match(bridge, /Capacitor\.isNativePlatform/);
  assert.match(bridge, /networkStatusChange/);
  assert.match(bridge, /backButton/);
  assert.match(layout, /<NativeAppBridge \/>/);
  await access(new URL("../mobile-shell/offline.html", import.meta.url));
});

test("native platform source trees and privacy declarations exist", async () => {
  const [manifest, plist] = await Promise.all([
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);
  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(plist, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(plist, /NSPhotoLibraryUsageDescription/);
});
