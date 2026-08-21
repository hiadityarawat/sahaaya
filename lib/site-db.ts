import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

type D1 = typeof env.DB;
const now = () => new Date().toISOString();
const id = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'ADMIN',email_verified INTEGER NOT NULL DEFAULT 1,blocked_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS disaster_events (id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,affected_areas TEXT NOT NULL,starts_at TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS help_requests (id TEXT PRIMARY KEY,requester_id TEXT NOT NULL,event_id TEXT,category TEXT NOT NULL,public_area TEXT NOT NULL,people_count INTEGER NOT NULL CHECK(people_count>0),description TEXT NOT NULL,urgency TEXT NOT NULL,contact_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',accepted_by TEXT,assigned_volunteer_id TEXT,image_key TEXT,approx_lat REAL,approx_lng REAL,helper_lat REAL,helper_lng REAL,eta_minutes INTEGER,delivery_started_at TEXT,delivery_updated_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS request_updates (id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,author_id TEXT NOT NULL,status TEXT,body TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS help_offers (id TEXT PRIMARY KEY,request_id TEXT NOT NULL,helper_id TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(request_id,helper_id))`,
  `CREATE TABLE IF NOT EXISTS volunteers (user_id TEXT PRIMARY KEY,name TEXT NOT NULL,skills TEXT NOT NULL,areas TEXT NOT NULL,available INTEGER NOT NULL DEFAULT 1,completed_tasks INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY,name TEXT NOT NULL,public_area TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,contact_email TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,event_id TEXT,category TEXT NOT NULL,name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),unit TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS resource_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,resource_id TEXT NOT NULL,delta INTEGER NOT NULL,note TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,type TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY,request_id TEXT NOT NULL,reporter_id TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,reviewed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,metadata TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_requests_filters ON help_requests(status,urgency,category,public_area,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_updates_request ON request_updates(request_id,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_offers_request ON help_offers(request_id,status,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_offers_helper ON help_offers(helper_id,status,created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_assigned_volunteer ON help_requests(assigned_volunteer_id,id) WHERE assigned_volunteer_id IS NOT NULL`,
];

export function db(): D1 { if (!env.DB) throw new Error("Database binding unavailable"); return env.DB; }

export class AuthenticationRequiredError extends Error {}

export async function ensureDatabase() {
  const database=db();
  await database.batch(schema.map((statement)=>database.prepare(statement)));
  const count=await database.prepare("SELECT COUNT(*) AS total FROM disaster_events").first<{total:number}>();
  if ((count?.total ?? 0) === 0) await seed(database);
}

export async function currentUser() {
  const signedIn=await getChatGPTUser();
  if(!signedIn) throw new AuthenticationRequiredError("Sign in to continue.");
  const name=signedIn.fullName ?? signedIn.email.split("@")[0];
  await db().prepare("INSERT INTO users(id,email,name,role,email_verified,created_at) VALUES(?,?,?,'RESIDENT',1,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name").bind(signedIn.userId,signedIn.email,name,now()).run();
  const stored=await db().prepare("SELECT id,email,name,role FROM users WHERE id=?").bind(signedIn.userId).first<{id:string;email:string;name:string;role:string}>();
  if(!stored) throw new Error("Unable to load signed-in profile.");
  return stored;
}

async function seed(database:D1) {
  const timestamp=now();
  const events=[
    ["event-flood","Bengaluru Flood Response","ACTIVE",JSON.stringify(["Whitefield","Bellandur","Marathahalli"]),new Date(Date.now()-172800000).toISOString()],
    ["event-cyclone","Coastal Cyclone Preparedness","DRAFT",JSON.stringify(["Udupi","Mangaluru"]),new Date(Date.now()+432000000).toISOString()],
    ["event-landslide","Western Ghats Landslide Recovery","CLOSED",JSON.stringify(["Madikeri"]),new Date(Date.now()-7776000000).toISOString()],
  ];
  const orgs=[["org-hope","Hope Foundation","Whitefield",1,"response@hope.demo"],["org-aid","Rapid Aid Collective","Bellandur",1,"dispatch@rapidaid.demo"],["org-care","Community Care Trust","Marathahalli",1,"team@communitycare.demo"]];
  const statements=[];
  for(const event of events) statements.push(database.prepare("INSERT INTO disaster_events(id,name,status,affected_areas,starts_at,created_at) VALUES(?,?,?,?,?,?)").bind(...event,timestamp));
  for(const org of orgs) statements.push(database.prepare("INSERT INTO organizations(id,name,public_area,verified,contact_email,created_at) VALUES(?,?,?,?,?,?)").bind(...org,timestamp));
  const stocks=[["res-meals","org-hope","FOOD","Prepared meals",2450,"meals"],["res-water","org-aid","WATER","Water bottles",4820,"bottles"],["res-kits","org-care","MEDICAL","First aid kits",126,"kits"],["res-shelter","org-hope","SHELTER","Shelter spaces",84,"spaces"],["res-blankets","org-care","CLOTHES","Blankets",730,"blankets"]];
  for(const stock of stocks) statements.push(database.prepare("INSERT INTO resources(id,organization_id,event_id,category,name,quantity,unit,updated_at) VALUES(?,?, 'event-flood',?,?,?,?,?)").bind(...stock,timestamp));
  for(let index=0;index<statements.length;index+=50) await database.batch(statements.slice(index,index+50));
}

export const makeId=id;
export const timestamp=now;
