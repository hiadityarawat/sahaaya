import {
  AuthenticationRequiredError,
  AuthorizationError,
  db,
  ensureDatabase,
  currentUser,
} from "../../../lib/site-db";

export const dynamic = "force-dynamic";
type RequestRow = Record<string, unknown> & {
  id: string;
  requester_id: string;
  accepted_by: string | null;
  approx_lat: number | null;
  approx_lng: number | null;
  helper_lat: number | null;
  helper_lng: number | null;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await currentUser();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 120) ?? "";
    const status = url.searchParams.get("status") ?? "ALL";
    const category = url.searchParams.get("category") ?? "ALL";
    const cursor = url.searchParams.get("cursor")?.trim() || null;
    const conditions = ["hr.status NOT IN ('RESOLVED','CANCELLED')"];
    const bindings: unknown[] = [];
    if (q) {
      conditions.push(
        "(hr.id LIKE ? OR hr.public_area LIKE ? OR hr.description LIKE ?)",
      );
      bindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status !== "ALL") {
      conditions.push("hr.status=?");
      bindings.push(status);
    }
    if (category !== "ALL") {
      conditions.push("hr.category=?");
      bindings.push(category);
    }
    if (cursor) {
      conditions.push("hr.created_at<?");
      bindings.push(cursor);
    }
    const database = db();
    const privileged = ["VOLUNTEER", "ORGANIZATION", "ADMIN"].includes(
      user.role,
    );
    const [
      requests,
      myRequests,
      history,
      offers,
      events,
      organizations,
      resources,
      notifications,
      activity,
      metrics,
      volunteers,
      reports,
    ] = await Promise.all([
      database
        .prepare(
          `SELECT hr.*,requester.name requester_name,helper.name helper_name FROM help_requests hr JOIN users requester ON requester.id=hr.requester_id LEFT JOIN users helper ON helper.id=hr.accepted_by WHERE ${conditions.join(" AND ")} ORDER BY CASE hr.urgency WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,hr.created_at DESC LIMIT 50`,
        )
        .bind(...bindings)
        .all<RequestRow>(),
      database
        .prepare(
          "SELECT hr.*,requester.name requester_name,helper.name helper_name FROM help_requests hr JOIN users requester ON requester.id=hr.requester_id LEFT JOIN users helper ON helper.id=hr.accepted_by WHERE hr.requester_id=? ORDER BY hr.created_at DESC LIMIT 100",
        )
        .bind(user.id)
        .all<RequestRow>(),
      database
        .prepare(
          "SELECT hr.*,requester.name requester_name,helper.name helper_name FROM help_requests hr JOIN users requester ON requester.id=hr.requester_id LEFT JOIN users helper ON helper.id=hr.accepted_by WHERE hr.status IN ('RESOLVED','CANCELLED') AND (hr.requester_id=? OR hr.accepted_by=?) ORDER BY hr.updated_at DESC LIMIT 30",
        )
        .bind(user.id, user.id)
        .all<RequestRow>(),
      database
        .prepare(
          "SELECT ho.*,u.name helper_name,CASE WHEN hr.requester_id=? THEN u.email ELSE NULL END helper_email,hr.requester_id FROM help_offers ho JOIN users u ON u.id=ho.helper_id JOIN help_requests hr ON hr.id=ho.request_id WHERE hr.requester_id=? OR ho.helper_id=? ORDER BY ho.created_at DESC LIMIT 100",
        )
        .bind(user.id, user.id, user.id)
        .all(),
      database
        .prepare(
          "SELECT * FROM disaster_events WHERE status='ACTIVE' ORDER BY starts_at DESC LIMIT 20",
        )
        .all(),
      privileged
        ? database
            .prepare(
              "SELECT id,name,public_area,verified FROM organizations WHERE verified=1 ORDER BY name LIMIT 50",
            )
            .all()
        : Promise.resolve({ results: [] }),
      database
        .prepare(
          "SELECT r.id,r.category,r.name,r.quantity,r.unit,r.public_area,r.updated_at,r.owner_id,u.name owner_name,CASE WHEN r.owner_id=? THEN 1 ELSE 0 END is_owner FROM resources r JOIN users u ON u.id=r.owner_id WHERE r.quantity>0 OR r.owner_id=? ORDER BY r.updated_at DESC LIMIT 100",
        )
        .bind(user.id, user.id)
        .all(),
      database
        .prepare(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
        )
        .bind(user.id)
        .all(),
      database
        .prepare(
          "SELECT ru.* FROM request_updates ru JOIN help_requests hr ON hr.id=ru.request_id WHERE hr.status NOT IN ('RESOLVED','CANCELLED') AND (hr.requester_id=? OR hr.accepted_by=?) ORDER BY ru.created_at DESC LIMIT 20",
        )
        .bind(user.id, user.id)
        .all(),
      database
        .prepare(
          "SELECT COUNT(*) total,SUM(CASE WHEN status NOT IN ('RESOLVED','CANCELLED') THEN 1 ELSE 0 END) active,SUM(CASE WHEN urgency='CRITICAL' AND status NOT IN ('RESOLVED','CANCELLED') THEN 1 ELSE 0 END) critical,SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) resolved FROM help_requests",
        )
        .first(),
      privileged
        ? database
            .prepare(
              "SELECT * FROM volunteers ORDER BY available DESC,updated_at DESC LIMIT 100",
            )
            .all()
        : Promise.resolve({ results: [] }),
      user.role === "ADMIN"
        ? database
            .prepare(
              "SELECT * FROM reports WHERE status='PENDING' ORDER BY created_at DESC LIMIT 100",
            )
            .all()
        : Promise.resolve({ results: [] }),
    ]);
    const secure = (row: RequestRow) => {
      const participant =
        row.requester_id === user.id || row.accepted_by === user.id;
      const output = {
        ...row,
        is_owner: row.requester_id === user.id,
        is_helper: row.accepted_by === user.id,
        can_contact: participant && !!row.accepted_by,
      } as Record<string, unknown>;
      delete output.delivery_code;
      delete output.delivery_code_hash;
      delete output.delivery_code_expires_at;
      delete output.delivery_code_attempts;
      if (!participant) {
        output.approx_lat =
          row.approx_lat == null
            ? null
            : Math.round(row.approx_lat * 100) / 100;
        output.approx_lng =
          row.approx_lng == null
            ? null
            : Math.round(row.approx_lng * 100) / 100;
        delete output.helper_lat;
        delete output.helper_lng;
        delete output.eta_minutes;
        delete output.delivery_updated_at;
        delete output.delivery_started_at;
      }
      return output;
    };
    const contactRows = await database
      .prepare(
        "SELECT hr.id,requester.email requester_email,helper.email helper_email FROM help_requests hr JOIN users requester ON requester.id=hr.requester_id JOIN users helper ON helper.id=hr.accepted_by WHERE hr.accepted_by IS NOT NULL AND (hr.requester_id=? OR hr.accepted_by=?)",
      )
      .bind(user.id, user.id)
      .all<{ id: string; requester_email: string; helper_email: string }>();
    const contacts = new Map(contactRows.results.map((row) => [row.id, row]));
    const decorate = (row: RequestRow) => ({
      ...secure(row),
      ...(contacts.get(String(row.id)) ?? {}),
    });
    const requestRows = requests.results.map(decorate);
    return Response.json(
      {
        user,
        requests: requestRows,
        myRequests: myRequests.results.map(decorate),
        history: history.results.map(decorate),
        offers: offers.results,
        events: events.results,
        volunteers: volunteers.results,
        organizations: organizations.results,
        resources: resources.results,
        notifications: notifications.results,
        reports: reports.results,
        activity: activity.results,
        metrics,
        nextCursor:
          requestRows.length === 50
            ? String(requestRows.at(-1)?.created_at ?? "")
            : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (error instanceof AuthorizationError)
      return Response.json({ error: error.message }, { status: 403 });
    const errorId = crypto.randomUUID();
    console.error("Sahaaya state failure", errorId, error);
    return Response.json(
      { error: "Unable to load the help network.", errorId },
      { status: 500 },
    );
  }
}
