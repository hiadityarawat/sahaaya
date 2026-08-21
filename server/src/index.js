import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { rankMatches } from "./matching.js";
import { canTransition } from "./policy.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({ region:process.env.AWS_REGION });
const app = express();
const allowedRoles = ["USER", "VOLUNTEER", "ORGANIZATION", "ADMIN"];
const statuses = ["OPEN", "ACCEPTED", "VOLUNTEER_ASSIGNED", "IN_PROGRESS", "RESOLVED", "CANCELLED"];

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 25, standardHeaders: "draft-8" }));
app.use("/api/requests", rateLimit({ windowMs: 10 * 60_000, limit: 60, standardHeaders: "draft-8" }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const sign = (user) => jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "sahaaya-api" });
const authenticate = (req, res, next) => {
  try { req.user = jwt.verify(req.headers.authorization?.replace("Bearer ", ""), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Authentication required" }); }
};
const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Insufficient permission" });
const validate = (schema) => (req, res, next) => { const result = schema.safeParse(req.body); if (!result.success) return res.status(400).json({ error: "Invalid input", details: result.error.flatten() }); req.body = result.data; next(); };

const registerSchema = z.object({ name:z.string().min(2).max(100), email:z.email(), password:z.string().min(10).max(128), role:z.enum(allowedRoles).default("USER") });
const loginSchema = z.object({ email:z.email(), password:z.string().min(1) });
const requestSchema = z.object({ category:z.enum(["FOOD","WATER","MEDICAL","SHELTER","RESCUE","CLOTHES","TRANSPORT","OTHER"]), publicArea:z.string().min(2).max(120), peopleCount:z.number().int().min(1).max(1000), description:z.string().min(10).max(1000), urgency:z.enum(["NORMAL","URGENT","CRITICAL"]), contactMethod:z.enum(["IN_APP","PHONE","SMS","EMAIL"]), disasterEventId:z.string().uuid().optional() });

app.get("/health", (_req, res) => res.json({ status:"ok", service:"sahaaya-api", time:new Date().toISOString() }));
app.get("/ready", asyncRoute(async (_req, res) => { await pool.query("SELECT 1"); res.json({ status:"ready" }); }));

app.post("/api/auth/register", validate(registerSchema), asyncRoute(async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 12);
  const { rows } = await pool.query("INSERT INTO users (name,email,password_hash,role) VALUES ($1,LOWER($2),$3,$4) RETURNING id,name,email,role,email_verified,created_at", [req.body.name, req.body.email, hash, req.body.role]);
  res.status(201).json({ user:rows[0], token:sign(rows[0]) });
}));
app.post("/api/auth/login", validate(loginSchema), asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE email=LOWER($1) AND blocked_at IS NULL", [req.body.email]);
  if (!rows[0] || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) return res.status(401).json({ error:"Invalid credentials" });
  res.json({ user:{ id:rows[0].id,name:rows[0].name,email:rows[0].email,role:rows[0].role }, token:sign(rows[0]) });
}));
app.post("/api/auth/logout", authenticate, (_req,res)=>res.status(204).end());
app.post("/api/auth/refresh", authenticate, asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT id,name,email,role FROM users WHERE id=$1 AND blocked_at IS NULL",[req.user.sub]);if(!rows[0])return res.status(401).json({error:"Account unavailable"});res.json({token:sign(rows[0])})}));
app.post("/api/auth/forgot-password", validate(z.object({email:z.email()})), asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT id FROM users WHERE email=LOWER($1)",[req.body.email]);if(rows[0]){const token=randomBytes(32).toString("hex");const digest=createHash("sha256").update(token).digest("hex");await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+interval '30 minutes')",[rows[0].id,digest]);if(process.env.NODE_ENV!=="production")res.setHeader("x-demo-reset-token",token)}res.json({message:"If the account exists, reset instructions have been created."})}));
app.post("/api/auth/reset-password", validate(z.object({token:z.string().min(32),password:z.string().min(10).max(128)})), asyncRoute(async(req,res)=>{const digest=createHash("sha256").update(req.body.token).digest("hex");const hash=await bcrypt.hash(req.body.password,12);const {rows}=await pool.query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=(SELECT user_id FROM password_reset_tokens WHERE token_hash=$2 AND used_at IS NULL AND expires_at>NOW()) RETURNING id",[hash,digest]);if(!rows[0])return res.status(400).json({error:"Reset link is invalid or expired"});await pool.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=$1",[digest]);res.json({message:"Password updated"})}));
app.post("/api/auth/verify-email", authenticate, asyncRoute(async(req,res)=>{await pool.query("UPDATE users SET email_verified=true,updated_at=NOW() WHERE id=$1",[req.user.sub]);res.json({message:"Email verified"})}));

