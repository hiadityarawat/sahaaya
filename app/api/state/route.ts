import { db, ensureDatabase, currentUser } from "../../../lib/site-db";

export const dynamic="force-dynamic";
export async function GET(request:Request) {
  await ensureDatabase(); const user=await currentUser(); const url=new URL(request.url);
  const q=url.searchParams.get("q")?.trim() ?? ""; const status=url.searchParams.get("status") ?? "ALL"; const category=url.searchParams.get("category") ?? "ALL";
  const conditions=[]; const bindings:unknown[]=[];
  if(q){conditions.push("(id LIKE ? OR public_area LIKE ? OR description LIKE ?)");bindings.push(`%${q}%`,`%${q}%`,`%${q}%`)}
  if(status!=="ALL"){conditions.push("status=?");bindings.push(status)} if(category!=="ALL"){conditions.push("category=?");bindings.push(category)}
  const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";
  const database=db();
  const [requests,events,volunteers,organizations,resources,notifications,reports,activity,metrics]=await Promise.all([
    database.prepare(`SELECT * FROM help_requests ${where} ORDER BY CASE urgency WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,created_at DESC LIMIT 100`).bind(...bindings).all(),
    database.prepare("SELECT * FROM disaster_events ORDER BY starts_at DESC").all(), database.prepare("SELECT * FROM volunteers ORDER BY available DESC,completed_tasks DESC").all(),
    database.prepare("SELECT * FROM organizations ORDER BY verified DESC,name").all(), database.prepare("SELECT r.*,o.name organization_name FROM resources r JOIN organizations o ON o.id=r.organization_id ORDER BY r.category").all(),
    database.prepare("SELECT * FROM notifications WHERE user_id IN (?, 'local-owner') ORDER BY created_at DESC LIMIT 30").bind(user.id).all(), database.prepare("SELECT rp.*,hr.category,hr.public_area FROM reports rp JOIN help_requests hr ON hr.id=rp.request_id ORDER BY rp.created_at DESC").all(),
    database.prepare("SELECT * FROM request_updates ORDER BY created_at DESC LIMIT 20").all(),
    database.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status!='RESOLVED' AND status!='CANCELLED' THEN 1 ELSE 0 END) active,SUM(CASE WHEN urgency='CRITICAL' AND status!='RESOLVED' THEN 1 ELSE 0 END) critical,SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) resolved FROM help_requests").first(),
  ]);
  return Response.json({user,requests:requests.results,events:events.results,volunteers:volunteers.results,organizations:organizations.results,resources:resources.results,notifications:notifications.results,reports:reports.results,activity:activity.results,metrics});
}
