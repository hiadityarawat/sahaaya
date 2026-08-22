import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path="/"){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);const {default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`,{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("server renders the Sahaaya community entry",async()=>{const response=await render();assert.equal(response.status,200);assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);const html=await response.text();assert.match(html,/<title>Sahaaya — Community Help Network<\/title>/i);assert.match(html,/SAHAAYA/);assert.match(html,/Sign in to request help/);assert.doesNotMatch(html,/codex-preview|Your site is taking shape/)});
test("production source includes privacy, identity, and live-tracking safeguards",async()=>{const [platform,api,map,styles]=await Promise.all([readFile(new URL("../app/Platform.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/actions/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/LiveHelpMap.tsx",import.meta.url),"utf8"),readFile(new URL("../app/fixes.css",import.meta.url),"utf8")]);assert.match(platform,/revealed only to the helper whose offer you accept/);assert.match(platform,/navigator\.geolocation\.watchPosition/);assert.ok(platform.indexOf("new FormData(event.currentTarget)")<platform.indexOf("navigator.geolocation.getCurrentPosition"),"form values must be captured before awaiting location permission");assert.match(api,/Only the person who requested help can accept an offer/);assert.match(api,/Only the accepted helper can share delivery progress/);assert.match(map,/openstreetmap\.org/);assert.match(styles,/@media\(max-width:760px\)/)});
