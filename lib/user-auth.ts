import { headers as nextHeaders } from "next/headers";
import { env } from "cloudflare:workers";
import { AuthenticationRequiredError, AuthorizationError } from "./errors";

export const USER_SESSION_COOKIE = "sahaaya_session";
export const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
// workerd caps each PBKDF2 operation at 100,000 iterations. Two independently
// salted stages preserve a deliberately expensive derivation while remaining
// compatible with the production Cloudflare runtime.
export const PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_STAGES = 2;

export type SafeUser = { id:string; email:string; name:string; role:string; email_verified:number; blocked_at:string|null };
const db=()=>env.DB;
const timestamp=()=>new Date().toISOString();

const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const randomHex=(size:number)=>{const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return hex(bytes)};
export const normalizeEmail=(value:string)=>value.trim().toLowerCase();
export const validEmail=(value:string)=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const passwordProblem=(value:string)=>value.length<10?"Use at least 10 characters.":value.length>128?"Password must be 128 characters or fewer.":!/[A-Za-z]/.test(value)||!/\d/.test(value)?"Include at least one letter and one number.":null;

export async function hashSecret(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return hex(new Uint8Array(digest))}
export async function derivePassword(password:string,saltHex:string,iterations=PASSWORD_ITERATIONS){
  const salt=Uint8Array.from(saltHex.match(/.{1,2}/g)??[],v=>Number.parseInt(v,16));
  let material=new TextEncoder().encode(password);
  for(let stage=0;stage<PASSWORD_STAGES;stage+=1){
    const stageSalt=new Uint8Array(salt.length+1);stageSalt.set(salt);stageSalt[salt.length]=stage;
    const key=await crypto.subtle.importKey("raw",material,"PBKDF2",false,["deriveBits"]);
    material=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:stageSalt,iterations},key,256));
  }
  return hex(material);
}
export const newPasswordSalt=()=>randomHex(16);
export function safeEqual(left:string,right:string){if(left.length!==right.length)return false;let diff=0;for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);return diff===0}
export function cookieToken(source:Headers){const cookie=source.get("cookie")??"";for(const part of cookie.split(";")){const [name,...value]=part.trim().split("=");if(name===USER_SESSION_COOKIE)return value.join("=")}return null}
export function sessionCookie(token:string,maxAge=Math.floor(USER_SESSION_MS/1000)){return `${USER_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`}
export function clearSessionCookie(){return `${USER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`}
export function sameOrigin(request:Request){const origin=request.headers.get("origin");return !!origin&&origin===new URL(request.url).origin}

export async function createUserSession(userId:string,userAgent:string){
  const token=randomHex(32),tokenHash=await hashSecret(token),createdAt=timestamp(),expiresAt=new Date(Date.now()+USER_SESSION_MS).toISOString(),id=`session-${crypto.randomUUID()}`;
  await db().prepare("INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_used_at,user_agent) VALUES(?,?,?,?,?,?,?)").bind(id,userId,tokenHash,createdAt,expiresAt,createdAt,userAgent.slice(0,240)).run();
  return {id,token,createdAt,expiresAt};
}

export async function sessionUser(source?:Headers):Promise<SafeUser|null>{
  const requestHeaders=source??await nextHeaders();const token=cookieToken(requestHeaders);if(!token)return null;
  const tokenHash=await hashSecret(token),now=timestamp();
  const row=await db().prepare("SELECT u.id,u.email,u.name,u.role,u.email_verified,u.blocked_at,s.id session_id,s.last_used_at FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,now).first<SafeUser&{session_id:string;last_used_at:string}>();
  if(!row)return null;
  if(row.blocked_at){await db().prepare("DELETE FROM user_sessions WHERE user_id=?").bind(row.id).run();throw new AuthorizationError("This account is currently restricted.")}
  if(Date.now()-Date.parse(row.last_used_at)>5*60_000)await db().prepare("UPDATE user_sessions SET last_used_at=? WHERE id=?").bind(now,row.session_id).run();
  return {id:row.id,email:row.email,name:row.name,role:row.role,email_verified:row.email_verified,blocked_at:row.blocked_at};
}
export async function requireUser(source?:Headers){const user=await sessionUser(source);if(!user)throw new AuthenticationRequiredError("Sign in to continue.");return user}
export async function auditAuth(userId:string,action:string,metadata:Record<string,unknown>={}){await db().prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,?,'USER',?,?,?)").bind(userId,action,userId,JSON.stringify(metadata),timestamp()).run()}
