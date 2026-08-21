import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

type D1 = typeof env.DB;
const now = () => new Date().toISOString();
const id = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'ADMIN',email_verified INTEGER NOT NULL DEFAULT 1,blocked_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS disaster_events (id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,affected_areas TEXT NOT NULL,starts_at TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS help_requests (id TEXT PRIMARY KEY,requester_id TEXT NOT NULL,event_id TEXT,category TEXT NOT NULL,public_area TEXT NOT NULL,people_count INTEGER NOT NULL CHECK(people_count>0),description TEXT NOT NULL,urgency TEXT NOT NULL,contact_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',accepted_by TEXT,assigned_volunteer_id TEXT,image_key TEXT,approx_lat REAL,approx_lng REAL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS request_updates (id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,author_id TEXT NOT NULL,status TEXT,body TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS volunteers (user_id TEXT PRIMARY KEY,name TEXT NOT NULL,skills TEXT NOT NULL,areas TEXT NOT NULL,available INTEGER NOT NULL DEFAULT 1,completed_tasks INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY,name TEXT NOT NULL,public_area TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,contact_email TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,event_id TEXT,category TEXT NOT NULL,name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),unit TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resource_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,resource_id TEXT NOT NULL,delta INTEGER NOT NULL,note TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,type TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY,request_id TEXT NOT NULL,reporter_id TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,reviewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,metadata TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_filters ON help_requests(status,urgency,category,public_area,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_updates_request ON request_updates(request_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_assigned_volunteer ON help_requests(assigned_volunteer_id,id) WHERE assigned_volunteer_id IS NOT NULL`,
];

export function db(): D1 { if (!env.DB) throw new Error("Database binding unavailable"); return env.DB; }

export async function ensureDatabase() {
  const database=db();
  await database.batch(schema.map((statement)=>database.prepare(statement)));
  const count=await database.prepare("SELECT COUNT(*) AS total FROM disaster_events").first<{total:number}>();
  if ((count?.total ?? 0) === 0) await seed(database);
}

export async function currentUser() {
  const signedIn=await getChatGPTUser();
  const user={ id:signedIn?.userId ?? "local-owner", email:signedIn?.email ?? "owner@sahaaya.demo", name:signedIn?.fullName ?? "Arjun Kumar", role:"ADMIN" };
  await db().prepare("INSERT INTO users(id,email,name,role,email_verified,created_at) VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name").bind(user.id,user.email,user.name,user.role,now()).run();
  return user;
}

async function seed(database:D1) {
  const timestamp=now();
  const events=[
    ["event-flood","Bengaluru Flood Response","ACTIVE",JSON.stringify(["Whitefield","Bellandur","Marathahalli"]),new Date(Date.now()-172800000).toISOString()],
    ["event-cyclone","Coastal Cyclone Preparedness","DRAFT",JSON.stringify(["Udupi","Mangaluru"]),new Date(Date.now()+432000000).toISOString()],
    ["event-landslide","Western Ghats Landslide Recovery","CLOSED",JSON.stringify(["Madikeri"]),new Date(Date.now()-7776000000).toISOString()],
  ];
  const orgs=[["org-hope","Hope Foundation","Whitefield",1,"response@hope.demo"],["org-aid","Rapid Aid Collective","Bellandur",1,"dispatch@rapidaid.demo"],["org-care","Community Care Trust","Marathahalli",1,"team@communitycare.demo"]];
  const skills=["FOOD","WATER","MEDICAL","SHELTER","RESCUE","TRANSPORT"];
  const areas=["Whitefield","Bellandur","Marathahalli","Mahadevapura"];
  const categories=["MEDICAL","WATER","RESCUE","FOOD","SHELTER","TRANSPORT"];
  const urgencies=["CRITICAL","URGENT","NORMAL"];
  const statuses=["OPEN","ACCEPTED","VOLUNTEER_ASSIGNED","IN_PROGRESS","RESOLVED"];
  const statements=[];
  for(const event of events) statements.push(database.prepare("INSERT INTO disaster_events(id,name,status,affected_areas,starts_at,created_at) VALUES(?,?,?,?,?,?)").bind(...event,timestamp));
  for(const org of orgs) statements.push(database.prepare("INSERT INTO organizations(id,name,public_area,verified,contact_email,created_at) VALUES(?,?,?,?,?,?)").bind(...org,timestamp));
  for(let i=0;i<15;i++) statements.push(database.prepare("INSERT INTO volunteers(user_id,name,skills,areas,available,completed_tasks,updated_at) VALUES(?,?,?,?,?,?,?)").bind(`vol-${i+1}`,`Demo Volunteer ${i+1}`,JSON.stringify([skills[i%skills.length],"GENERAL"]),JSON.stringify([areas[i%areas.length]]),i%5===0?0:1,(i*3)%19,timestamp));
  for(let i=0;i<30;i++){
    const requestId=`REQ-2026-${String(10432+i).padStart(5,"0")}`; const status=statuses[i%statuses.length]; const created=new Date(Date.now()-i*9*60000).toISOString();
    statements.push(database.prepare("INSERT INTO help_requests(id,requester_id,event_id,category,public_area,people_count,description,urgency,contact_method,status,accepted_by,assigned_volunteer_id,approx_lat,approx_lng,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(requestId,"demo-resident","event-flood",categories[i%categories.length],areas[i%areas.length],1+(i*7)%18,`Fictional demo request for ${categories[i%categories.length].toLowerCase()} assistance.`,urgencies[i%urgencies.length],"IN_APP",status,status==="OPEN"?null:orgs[i%3][0],["VOLUNTEER_ASSIGNED","IN_PROGRESS","RESOLVED"].includes(status)?`vol-${(i%15)+1}`:null,12.96+(i%4)*.013,77.69+(i%5)*.012,created,created));
    statements.push(database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,?,?,?)").bind(requestId,"system","OPEN","Request created with privacy-safe location.",created));
  }
  const stocks=[["res-meals","org-hope","FOOD","Prepared meals",2450,"meals"],["res-water","org-aid","WATER","Water bottles",4820,"bottles"],["res-kits","org-care","MEDICAL","First aid kits",126,"kits"],["res-shelter","org-hope","SHELTER","Shelter spaces",84,"spaces"],["res-blankets","org-care","CLOTHES","Blankets",730,"blankets"]];
  for(const stock of stocks) statements.push(database.prepare("INSERT INTO resources(id,organization_id,event_id,category,name,quantity,unit,updated_at) VALUES(?,?, 'event-flood',?,?,?,?,?)").bind(...stock,timestamp));
  for(const note of [["note-1","Volunteer assigned","Meera S. is heading to Whitefield.","ASSIGNMENT"],["note-2","Status updated","A water delivery is now in progress.","STATUS"],["note-3","Critical request nearby","Medical support requested in your service area.","ALERT"]]) statements.push(database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?,?,?,?,?)").bind(note[0],"local-owner",note[1],note[2],note[3],timestamp));
  for(const report of [["report-1","REQ-2026-10439","Duplicate request details"],["report-2","REQ-2026-10444","Unable to verify public information"]]) statements.push(database.prepare("INSERT INTO reports(id,request_id,reporter_id,reason,status,created_at) VALUES(?,?, 'demo-reporter',?,'PENDING',?)").bind(report[0],report[1],report[2],timestamp));
  for(let index=0;index<statements.length;index+=50) await database.batch(statements.slice(index,index+50));
}

export const makeId=id;
export const timestamp=now;
