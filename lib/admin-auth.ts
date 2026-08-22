import { AuthorizationError, db } from "./site-db";

export const ADMIN_SESSION_COOKIE = "sahaaya_admin_session";
export const ADMIN_PASSWORD_ITERATIONS = 210_000;
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

function randomHex(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function deriveAdminPassword(
  password: string,
  saltHex: string,
  iterations = ADMIN_PASSWORD_ITERATIONS,
) {
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g) ?? [], (value) =>
    Number.parseInt(value, 16),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(result));
}

export function newAdminPasswordSalt() {
  return randomHex(16);
}

export function validAdminPassword(password: string) {
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function safeSecretEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function sessionToken(headers: Headers) {
  const cookie = headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ADMIN_SESSION_COOKIE) return value.join("=");
  }
  return null;
}

export async function adminAccessStatus(userId: string, headers: Headers) {
  const configured = !!(await db()
    .prepare("SELECT 1 configured FROM admin_credentials WHERE user_id=?")
    .bind(userId)
    .first());
  const token = sessionToken(headers);
  if (!token) return { configured, authenticated: false };
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const session = await db()
    .prepare(
      "SELECT 1 active FROM admin_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
    )
    .bind(tokenHash, userId, now)
    .first();
  return { configured, authenticated: !!session };
}

export async function requireAdminSession(
  user: { id: string; role: string },
  headers: Headers,
) {
  if (user.role !== "ADMIN")
    throw new AuthorizationError("Administrator access is required.");
  const access = await adminAccessStatus(user.id, headers);
  if (!access.authenticated)
    throw new AuthorizationError(
      "Unlock the Admin dashboard with your administrator ID and password.",
    );
}

export async function createAdminSession(userId: string) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MS).toISOString();
  await db().batch([
    db()
      .prepare("DELETE FROM admin_sessions WHERE user_id=? OR expires_at<=?")
      .bind(userId, createdAt),
    db()
      .prepare(
        "INSERT INTO admin_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)",
      )
      .bind(tokenHash, userId, expiresAt, createdAt, createdAt),
  ]);
  return { token, expiresAt };
}

export async function revokeAdminSession(headers: Headers) {
  const token = sessionToken(headers);
  if (token)
    await db()
      .prepare("DELETE FROM admin_sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
}

export function adminSessionCookie(token: string, maxAge = 8 * 60 * 60) {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
