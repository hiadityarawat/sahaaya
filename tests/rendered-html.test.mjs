import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path="/"){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);const {default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`,{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("server renders the Sahaaya operational shell",async()=>{const response=await render();assert.equal(response.status,200);assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);const html=await response.text();assert.match(html,/<title>Sahaaya — Disaster Response Network<\/title>/i);assert.match(html,/SAHAAYA/);assert.match(html,/Synchronizing response network/);assert.doesNotMatch(html,/codex-preview|Your site is taking shape/)});
test("production source includes privacy and accessibility safeguards",async()=>{const [platform,api,styles]=await Promise.all([readFile(new URL("../app/Platform.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/actions/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/platform.css",import.meta.url),"utf8")]);assert.match(platform,/Exact contact and address details remain protected/);assert.match(platform,/aria-label=/);assert.match(api,/quantity\+\?>=0/);assert.match(api,/status='OPEN'/);assert.match(styles,/@media\(max-width:760px\)/)});
