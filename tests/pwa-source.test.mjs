import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("installable app metadata and icons are complete", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose.includes("maskable")));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")));
  await access(new URL("../public/icons/sahaaya-192.png", import.meta.url));
  await access(new URL("../public/icons/sahaaya-512.png", import.meta.url));
});

test("service worker never caches authenticated API responses", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /OFFLINE_URL/);
  assert.doesNotMatch(worker, /cache\.put\(request/);
});

test("install prompt and app shortcuts are wired", async () => {
  const [install, platform] = await Promise.all([
    readFile(new URL("../app/PwaInstall.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Platform.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(install, /beforeinstallprompt/);
  assert.match(install, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(platform, /shortcutView === "map"/);
  assert.match(platform, /params\.get\("action"\) === "request-help"/);
});
