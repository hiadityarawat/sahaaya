import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("account recovery and verification are private, expiring, and provider-configurable",async()=>{const [service,email,auth,verification]=await Promise.all([read("app/api/auth/_service.ts"),read("lib/email-delivery.ts"),read("lib/user-auth.ts"),read("app/verify-email/page.tsx")]);assert.match(service,/If a matching account exists/);assert.match(service,/30\*60_000/);assert.match(service,/issueVerification/);assert.match(service,/requestThrottleKey/);assert.match(email,/RESEND_API_KEY/);assert.match(email,/SAHAAYA_PUBLIC_URL/);assert.match(auth,/cleanupExpiredSecurityState/);assert.match(verification,/api\/auth\/verify-email/)});

test("administrator credentials can be recovered only with the signed-in account password",async()=>{const route=await read("app/api/admin-auth/route.ts");assert.match(route,/action === "recover"/);assert.match(route,/Your Sahaaya account password is incorrect/);assert.match(route,/ADMIN_CREDENTIAL_RECOVERY/);assert.match(route,/DELETE FROM admin_sessions WHERE user_id/)});

test("disaster trust metadata, expiry, map fallback, and route-aware ETA are present",async()=>{const [actions,state,map,routing,migration,runbook]=await Promise.all([read("app/api/actions/route.ts"),read("app/api/state/route.ts"),read("app/ReliableHelpMap.tsx"),read("lib/routing.ts"),read("drizzle/0011_trust_and_resilience.sql"),read("docs/OPERATIONS.md")]);assert.match(actions,/sourceName/);assert.match(actions,/expiresAt/);assert.match(state,/expires_at IS NULL OR expires_at>/);assert.match(map,/accessible location list/);assert.match(map,/Source:/);assert.match(routing,/SAHAAYA_ROUTING_API_URL/);assert.match(routing,/STRAIGHT_LINE/);assert.match(migration,/idx_disaster_events_status_expiry/);assert.match(runbook,/Backup and recovery/)});

test("sidebar brand remains contained without inherited boxes or the distortion-prone sheen",async()=>{const styles=await read("app/fixes.css");assert.match(styles,/\.side-brand:after\{content:none!important;display:none!important\}/);assert.match(styles,/\.side-brand>\.brand-logo-mark\{[\s\S]*?box-shadow:none;[\s\S]*?animation:none!important/);assert.match(styles,/\.side-brand-copy\{[\s\S]*?width:auto!important;[\s\S]*?height:auto!important;[\s\S]*?background:transparent!important;[\s\S]*?box-shadow:none!important/);assert.match(styles,/@keyframes sideBrandLetterFade/)});
