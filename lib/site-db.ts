import { env } from "cloudflare:workers";
import { requireUser } from "./user-auth";
export { AuthenticationRequiredError, AuthorizationError, RateLimitError } from "./errors";
import { AuthorizationError, RateLimitError } from "./errors";

type D1 = typeof env.DB;
const now = () => new Date().toISOString();
const id = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;

export function db(): D1 {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}

// Versioned deployment migrations own the schema. This helper intentionally
// performs no DDL during user requests.
export async function ensureDatabase() { db(); }

export async function currentUser() {
  return requireUser();
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
