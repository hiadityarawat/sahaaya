import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

async function testEnvironment() {
  const serverRoot=fileURLToPath(new URL("../dist/server/",import.meta.url));
  const modulePaths=(await readdir(serverRoot,{recursive:true})).filter(path=>path.endsWith(".js")&&path!=="index.js");
  const runtime = new Miniflare({
    modules: [
      {type:"ESModule",path:join(serverRoot,"index.js")},
      ...modulePaths.map(path=>({type:"ESModule",path:join(serverRoot,path)})),
    ],
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    r2Buckets: ["UPLOADS"],
    serviceBindings: {ASSETS: async()=>new Response("Not found",{status:404})},
  });
  const DB = await runtime.getD1Database("DB");
  const files=(await readdir(new URL("../drizzle/",import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  for(const file of files){
    const sql=await readFile(new URL(`../drizzle/${file}`,import.meta.url),"utf8");
    for(const statement of sql.split("--> statement-breakpoint").map(value=>value.trim()).filter(Boolean)){
      await DB.prepare(statement).run();
    }
  }
  async function api(user,path,body){
    const headers={"oai-authenticated-user-id":user.id,"oai-authenticated-user-email":user.email};
    if(body)headers["content-type"]="application/json";
    return runtime.dispatchFetch(`http://localhost${path}`,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined});
  }
  async function upload(user,requestId,file){
    const form=new FormData();form.set("requestId",requestId);form.set("file",file);
    const request=new Request("http://localhost/api/uploads",{method:"POST",headers:{"oai-authenticated-user-id":user.id,"oai-authenticated-user-email":user.email},body:form});
    return runtime.dispatchFetch(request.url,{method:"POST",headers:request.headers,body:await request.arrayBuffer()});
  }
  return {runtime,api,upload,DB};
}

test("production workflow enforces ownership, one helper, private data, secure codes, and real resources",async(t)=>{
  const {runtime,api,upload,DB}=await testEnvironment();t.after(()=>runtime.dispose());
  const requester={id:"requester-1",email:"requester@example.test"};
  const helper={id:"helper-1",email:"helper@example.test"};
  const stranger={id:"stranger-1",email:"stranger@example.test"};

  const created=await api(requester,"/api/actions",{action:"create_request",category:"FOOD",publicArea:"Whitefield",peopleCount:2,description:"Need two sealed food packets tonight.",urgency:"URGENT",contactMethod:"IN_APP",latitude:12.9716,longitude:77.5946});
  assert.equal(created.status,200);const requestId=(await created.json()).id;assert.match(requestId,/^REQ-\d{4}-[A-F0-9]{8}$/);
  const png=new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])],"evidence.png",{type:"image/png"});
  assert.equal((await upload(stranger,requestId,png)).status,403);
  assert.equal((await upload(requester,requestId,png)).status,200);

  const publicState=await api(stranger,"/api/state");
  assert.equal(publicState.status,200);const publicRequest=(await publicState.json()).requests[0];
  assert.equal(publicRequest.approx_lat,12.97);assert.equal(publicRequest.requester_email,undefined);assert.equal(publicRequest.delivery_code_hash,undefined);

  const offer=await api(helper,"/api/actions",{action:"offer_help",id:requestId,message:"I can deliver two food packets within thirty minutes."});
  assert.equal(offer.status,200);const offerId=(await offer.json()).id;
  assert.equal((await api(stranger,"/api/actions",{action:"accept_offer",offerId})).status,403);
  assert.equal((await api(requester,"/api/actions",{action:"accept_offer",offerId})).status,200);
  assert.equal((await api(stranger,"/api/actions",{action:"offer_help",id:requestId,message:"I can also help with this request."})).status,409);

  assert.equal((await api(requester,"/api/actions",{action:"generate_delivery_code",id:requestId})).status,403);
  const generated=await api(helper,"/api/actions",{action:"generate_delivery_code",id:requestId});
  assert.equal(generated.status,200);const {code}=await generated.json();assert.match(code,/^\d{6}$/);
  const stored=await DB.prepare("SELECT delivery_code,delivery_code_hash FROM help_requests WHERE id=?").bind(requestId).first();
  assert.equal(stored.delivery_code,null);assert.notEqual(stored.delivery_code_hash,code);
  assert.equal((await api(requester,"/api/actions",{action:"confirm_delivery",id:requestId,code:"000000"})).status,400);
  assert.equal((await api(requester,"/api/actions",{action:"confirm_delivery",id:requestId,code})).status,200);
  assert.equal((await api(helper,"/api/actions",{action:"update_delivery_location",id:requestId,latitude:12.97,longitude:77.59})).status,409);

  const added=await api(requester,"/api/actions",{action:"add_resource",name:"Sealed water bottles",category:"WATER",quantity:12,unit:"bottles",publicArea:"Whitefield"});
  assert.equal(added.status,200);const resourceId=(await added.json()).id;
  assert.notEqual((await api(stranger,"/api/actions",{action:"adjust_resource",id:resourceId,delta:-1,note:"Unauthorized change"})).status,200);
  assert.equal((await api(requester,"/api/actions",{action:"adjust_resource",id:resourceId,delta:-2,note:"Two bottles delivered"})).status,200);
  const resource=await DB.prepare("SELECT quantity,owner_id FROM resources WHERE id=?").bind(resourceId).first();
  assert.deepEqual(resource,{quantity:10,owner_id:requester.id});
});

test("privileged actions reject ordinary signed-in users",async(t)=>{
  const {runtime,api}=await testEnvironment();t.after(()=>runtime.dispose());
  const resident={id:"resident-1",email:"resident@example.test"};
  const health=await api(resident,"/api/health");assert.equal(health.status,200);assert.equal((await health.json()).status,"ok");assert.equal(health.headers.get("x-frame-options"),"DENY");
  for(const body of [
    {action:"create_event",name:"Unauthorized event",areas:"Area"},
    {action:"verify_org",id:"org-1",verified:true},
    {action:"review_report",id:"report-1",status:"APPROVED"},
    {action:"assign_volunteer",id:"request-1",volunteerId:"volunteer-1"},
  ])assert.equal((await api(resident,"/api/actions",body)).status,403);
});