app.get("/api/requests", asyncRoute(async (req, res) => {
  const params=[]; const where=[];
  for (const [field,column] of [["category","category"],["urgency","urgency"],["status","status"],["area","public_area"]]) if (req.query[field]) { params.push(req.query[field]); where.push(`${column} = $${params.length}`); }
  const { rows } = await pool.query(`SELECT public_id,category,public_area,people_count,description,urgency,status,created_at,approx_lat,approx_lng FROM help_requests ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE urgency WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END, created_at DESC LIMIT 100`, params);
  res.json({ data:rows });
}));
app.post("/api/requests", authenticate, validate(requestSchema), asyncRoute(async (req, res) => {
  const client=await pool.connect();
  try { await client.query("BEGIN"); const publicId=`REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`; const { rows }=await client.query("INSERT INTO help_requests (public_id,requester_id,disaster_event_id,category,public_area,people_count,description,urgency,contact_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [publicId,req.user.sub,req.body.disasterEventId ?? null,req.body.category,req.body.publicArea,req.body.peopleCount,req.body.description,req.body.urgency,req.body.contactMethod]); await client.query("INSERT INTO request_status_history (request_id,status,changed_by) VALUES ($1,'OPEN',$2)",[rows[0].id,req.user.sub]); await client.query("INSERT INTO notifications (user_id,title,body,type) VALUES ($1,'Request created',$2,'REQUEST_CREATED')",[req.user.sub,`${publicId} is now being matched with responders.`]); await client.query("COMMIT"); res.status(201).json({ data:rows[0] }); } catch(error){await client.query("ROLLBACK");throw error} finally{client.release()}
}));
app.get("/api/requests/:publicId", asyncRoute(async (req,res)=>{ const { rows }=await pool.query("SELECT public_id,category,public_area,people_count,description,urgency,status,created_at FROM help_requests WHERE public_id=$1",[req.params.publicId]); if(!rows[0]) return res.status(404).json({error:"Request not found"}); const history=await pool.query("SELECT status,created_at FROM request_status_history WHERE request_id=(SELECT id FROM help_requests WHERE public_id=$1) ORDER BY created_at",[req.params.publicId]); res.json({data:{...rows[0],history:history.rows}}) }));
app.post("/api/requests/:publicId/accept", authenticate, authorize("VOLUNTEER","ORGANIZATION","ADMIN"), asyncRoute(async(req,res)=>{ const {rows}=await pool.query("UPDATE help_requests SET status='ACCEPTED', accepted_by=$1, updated_at=NOW() WHERE public_id=$2 AND status='OPEN' RETURNING public_id,status",[req.user.sub,req.params.publicId]); if(!rows[0]) return res.status(409).json({error:"Request is no longer available"}); res.json({data:rows[0]}) }));
app.patch("/api/requests/:publicId/status", authenticate, validate(z.object({status:z.enum(statuses),note:z.string().max(500).optional()})), asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");const current=await client.query("SELECT id,status,requester_id,accepted_by,assigned_volunteer_id FROM help_requests WHERE public_id=$1 FOR UPDATE",[req.params.publicId]);const item=current.rows[0];if(!item){await client.query("ROLLBACK");return res.status(404).json({error:"Request not found"})}const authorized=req.user.role==="ADMIN"||[item.requester_id,item.accepted_by,item.assigned_volunteer_id].includes(req.user.sub);if(!authorized){await client.query("ROLLBACK");return res.status(403).json({error:"Not authorized for this request"})}if(item.status!==req.body.status&&!canTransition(item.status,req.body.status)){await client.query("ROLLBACK");return res.status(409).json({error:`Cannot move from ${item.status} to ${req.body.status}`})}const {rows}=await client.query("UPDATE help_requests SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,public_id,status",[req.body.status,item.id]);await client.query("INSERT INTO request_status_history(request_id,status,changed_by,note) VALUES($1,$2,$3,$4)",[item.id,req.body.status,req.user.sub,req.body.note]);await client.query("COMMIT");res.json({data:rows[0]})}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}}));
app.get("/api/notifications", authenticate, asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT id,title,body,type,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.sub]);res.json({data:rows})}));
app.patch("/api/notifications/read", authenticate, asyncRoute(async(req,res)=>{await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL",[req.user.sub]);res.status(204).end()}));
app.get("/api/volunteers", authenticate, authorize("ORGANIZATION","ADMIN"), asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT u.id,u.name,v.skills,v.areas,v.available FROM volunteers v JOIN users u ON u.id=v.user_id WHERE u.blocked_at IS NULL ORDER BY v.available DESC,u.name");res.json({data:rows})}));
app.patch("/api/volunteers/availability", authenticate, authorize("VOLUNTEER","ADMIN"), validate(z.object({available:z.boolean()})), asyncRoute(async(req,res)=>{await pool.query("INSERT INTO volunteers(user_id,available) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET available=$2,updated_at=NOW()",[req.user.sub,req.body.available]);res.json({available:req.body.available})}));
app.get("/api/requests/:publicId/matches", authenticate, authorize("ORGANIZATION","ADMIN"), asyncRoute(async(req,res)=>{const requestResult=await pool.query("SELECT category,public_area,people_count FROM help_requests WHERE public_id=$1",[req.params.publicId]);if(!requestResult.rows[0])return res.status(404).json({error:"Request not found"});const volunteerResult=await pool.query("SELECT u.id,u.name,v.skills,v.areas,v.available,1 capacity,true verified FROM volunteers v JOIN users u ON u.id=v.user_id WHERE u.blocked_at IS NULL");const responders=volunteerResult.rows.map(v=>({...v,skills:v.skills??[],areas:v.areas??[]}));res.json({data:rankMatches({category:requestResult.rows[0].category,publicArea:requestResult.rows[0].public_area,peopleCount:requestResult.rows[0].people_count},responders)})}));
app.post("/api/requests/:publicId/updates", authenticate, validate(z.object({body:z.string().min(3).max(500)})), asyncRoute(async(req,res)=>{const {rows}=await pool.query("INSERT INTO request_updates(request_id,author_id,body) SELECT id,$1,$2 FROM help_requests WHERE public_id=$3 AND (requester_id=$1 OR accepted_by=$1 OR assigned_volunteer_id=$1 OR $4='ADMIN') RETURNING id,body,created_at",[req.user.sub,req.body.body,req.params.publicId,req.user.role]);if(!rows[0])return res.status(403).json({error:"Not authorized"});res.status(201).json({data:rows[0]})}));
app.post("/api/requests/:publicId/report", authenticate, validate(z.object({reason:z.string().min(5).max(500)})), asyncRoute(async(req,res)=>{const {rows}=await pool.query("INSERT INTO reports(request_id,reporter_id,reason) SELECT id,$1,$2 FROM help_requests WHERE public_id=$3 RETURNING id,status",[req.user.sub,req.body.reason,req.params.publicId]);if(!rows[0])return res.status(404).json({error:"Request not found"});res.status(201).json({data:rows[0]})}));
app.post("/api/uploads/presign", authenticate, validate(z.object({requestId:z.string().regex(/^REQ-\d{4}-\d+$/),contentType:z.enum(["image/jpeg","image/png","image/webp"]),size:z.number().int().max(5*1024*1024)})), asyncRoute(async(req,res)=>{const allowed=await pool.query("SELECT id FROM help_requests WHERE public_id=$1 AND requester_id=$2",[req.body.requestId,req.user.sub]);if(!allowed.rows[0])return res.status(403).json({error:"Upload not permitted"});const key=`requests/${req.body.requestId}/${randomBytes(16).toString("hex")}`;const command=new PutObjectCommand({Bucket:process.env.UPLOAD_BUCKET,Key:key,ContentType:req.body.contentType,Metadata:{owner:req.user.sub}});res.json({uploadUrl:await getSignedUrl(s3,command,{expiresIn:300}),key,expiresIn:300})}));
app.get("/api/resources", asyncRoute(async(_req,res)=>{const {rows}=await pool.query("SELECT r.id,r.name,r.category,r.quantity,r.unit,o.name organization FROM resources r JOIN organizations o ON o.id=r.organization_id WHERE r.quantity>0 ORDER BY r.category,r.name");res.json({data:rows})}));
app.patch("/api/resources/:id", authenticate, authorize("ORGANIZATION","ADMIN"), validate(z.object({delta:z.number().int(),note:z.string().min(3).max(250)})), asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");const {rows}=await client.query("UPDATE resources SET quantity=quantity+$1,updated_at=NOW() WHERE id=$2 AND quantity+$1>=0 RETURNING *",[req.body.delta,req.params.id]);if(!rows[0])return res.status(409).json({error:"Insufficient stock or missing resource"});await client.query("INSERT INTO resource_transactions(resource_id,quantity_delta,note,created_by) VALUES($1,$2,$3,$4)",[req.params.id,req.body.delta,req.body.note,req.user.sub]);await client.query("COMMIT");res.json({data:rows[0]})}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}}));
app.get("/api/admin/reports", authenticate, authorize("ADMIN"), asyncRoute(async(_req,res)=>{const {rows}=await pool.query("SELECT rp.*,hr.public_id,hr.category,hr.public_area FROM reports rp JOIN help_requests hr ON hr.id=rp.request_id ORDER BY rp.created_at DESC");res.json({data:rows})}));
app.get("/api/disasters", asyncRoute(async(_req,res)=>{const {rows}=await pool.query("SELECT id,name,status,affected_areas,starts_at,ends_at FROM disaster_events ORDER BY starts_at DESC");res.json({data:rows})}));
app.post("/api/disasters", authenticate, authorize("ADMIN"), validate(z.object({name:z.string().min(3).max(160),status:z.enum(["DRAFT","ACTIVE","CLOSED"]),affectedAreas:z.array(z.string().min(2)).min(1),startsAt:z.iso.datetime()})), asyncRoute(async(req,res)=>{const {rows}=await pool.query("INSERT INTO disaster_events(name,status,affected_areas,starts_at,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.body.name,req.body.status,req.body.affectedAreas,req.body.startsAt,req.user.sub]);res.status(201).json({data:rows[0]})}));

app.use((_req,res)=>res.status(404).json({error:"Route not found"}));
app.use((error,_req,res,_next)=>{console.error(error);if(error.code==="23505")return res.status(409).json({error:"Record already exists"});res.status(500).json({error:"Unexpected server error"})});
export { app };
if (process.env.NODE_ENV !== "test") {
  const port=Number(process.env.PORT ?? 4000);
  app.listen(port,()=>console.log(`Sahaaya API listening on ${port}`));
}
