import {
  ADMIN_PASSWORD_ITERATIONS,
  adminAccessStatus,
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  deriveAdminPassword,
  newAdminPasswordSalt,
  revokeAdminSession,
  requireAdminSession,
  safeSecretEqual,
  validAdminPassword,
} from "../../../lib/admin-auth";
import {
  AuthenticationRequiredError,
  AuthorizationError,
  RateLimitError,
  consumeRateLimit,
  currentUser,
  db,
  ensureDatabase,
  timestamp,
} from "../../../lib/site-db";
import { derivePassword, safeEqual, sameOrigin } from "../../../lib/user-auth";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof AuthenticationRequiredError)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (error instanceof AuthorizationError)
    return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof RateLimitError)
    return Response.json(
      { error: error.message },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const errorId = crypto.randomUUID();
  console.error("Sahaaya admin authentication failure", errorId, error);
  return Response.json(
    { error: "Administrator authentication could not be completed.", errorId },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await currentUser();
    if (user.role !== "ADMIN")
      throw new AuthorizationError("This account is not an administrator.");
    return Response.json(await adminAccessStatus(user.id, request.headers), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    await ensureDatabase();
    const user = await currentUser();
    if (user.role !== "ADMIN")
      throw new AuthorizationError("This account is not an administrator.");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const action = String(body.action ?? "");
    const database = db();

    if (action === "logout") {
      await revokeAdminSession(request.headers);
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": clearAdminSessionCookie() } },
      );
    }

    if (action === "logout_all") {
      await requireAdminSession(user, request.headers);
      const now = timestamp();
      await database.batch([
        database.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(user.id),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ADMIN_LOGOUT_ALL','USER',?,'{}',?)").bind(user.id, user.id, now),
      ]);
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": clearAdminSessionCookie() } },
      );
    }

    if (action === "change_password") {
      await requireAdminSession(user, request.headers);
      await consumeRateLimit(`admin-password:${user.id}`, 5, 60 * 60_000);
      const currentPassword = String(body.currentPassword ?? "");
      const newPassword = String(body.newPassword ?? "");
      if (!validAdminPassword(newPassword))
        return Response.json(
          { error: "Use at least 12 characters with uppercase, lowercase, a number, and a symbol." },
          { status: 400 },
        );
      const credential = await database.prepare("SELECT password_salt,password_hash,password_iterations FROM admin_credentials WHERE user_id=?").bind(user.id).first<{password_salt:string;password_hash:string;password_iterations:number}>();
      if (!credential) return Response.json({ error: "Administrator credentials are not configured." }, { status: 409 });
      const candidate = await deriveAdminPassword(currentPassword, credential.password_salt, credential.password_iterations);
      if (!safeSecretEqual(candidate, credential.password_hash))
        return Response.json({ error: "The current administrator password is incorrect." }, { status: 401 });
      const salt = newAdminPasswordSalt();
      const passwordHash = await deriveAdminPassword(newPassword, salt);
      const now = timestamp();
      await database.batch([
        database.prepare("UPDATE admin_credentials SET password_salt=?,password_hash=?,password_iterations=?,updated_at=? WHERE user_id=?").bind(salt,passwordHash,ADMIN_PASSWORD_ITERATIONS,now,user.id),
        database.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(user.id),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ADMIN_PASSWORD_CHANGED','USER',?,'{}',?)").bind(user.id,user.id,now),
      ]);
      const session = await createAdminSession(user.id);
      return Response.json(
        { ok: true, expiresAt: session.expiresAt },
        { headers: { "Set-Cookie": adminSessionCookie(session.token) } },
      );
    }

    const loginId = String(body.loginId ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (!/^[a-z0-9._-]{4,40}$/.test(loginId))
      return Response.json(
        {
          error:
            "Administrator ID must be 4–40 characters using letters, numbers, dots, dashes, or underscores.",
        },
        { status: 400 },
      );

    if (action === "setup") {
      await consumeRateLimit(`admin-setup:${user.id}`, 5, 60 * 60_000);
      if (!validAdminPassword(password))
        return Response.json(
          {
            error:
              "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.",
          },
          { status: 400 },
        );
      const existing = await database
        .prepare("SELECT 1 configured FROM admin_credentials WHERE user_id=?")
        .bind(user.id)
        .first();
      if (existing)
        return Response.json(
          { error: "Administrator credentials are already configured." },
          { status: 409 },
        );
      const salt = newAdminPasswordSalt();
      const passwordHash = await deriveAdminPassword(password, salt);
      const now = timestamp();
      try {
        await database.batch([
          database
            .prepare(
              "INSERT INTO admin_credentials(user_id,admin_login_id,password_salt,password_hash,password_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              user.id,
              loginId,
              salt,
              passwordHash,
              ADMIN_PASSWORD_ITERATIONS,
              now,
              now,
            ),
          database
            .prepare(
              "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ADMIN_CREDENTIAL_SETUP','USER',?,'{}',?)",
            )
            .bind(user.id, user.id, now),
        ]);
      } catch {
        return Response.json(
          { error: "That administrator ID is already in use." },
          { status: 409 },
        );
      }
      const session = await createAdminSession(user.id);
      return Response.json(
        { ok: true, expiresAt: session.expiresAt },
        { headers: { "Set-Cookie": adminSessionCookie(session.token) } },
      );
    }

    if (action === "recover") {
      await consumeRateLimit(`admin-recover:${user.id}`, 3, 60 * 60_000);
      const accountPassword=String(body.accountPassword??"");
      if (!validAdminPassword(password)) return Response.json({error:"Use at least 12 characters with uppercase, lowercase, a number, and a symbol."},{status:400});
      const account=await database.prepare("SELECT password_hash,password_salt,password_iterations FROM users WHERE id=? AND blocked_at IS NULL").bind(user.id).first<{password_hash:string|null;password_salt:string|null;password_iterations:number|null}>();
      if(!account?.password_hash||!account.password_salt||!safeEqual(await derivePassword(accountPassword,account.password_salt,account.password_iterations??100000),account.password_hash))return Response.json({error:"Your Sahaaya account password is incorrect."},{status:401});
      const salt=newAdminPasswordSalt(),passwordHash=await deriveAdminPassword(password,salt),now=timestamp();
      try{await database.batch([
        database.prepare("UPDATE admin_credentials SET admin_login_id=?,password_salt=?,password_hash=?,password_iterations=?,updated_at=? WHERE user_id=?").bind(loginId,salt,passwordHash,ADMIN_PASSWORD_ITERATIONS,now,user.id),
        database.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(user.id),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ADMIN_CREDENTIAL_RECOVERY','USER',?,'{}',?)").bind(user.id,user.id,now),
      ])}catch{return Response.json({error:"That administrator ID is already in use."},{status:409})}
      const session=await createAdminSession(user.id);
      return Response.json({ok:true,expiresAt:session.expiresAt},{headers:{"Set-Cookie":adminSessionCookie(session.token)}});
    }

    if (action === "login") {
      await consumeRateLimit(`admin-login:${user.id}`, 8, 15 * 60_000);
      const credential = await database
        .prepare(
          "SELECT user_id,password_salt,password_hash,password_iterations FROM admin_credentials WHERE admin_login_id=?",
        )
        .bind(loginId)
        .first<{
          user_id: string;
          password_salt: string;
          password_hash: string;
          password_iterations: number;
        }>();
      const salt =
        credential?.password_salt ?? "00000000000000000000000000000000";
      const iterations =
        credential?.password_iterations ?? ADMIN_PASSWORD_ITERATIONS;
      const candidate = await deriveAdminPassword(password, salt, iterations);
      if (
        !credential ||
        credential.user_id !== user.id ||
        !safeSecretEqual(candidate, credential.password_hash)
      )
        return Response.json(
          { error: "Administrator ID or password is incorrect." },
          { status: 401 },
        );
      const session = await createAdminSession(user.id);
      const now = timestamp();
      await database
        .prepare(
          "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ADMIN_LOGIN','USER',?,'{}',?)",
        )
        .bind(user.id, user.id, now)
        .run();
      return Response.json(
        { ok: true, expiresAt: session.expiresAt },
        { headers: { "Set-Cookie": adminSessionCookie(session.token) } },
      );
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
