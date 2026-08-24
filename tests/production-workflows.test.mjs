import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";
import { createHash } from "node:crypto";

async function applyMigrations(DB, files) {
  for (const file of files) {
    const sql = await readFile(
      new URL(`../drizzle/${file}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean))
      await DB.prepare(statement).run();
  }
}

async function testEnvironment() {
  const serverRoot = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modulePaths = (await readdir(serverRoot, { recursive: true })).filter(
    (path) => path.endsWith(".js") && path !== "index.js",
  );
  const runtime = new Miniflare({
    modules: [
      { type: "ESModule", path: join(serverRoot, "index.js") },
      ...modulePaths.map((path) => ({
        type: "ESModule",
        path: join(serverRoot, path),
      })),
    ],
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
  });
  const DB = await runtime.getD1Database("DB");
  const files = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  await applyMigrations(DB, files);
  const sessionCookies = new Map();
  async function ensureUser(user) {
    if (sessionCookies.has(user.id)) return sessionCookies.get(user.id);
    const now = new Date().toISOString(), token = `test-token-${user.id}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await DB.prepare("INSERT INTO users(id,email,name,role,email_verified,created_at,updated_at) VALUES(?,?,?,'RESIDENT',1,?,?) ON CONFLICT(id) DO NOTHING").bind(user.id,user.email,user.id,now,now).run();
    await DB.prepare("INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_used_at,user_agent) VALUES(?,?,?,?,?,?,?)").bind(`session-${user.id}`,user.id,tokenHash,now,new Date(Date.now()+3600000).toISOString(),now,"Test browser").run();
    const value=`sahaaya_session=${token}`;sessionCookies.set(user.id,value);return value;
  }
  async function api(user, path, body, cookie) {
    const userCookie = await ensureUser(user);
    const headers = {
      cookie: cookie ? `${userCookie}; ${cookie}` : userCookie,
      origin: "http://localhost",
    };
    if (body) headers["content-type"] = "application/json";
    return runtime.dispatchFetch(`http://localhost${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function upload(user, requestId, file) {
    const userCookie = await ensureUser(user);
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("file", file);
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: {
        cookie: userCookie,
        origin: "http://localhost",
      },
      body: form,
    });
    return runtime.dispatchFetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: await request.arrayBuffer(),
    });
  }
  return { runtime, api, upload, DB };
}

test("production workflow enforces ownership, one helper, private data, secure codes, and real resources", async (t) => {
  const { runtime, api, upload, DB } = await testEnvironment();
  t.after(() => runtime.dispose());
  const requester = { id: "requester-1", email: "requester@example.test" };
  const helper = { id: "helper-1", email: "helper@example.test" };
  const stranger = { id: "stranger-1", email: "stranger@example.test" };

  const created = await api(requester, "/api/actions", {
    action: "create_request",
    clientRequestId: "workflow-request-1",
    category: "FOOD",
    publicArea: "Whitefield",
    peopleCount: 2,
    description: "Need two sealed food packets tonight.",
    urgency: "URGENT",
    contactMethod: "IN_APP",
    latitude: 12.9716,
    longitude: 77.5946,
  });
  assert.equal(created.status, 200);
  const requestId = (await created.json()).id;
  assert.match(requestId, /^REQ-\d{4}-[A-F0-9]{8}$/);
  const repeated = await api(requester, "/api/actions", {
    action: "create_request",
    clientRequestId: "workflow-request-1",
    category: "FOOD",
    publicArea: "Whitefield",
    peopleCount: 2,
    description: "Need two sealed food packets tonight.",
    urgency: "URGENT",
    contactMethod: "IN_APP",
    latitude: 12.9716,
    longitude: 77.5946,
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).id, requestId);
  assert.equal(
    (
      await DB.prepare(
        "SELECT COUNT(*) count FROM help_requests WHERE requester_id=?",
      )
        .bind(requester.id)
        .first()
    ).count,
    1,
  );
  const png = new File(
    [
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
      ]),
    ],
    "evidence.png",
    { type: "image/png" },
  );
  assert.equal((await upload(stranger, requestId, png)).status, 403);
  assert.equal((await upload(requester, requestId, png)).status, 200);

  const publicState = await api(stranger, "/api/state");
  assert.equal(publicState.status, 200);
  const publicPayload = await publicState.json();
  assert.equal(publicPayload.myRequests.length, 0);
  assert.equal(publicPayload.mapRequests.length, 1);
  assert.equal(publicPayload.mapRequests[0].id, requestId);
  assert.equal(publicPayload.mapRequests[0].approx_lat, 12.97);
  assert.equal(publicPayload.mapRequests[0].requester_email, undefined);
  const publicRequest = publicPayload.requests[0];
  assert.equal(publicRequest.approx_lat, 12.97);
  assert.equal(publicRequest.requester_email, undefined);
  assert.equal(publicRequest.delivery_code_hash, undefined);

  const ownerState = await api(requester, "/api/state");
  assert.equal(ownerState.status, 200);
  const ownerPayload = await ownerState.json();
  assert.equal(ownerPayload.myRequests.length, 1);
  assert.equal(ownerPayload.myRequests[0].id, requestId);
  assert.equal(ownerPayload.myRequests[0].is_owner, true);

  const offer = await api(helper, "/api/actions", {
    action: "offer_help",
    id: requestId,
    message: "I can deliver two food packets within thirty minutes.",
  });
  assert.equal(offer.status, 200);
  const offerId = (await offer.json()).id;
  assert.equal(
    (await api(stranger, "/api/actions", { action: "accept_offer", offerId }))
      .status,
    403,
  );
  assert.equal(
    (await api(requester, "/api/actions", { action: "accept_offer", offerId }))
      .status,
    200,
  );
  assert.equal(
    (
      await api(stranger, "/api/actions", {
        action: "offer_help",
        id: requestId,
        message: "I can also help with this request.",
      })
    ).status,
    409,
  );

  assert.equal(
    (
      await api(requester, "/api/actions", {
        action: "generate_delivery_code",
        id: requestId,
      })
    ).status,
    403,
  );
  const generated = await api(helper, "/api/actions", {
    action: "generate_delivery_code",
    id: requestId,
  });
  assert.equal(generated.status, 200);
  const { code } = await generated.json();
  assert.match(code, /^\d{6}$/);
  const stored = await DB.prepare(
    "SELECT delivery_code,delivery_code_hash FROM help_requests WHERE id=?",
  )
    .bind(requestId)
    .first();
  assert.equal(stored.delivery_code, null);
  assert.notEqual(stored.delivery_code_hash, code);
  assert.equal(
    (
      await api(requester, "/api/actions", {
        action: "confirm_delivery",
        id: requestId,
        code: "000000",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(requester, "/api/actions", {
        action: "confirm_delivery",
        id: requestId,
        code,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(helper, "/api/actions", {
        action: "update_delivery_location",
        id: requestId,
        latitude: 12.97,
        longitude: 77.59,
      })
    ).status,
    409,
  );
  const completedState = await api(requester, "/api/state");
  const completedPayload = await completedState.json();
  assert.equal(completedPayload.myRequests[0].status, "RESOLVED");
  assert.equal(completedPayload.mapRequests.length, 0);

  const added = await api(requester, "/api/actions", {
    action: "add_resource",
    name: "Sealed water bottles",
    category: "WATER",
    quantity: 12,
    unit: "bottles",
    publicArea: "Whitefield",
  });
  assert.equal(added.status, 200);
  const resourceId = (await added.json()).id;
  assert.notEqual(
    (
      await api(stranger, "/api/actions", {
        action: "adjust_resource",
        id: resourceId,
        delta: -1,
        note: "Unauthorized change",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(requester, "/api/actions", {
        action: "adjust_resource",
        id: resourceId,
        delta: -2,
        note: "Two bottles delivered",
      })
    ).status,
    200,
  );
  const resource = await DB.prepare(
    "SELECT quantity,owner_id FROM resources WHERE id=?",
  )
    .bind(resourceId)
    .first();
  assert.deepEqual(resource, { quantity: 10, owner_id: requester.id });
});

test("privileged actions reject ordinary signed-in users", async (t) => {
  const { runtime, api } = await testEnvironment();
  t.after(() => runtime.dispose());
  const resident = { id: "resident-1", email: "resident@example.test" };
  const health = await api(resident, "/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  for (const body of [
    { action: "create_event", name: "Unauthorized event", areas: "Area" },
    { action: "delete_event", id: "event-1" },
    { action: "verify_org", id: "org-1", verified: true },
    { action: "review_report", id: "report-1", status: "APPROVED" },
    { action: "assign_volunteer", id: "request-1", volunteerId: "volunteer-1" },
  ])
    assert.equal((await api(resident, "/api/actions", body)).status, 403);
});

test("admin dashboard requires hashed credentials and a protected admin session", async (t) => {
  const { runtime, api, DB } = await testEnvironment();
  t.after(() => runtime.dispose());
  const admin = { id: "admin-1", email: "admin@example.test" };
  const resident = { id: "resident-admin-probe", email: "probe@example.test" };

  assert.equal((await api(admin, "/api/health")).status, 200);
  assert.equal((await api(admin, "/api/state")).status, 200);
  await DB.prepare("UPDATE users SET role='ADMIN' WHERE id=?")
    .bind(admin.id)
    .run();
  const lockedState = await api(admin, "/api/state");
  const lockedPayload = await lockedState.json();
  assert.deepEqual(lockedPayload.adminAccess, {
    configured: false,
    authenticated: false,
  });
  assert.equal(lockedPayload.users.length, 0);
  assert.equal(
    (
      await api(admin, "/api/actions", {
        action: "create_event",
        name: "Locked admin event",
        areas: "Area",
      })
    ).status,
    403,
  );

  assert.equal(
    (
      await api(admin, "/api/admin-auth", {
        action: "setup",
        loginId: "sahaaya-admin",
        password: "weak",
      })
    ).status,
    400,
  );
  const password = "Sahaaya#Admin2026";
  const setup = await api(admin, "/api/admin-auth", {
    action: "setup",
    loginId: "sahaaya-admin",
    password,
  });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie").split(";", 1)[0];
  assert.match(cookie, /^sahaaya_admin_session=/);
  assert.match(setup.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(setup.headers.get("set-cookie"), /SameSite=Strict/i);

  const storedCredential = await DB.prepare(
    "SELECT password_salt,password_hash,password_iterations FROM admin_credentials WHERE user_id=?",
  )
    .bind(admin.id)
    .first();
  assert.notEqual(storedCredential.password_hash, password);
  assert.match(storedCredential.password_hash, /^[a-f0-9]{64}$/);
  assert.equal(storedCredential.password_iterations, 100000);
  const session = await DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE user_id=?",
  )
    .bind(admin.id)
    .first();
  assert.match(session.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(session.token_hash, cookie.split("=")[1]);

  const unlockedState = await api(admin, "/api/state", undefined, cookie);
  const unlockedPayload = await unlockedState.json();
  assert.equal(unlockedPayload.adminAccess.authenticated, true);
  assert.ok(unlockedPayload.users.some((user) => user.id === admin.id));
  const createdEvent = await api(
    admin,
    "/api/actions",
    {
      action: "create_event",
      name: "Admin flood information",
      areas: "Whitefield, Bellandur",
      latitude: 12.9716,
      longitude: 77.5946,
      startsAt: "2026-08-23T08:00",
      expiresAt: "2026-08-30T08:00",
      severity: "WARNING",
      sourceName: "Karnataka State Disaster Management Authority",
      sourceUrl: "https://ksdma.karnataka.gov.in/",
      safetyInfo: "Avoid flooded underpasses and follow official road closures.",
      emergencyGuidance: "Contact local emergency services and use verified relief centres.",
    },
    cookie,
  );
  assert.equal(createdEvent.status, 200);
  const eventId = (await createdEvent.json()).id;
  const residentMap = await api(resident, "/api/state?scope=map");
  const residentMapPayload = await residentMap.json();
  const visibleEvent = residentMapPayload.events.find((event) => event.id === eventId);
  assert.equal(visibleEvent.status, "ACTIVE");
  assert.equal(visibleEvent.approx_lat, 12.9716);
  assert.match(visibleEvent.safety_info, /flooded underpasses/);
  assert.equal((await api(resident, "/api/actions", { action: "delete_event", id: eventId })).status, 403);
  assert.equal((await api(admin, "/api/actions", { action: "delete_event", id: eventId }, cookie)).status, 200);
  assert.equal(await DB.prepare("SELECT 1 FROM disaster_events WHERE id=?").bind(eventId).first(), null);

  assert.equal(
    (
      await api(
        admin,
        "/api/admin-auth",
        {
          action: "change_password",
          currentPassword: "wrong-password",
          newPassword: "Sahaaya#Admin2027",
        },
        cookie,
      )
    ).status,
    401,
  );
  const changed = await api(
    admin,
    "/api/admin-auth",
    {
      action: "change_password",
      currentPassword: password,
      newPassword: "Sahaaya#Admin2027",
    },
    cookie,
  );
  assert.equal(changed.status, 200);
  const rotatedCookie = changed.headers.get("set-cookie").split(";", 1)[0];
  assert.notEqual(rotatedCookie, cookie);
  assert.equal(
    (await api(admin, "/api/state", undefined, cookie)).status,
    200,
  );
  assert.equal(
    (await (await api(admin, "/api/state", undefined, cookie)).json()).adminAccess.authenticated,
    false,
  );

  assert.equal((await api(resident, "/api/health")).status, 200);
  assert.equal(
    (
      await api(resident, "/api/admin-auth", {
        action: "login",
        loginId: "sahaaya-admin",
        password,
      })
    ).status,
    403,
  );

  const logout = await api(
    admin,
    "/api/admin-auth",
    { action: "logout_all" },
    rotatedCookie,
  );
  assert.equal(logout.status, 200);
  const relockedState = await api(admin, "/api/state", undefined, rotatedCookie);
  assert.equal((await relockedState.json()).adminAccess.authenticated, false);
});

test("hardening migration removes only known placeholders and preserves unknown legacy resources", async (t) => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    d1Databases: ["DB"],
  });
  t.after(() => runtime.dispose());
  const DB = await runtime.getD1Database("DB");
  const files = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^000[0-3].*\.sql$/.test(name))
    .sort();
  await applyMigrations(DB, files);
  const now = new Date().toISOString();
  await DB.batch([
    DB.prepare(
      "INSERT INTO users(id,email,name,role,email_verified,created_at) VALUES('legacy-user','legacy@example.test','Legacy user','RESIDENT',1,?)",
    ).bind(now),
    DB.prepare(
      "INSERT INTO organizations(id,name,public_area,verified,contact_email,created_at) VALUES('org-hope','Hope Foundation','Area',1,'response@hope.demo',?)",
    ).bind(now),
    DB.prepare(
      "INSERT INTO resources(id,organization_id,category,name,quantity,unit,updated_at) VALUES('res-meals','org-hope','FOOD','Placeholder meals',100,'meals',?)",
    ).bind(now),
    DB.prepare(
      "INSERT INTO resources(id,organization_id,category,name,quantity,unit,updated_at) VALUES('resource-unknown','org-hope','WATER','Possibly real bottles',7,'bottles',?)",
    ).bind(now),
  ]);
  await applyMigrations(DB, ["0004_production_hardening.sql"]);
  assert.equal(
    await DB.prepare("SELECT 1 FROM resources WHERE id='res-meals'").first(),
    null,
  );
  assert.ok(
    await DB.prepare(
      "SELECT quantity FROM resources WHERE id='resource-unknown'",
    ).first(),
  );
});

test("independent registration, login, session validation, blocking, and logout are enforced", async (t) => {
  const { runtime, DB } = await testEnvironment();t.after(()=>runtime.dispose());
  const post=(path,body,cookie)=>runtime.dispatchFetch(`http://localhost${path}`,{method:"POST",headers:{origin:"http://localhost","content-type":"application/json",...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  await DB.prepare("INSERT INTO users(id,email,name,role,email_verified,created_at) VALUES(?,?,?,?,1,?)").bind("legacy-provider-id","legacy@example.test","Legacy User","ADMIN",new Date().toISOString()).run();
  const unverifiedClaim=await post("/api/auth/claim-legacy",{password:"Securepass123",confirmPassword:"Securepass123"});assert.equal(unverifiedClaim.status,401);
  const claimed=await runtime.dispatchFetch("http://localhost/api/auth/claim-legacy",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json","oai-authenticated-user-id":"legacy-provider-id","oai-authenticated-user-email":"legacy@example.test"},body:JSON.stringify({password:"Securepass123",confirmPassword:"Securepass123"})});assert.equal(claimed.status,200);assert.match(claimed.headers.get("set-cookie"),/sahaaya_session=/);assert.ok((await DB.prepare("SELECT password_hash FROM users WHERE id='legacy-provider-id'").first()).password_hash);assert.equal((await runtime.dispatchFetch("http://localhost/api/auth/claim-legacy",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json","oai-authenticated-user-id":"legacy-provider-id","oai-authenticated-user-email":"legacy@example.test"},body:JSON.stringify({password:"Securepass123",confirmPassword:"Securepass123"})})).status,409);
  assert.equal((await post("/api/auth/register",{name:"A",email:"bad",password:"weak",confirmPassword:"weak"})).status,400);
  const created=await post("/api/auth/register",{name:"Independent User",email:"User@Example.Test",password:"Securepass123",confirmPassword:"Securepass123"});assert.equal(created.status,201);const cookie=created.headers.get("set-cookie");assert.match(cookie,/sahaaya_session=.*HttpOnly.*Secure.*SameSite=Strict/);const stored=await DB.prepare("SELECT password_hash,password_salt,email FROM users WHERE email='user@example.test'").first();assert.ok(stored.password_hash);assert.ok(stored.password_salt);assert.equal(stored.email,"user@example.test");
  assert.equal((await post("/api/auth/register",{name:"Duplicate User",email:"user@example.test",password:"Securepass123",confirmPassword:"Securepass123"})).status,409);
  assert.equal((await post("/api/auth/login",{email:"user@example.test",password:"wrong-password"})).status,401);
  const login=await post("/api/auth/login",{email:"USER@example.test",password:"Securepass123"});assert.equal(login.status,200);const loginCookie=login.headers.get("set-cookie");
  const me=await runtime.dispatchFetch("http://localhost/api/auth/me",{headers:{cookie:loginCookie}});assert.equal(me.status,200);const meData=await me.json();assert.equal(meData.user.email,"user@example.test");assert.equal(meData.user.password_hash,undefined);
  const sessions=await runtime.dispatchFetch("http://localhost/api/auth/sessions",{headers:{cookie:loginCookie}});assert.equal(sessions.status,200);assert.ok((await sessions.json()).sessions.length>=2);
  await DB.prepare("UPDATE users SET blocked_at=? WHERE email=?").bind(new Date().toISOString(),"user@example.test").run();assert.equal((await runtime.dispatchFetch("http://localhost/api/auth/me",{headers:{cookie:loginCookie}})).status,403);
  await DB.prepare("UPDATE users SET blocked_at=NULL WHERE email=?").bind("user@example.test").run();const logout=await post("/api/auth/logout",{},cookie);assert.equal(logout.status,200);assert.match(logout.headers.get("set-cookie"),/Max-Age=0/);
  assert.equal((await post("/api/auth/login",{"email":"' OR 1=1 --","password":"Securepass123"})).status,401);
  assert.equal((await runtime.dispatchFetch("http://localhost/api/auth/logout",{method:"POST",headers:{origin:"https://attacker.test",cookie:loginCookie}})).status,403);
});
