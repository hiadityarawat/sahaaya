import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

type D1 = typeof env.DB;
const now = () => new Date().toISOString();
const id = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;

export function db(): D1 {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}

export class AuthenticationRequiredError extends Error {}
export class AuthorizationError extends Error {}
export class RateLimitError extends Error {}

// Versioned deployment migrations own the schema. This helper intentionally
// performs no DDL during user requests.
export async function ensureDatabase() { db(); }

export async function currentUser() {
  const signedIn=await getChatGPTUser();
  if(!signedIn) throw new AuthenticationRequiredError("Sign in to continue.");
  const name=signedIn.fullName ?? signedIn.email.split("@")[0];
  await db().prepare("INSERT INTO users(id,email,name,role,email_verified,created_at) VALUES(?,?,?,'RESIDENT',1,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name").bind(signedIn.userId,signedIn.email,name,now()).run();
  const stored=await db().prepare("SELECT id,email,name,role,blocked_at FROM users WHERE id=?").bind(signedIn.userId).first<{id:string;email:string;name:string;role:string;blocked_at:string|null}>();
  if(!stored) throw new Error("Unable to load signed-in profile.");
  if(stored.blocked_at) throw new AuthorizationError("This account is currently restricted.");
  return stored;
}

export function requireRole(user:{role:string},roles:string[]) {
  if(!roles.includes(user.role)) throw new AuthorizationError("You do not have permission to perform this action.");
}

export async function consumeRateLimit(key:string,limit:number,windowMs:number) {
  const current=Date.now();
  const result=await db().prepare(`INSERT INTO rate_limits(key,window_started_at,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN ?-rate_limits.window_started_at>=? THEN 1 ELSE rate_limits.count+1 END,
      window_started_at=CASE WHEN ?-rate_limits.window_started_at>=? THEN ? ELSE rate_limits.window_started_at END
    RETURNING count`).bind(key,current,current,windowMs,current,windowMs,current).first<{count:number}>();
  if((result?.count??limit+1)>limit) throw new RateLimitError("Too many attempts. Please wait and try again.");
}

export async function hashDeliveryCode(requestId:string,code:string) {
  const bytes=new TextEncoder().encode(`${requestId}:${code}`);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

export const makeId=id;
export const timestamp=now;
