import test from "node:test";
import assert from "node:assert/strict";
import { rankMatches } from "../src/matching.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-tests";
const { app } = await import("../src/index.js");

test("health endpoint reports service readiness", async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).status, "ok");
  server.close();
});

test("matching ranks eligible local responders and excludes unavailable ones", () => {
  const matches = rankMatches({ category:"FOOD", publicArea:"Whitefield", peopleCount:10 }, [
    { name:"Local NGO",skills:["food"],areas:["whitefield"],available:true,verified:true,capacity:50 },
    { name:"Remote NGO",skills:["food"],areas:["bellandur"],available:true,verified:true,capacity:50 },
    { name:"Unavailable",skills:["food"],areas:["whitefield"],available:false,verified:true,capacity:50 },
  ]);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].name, "Local NGO");
  assert.equal(matches[0].matchScore, 100);
});
