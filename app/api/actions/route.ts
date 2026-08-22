import {
  AuthenticationRequiredError,
  AuthorizationError,
  RateLimitError,
  consumeRateLimit,
  currentUser,
  db,
  ensureDatabase,
  hashDeliveryCode,
  makeId,
  requireRole,
  timestamp,
} from "../../../lib/site-db";
import { requireAdminSession } from "../../../lib/admin-auth";
import { env } from "cloudflare:workers";
import { sameOrigin } from "../../../lib/user-auth";

const allowedStatus=["ACCEPTED","IN_PROGRESS"];
const categories=["FOOD","WATER","MEDICAL","SHELTER","RESCUE","CLOTHES","TRANSPORT","OTHER"];
const activeDeliveryStatuses=["ACCEPTED","IN_PROGRESS"];
const codeLifetimeMs=45*60_000;
const maxCodeAttempts=5;

function validCoordinate(value:number,min:number,max:number){return Number.isFinite(value)&&value>=min&&value<=max}
function etaMinutes(fromLat:number,fromLng:number,toLat:number,toLng:number){const rad=(v:number)=>v*Math.PI/180;const dLat=rad(toLat-fromLat),dLng=rad(toLng-fromLng);const a=Math.sin(dLat/2)**2+Math.cos(rad(fromLat))*Math.cos(rad(toLat))*Math.sin(dLng/2)**2;const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return Math.max(2,Math.ceil(km/22*60+3))}
function newDeliveryCode(){const value=new Uint32Array(1);crypto.getRandomValues(value);return String(100000+(value[0]%900000))}
function actionError(error:unknown){
  if(error instanceof AuthenticationRequiredError)return Response.json({error:"Sign in to continue."},{status:401});
  if(error instanceof AuthorizationError)return Response.json({error:error.message},{status:403});
  if(error instanceof RateLimitError)return Response.json({error:error.message},{status:429,headers:{"Retry-After":"60"}});
  const errorId=crypto.randomUUID();console.error("Sahaaya action failure",errorId,error);return Response.json({error:"The operation could not be completed safely. Please retry.",errorId},{status:500});
}

export async function POST(request:Request) {
  try {
    if(!sameOrigin(request))return Response.json({error:"Cross-site requests are not allowed."},{status:403});
    await ensureDatabase();
    const user=await currentUser();
    let body:Record<string,unknown>;
    try{body=await request.json() as Record<string,unknown>}catch{return Response.json({error:"Invalid request body."},{status:400})}
    const database=db();const time=timestamp();
    const action=String(body.action??"");
    const adminSensitiveActions=new Set(["update_status","availability","assign_volunteer","adjust_resource","delete_resource","verify_resource","review_report","verify_org","create_event","manage_user"]);
    if(user.role==="ADMIN"&&adminSensitiveActions.has(action))await requireAdminSession(user,request.headers);

    if(body.action==="create_request"){
      const category=String(body.category);const area=String(body.publicArea??"").trim();const people=Number(body.peopleCount);const description=String(body.description??"").trim();const urgency=String(body.urgency);
      if(!categories.includes(category)||area.length<2||area.length>120||!Number.isInteger(people)||people<1||people>1000||description.length<10||description.length>1000||!["NORMAL","URGENT","CRITICAL"].includes(urgency))return Response.json({error:"Please complete every required field."},{status:400});
      const latitude=Number(body.latitude),longitude=Number(body.longitude);if(!validCoordinate(latitude,-90,90)||!validCoordinate(longitude,-180,180))return Response.json({error:"Allow location access so helpers can find and reach you safely."},{status:400});
      const clientRequestId=String(body.clientRequestId??"").trim();if(!/^[a-zA-Z0-9-]{10,100}$/.test(clientRequestId))return Response.json({error:"This request draft is missing its safe submission ID. Reopen the form and retry."},{status:400});
      const existing=await database.prepare("SELECT id FROM help_requests WHERE requester_id=? AND client_request_id=?").bind(user.id,clientRequestId).first<{id:string}>();
      if(existing)return Response.json({ok:true,id:existing.id,deduplicated:true});
      await consumeRateLimit(`request:${user.id}`,10,60*60_000);
      const eventId=String(body.eventId??"").trim()||null;
      if(eventId){const event=await database.prepare("SELECT id FROM disaster_events WHERE id=? AND status='ACTIVE'").bind(eventId).first();if(!event)return Response.json({error:"The selected disaster event is no longer active."},{status:409})}
      const id=`REQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
      try{await database.batch([
        database.prepare("INSERT INTO help_requests(id,requester_id,client_request_id,event_id,category,public_area,people_count,description,urgency,contact_method,status,approx_lat,approx_lng,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'OPEN',?,?,?,?)").bind(id,user.id,clientRequestId,eventId,category,area,people,description,urgency,String(body.contactMethod||"IN_APP"),latitude,longitude,time,time),
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'OPEN','Request created with privacy-safe location.',?)").bind(id,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Request created',?,'REQUEST_CREATED',?)").bind(makeId("note"),user.id,`${id} is now visible to nearby community helpers.`,time),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'CREATE','REQUEST',?,'{}',?)").bind(user.id,id,time),
      ])}catch(error){const duplicate=await database.prepare("SELECT id FROM help_requests WHERE requester_id=? AND client_request_id=?").bind(user.id,clientRequestId).first<{id:string}>();if(duplicate)return Response.json({ok:true,id:duplicate.id,deduplicated:true});throw error}
      return Response.json({ok:true,id});
    }

    if(body.action==="offer_help"){
      await consumeRateLimit(`offer:${user.id}`,30,10*60_000);
      const requestId=String(body.id),message=String(body.message||"").trim();
      if(message.length<5||message.length>500)return Response.json({error:"Briefly describe the help you can provide."},{status:400});
      const helpRequest=await database.prepare("SELECT requester_id,status FROM help_requests WHERE id=?").bind(requestId).first<{requester_id:string;status:string}>();
      if(!helpRequest)return Response.json({error:"This request no longer exists."},{status:404});
      if(helpRequest.requester_id===user.id)return Response.json({error:"You cannot offer help on your own request."},{status:400});
      if(helpRequest.status!=="OPEN")return Response.json({error:"This request is no longer accepting offers."},{status:409});
      const offerId=makeId("offer");
      try{await database.batch([
        database.prepare("INSERT INTO help_offers(id,request_id,helper_id,message,status,created_at,updated_at) VALUES(?,?,?,?,'PENDING',?,?)").bind(offerId,requestId,user.id,message,time,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'New help offer',?,'HELP_OFFER',?)").bind(makeId("note"),helpRequest.requester_id,`${user.name} offered support for ${requestId}.`,time),
      ])}catch{return Response.json({error:"You have already offered help for this request."},{status:409})}
      return Response.json({ok:true,id:offerId});
    }

    if(body.action==="accept_offer"){
      const offerId=String(body.offerId);
      const offer=await database.prepare("SELECT ho.id,ho.request_id,ho.helper_id,hr.requester_id,hr.status FROM help_offers ho JOIN help_requests hr ON hr.id=ho.request_id WHERE ho.id=?").bind(offerId).first<{id:string;request_id:string;helper_id:string;requester_id:string;status:string}>();
      if(!offer)return Response.json({error:"This offer is no longer available."},{status:404});
      if(offer.requester_id!==user.id)return Response.json({error:"Only the person who requested help can accept an offer."},{status:403});
      if(offer.status!=="OPEN")return Response.json({error:"This request is already being handled."},{status:409});
      const claimed=await database.prepare("UPDATE help_requests SET accepted_by=?,status='ACCEPTED',delivery_code=NULL,delivery_code_hash=NULL,delivery_code_expires_at=NULL,delivery_code_attempts=0,updated_at=? WHERE id=? AND status='OPEN' AND accepted_by IS NULL").bind(offer.helper_id,time,offer.request_id).run();
      if(!claimed.meta.changes)return Response.json({error:"Another helper has already been accepted for this request."},{status:409});
      await database.batch([
        database.prepare("UPDATE help_offers SET status=CASE WHEN id=? THEN 'ACCEPTED' ELSE 'DECLINED' END,updated_at=? WHERE request_id=? AND status='PENDING'").bind(offerId,time,offer.request_id),
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'ACCEPTED','A helper was accepted. Private contact is now shared between both people.',?)").bind(offer.request_id,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Your help offer was accepted',?,'OFFER_ACCEPTED',?)").bind(makeId("note"),offer.helper_id,`${offer.request_id}: contact details are now available. Generate a confirmation code only when delivery is ready.`,time),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ACCEPT_OFFER','REQUEST',?,'{}',?)").bind(user.id,offer.request_id,time),
      ]);
      return Response.json({ok:true});
    }

    if(body.action==="generate_delivery_code"){
      await consumeRateLimit(`delivery-code:${user.id}`,8,60*60_000);
      const requestId=String(body.id);
      const target=await database.prepare("SELECT accepted_by,status FROM help_requests WHERE id=?").bind(requestId).first<{accepted_by:string|null;status:string}>();
      if(!target)return Response.json({error:"Request not found."},{status:404});
      if(target.accepted_by!==user.id)return Response.json({error:"Only the accepted helper can generate the delivery code."},{status:403});
      if(!activeDeliveryStatuses.includes(target.status))return Response.json({error:"A code is available only for an active delivery."},{status:409});
      const code=newDeliveryCode(),hash=await hashDeliveryCode(requestId,code),expiresAt=new Date(Date.now()+codeLifetimeMs).toISOString();
      const updated=await database.prepare("UPDATE help_requests SET delivery_code=NULL,delivery_code_hash=?,delivery_code_expires_at=?,delivery_code_attempts=0,delivery_code_created_at=?,updated_at=? WHERE id=? AND accepted_by=? AND status IN ('ACCEPTED','IN_PROGRESS')").bind(hash,expiresAt,time,time,requestId,user.id).run();
      if(!updated.meta.changes)return Response.json({error:"The request is no longer ready for confirmation."},{status:409});
      return Response.json({ok:true,code,expiresAt});
    }

    if(body.action==="confirm_delivery"){
      await consumeRateLimit(`confirm:${user.id}`,12,15*60_000);
      const requestId=String(body.id),code=String(body.code||"").trim();if(!/^\d{6}$/.test(code))return Response.json({error:"Enter the 6-digit delivery code."},{status:400});
      const target=await database.prepare("SELECT requester_id,accepted_by,status,delivery_code_hash,delivery_code_expires_at,delivery_code_attempts FROM help_requests WHERE id=?").bind(requestId).first<{requester_id:string;accepted_by:string|null;status:string;delivery_code_hash:string|null;delivery_code_expires_at:string|null;delivery_code_attempts:number}>();
      if(!target)return Response.json({error:"Request not found."},{status:404});
      if(target.requester_id!==user.id)return Response.json({error:"Only the requester can confirm delivery."},{status:403});
      if(!target.accepted_by||!activeDeliveryStatuses.includes(target.status))return Response.json({error:"This delivery cannot be confirmed yet."},{status:409});
      if(!target.delivery_code_hash||!target.delivery_code_expires_at)return Response.json({error:"Ask the helper to generate a fresh delivery code."},{status:409});
      if(Date.parse(target.delivery_code_expires_at)<=Date.now())return Response.json({error:"This code expired. Ask the helper to generate a new one."},{status:410});
      if(target.delivery_code_attempts>=maxCodeAttempts)return Response.json({error:"Too many incorrect attempts. Ask the helper to generate a new code."},{status:423});
      const hash=await hashDeliveryCode(requestId,code);
      if(hash!==target.delivery_code_hash){
        await database.prepare("UPDATE help_requests SET delivery_code_attempts=delivery_code_attempts+1,updated_at=? WHERE id=? AND requester_id=? AND status IN ('ACCEPTED','IN_PROGRESS')").bind(time,requestId,user.id).run();
        return Response.json({error:"That delivery code is incorrect."},{status:400});
      }
      const completed=await database.prepare("UPDATE help_requests SET status='RESOLVED',delivery_code=NULL,delivery_code_hash=NULL,delivery_code_expires_at=NULL,delivery_code_attempts=0,helper_lat=NULL,helper_lng=NULL,eta_minutes=NULL,updated_at=? WHERE id=? AND requester_id=? AND delivery_code_hash=? AND status IN ('ACCEPTED','IN_PROGRESS')").bind(time,requestId,user.id,hash).run();
      if(!completed.meta.changes)return Response.json({error:"This delivery was already completed or the code changed."},{status:409});
      await database.batch([
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'RESOLVED','Delivery confirmed with a one-time code.',?)").bind(requestId,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Delivery confirmed',?,'DELIVERY_CONFIRMED',?)").bind(makeId("note"),target.accepted_by,`${requestId} was confirmed and completed.`,time),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'CONFIRM_DELIVERY','REQUEST',?,'{}',?)").bind(user.id,requestId,time),
      ]);
      return Response.json({ok:true});
    }

    if(body.action==="cancel_request"){
      const requestId=String(body.id);const result=await database.prepare("UPDATE help_requests SET status='CANCELLED',updated_at=? WHERE id=? AND requester_id=? AND status='OPEN' AND accepted_by IS NULL").bind(time,requestId,user.id).run();
      if(!result.meta.changes)return Response.json({error:"Only an unclaimed request can be cancelled by its requester."},{status:409});
      await database.batch([database.prepare("UPDATE help_offers SET status='DECLINED',updated_at=? WHERE request_id=? AND status='PENDING'").bind(time,requestId),database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'CANCELLED','The requester cancelled this unclaimed request.',?)").bind(requestId,user.id,time)]);return Response.json({ok:true});
    }

    if(body.action==="delete_request"){
      const requestId=String(body.id);const target=await database.prepare("SELECT requester_id,status,accepted_by,image_key FROM help_requests WHERE id=?").bind(requestId).first<{requester_id:string;status:string;accepted_by:string|null;image_key:string|null}>();
      if(!target)return Response.json({error:"Request not found."},{status:404});if(target.requester_id!==user.id||target.accepted_by||!["OPEN","CANCELLED"].includes(target.status))return Response.json({error:"Only your unclaimed request can be permanently deleted."},{status:403});
      const removed=await database.prepare("DELETE FROM help_requests WHERE id=? AND requester_id=? AND accepted_by IS NULL AND status IN ('OPEN','CANCELLED')").bind(requestId,user.id).run();
      if(!removed.meta.changes)return Response.json({error:"The request changed and was not deleted."},{status:409});
      await database.batch([database.prepare("DELETE FROM help_offers WHERE request_id=?").bind(requestId),database.prepare("DELETE FROM request_updates WHERE request_id=?").bind(requestId),database.prepare("DELETE FROM reports WHERE request_id=?").bind(requestId),database.prepare("DELETE FROM uploaded_files WHERE request_id=?").bind(requestId)]);
      if(target.image_key)await env.UPLOADS.delete(target.image_key);return Response.json({ok:true});
    }

    if(body.action==="update_delivery_location"){
      await consumeRateLimit(`tracking:${user.id}`,180,30*60_000);
      const requestId=String(body.id),latitude=Number(body.latitude),longitude=Number(body.longitude);
      if(!validCoordinate(latitude,-90,90)||!validCoordinate(longitude,-180,180))return Response.json({error:"A valid live location is required."},{status:400});
      const target=await database.prepare("SELECT approx_lat,approx_lng,accepted_by,status FROM help_requests WHERE id=?").bind(requestId).first<{approx_lat:number|null;approx_lng:number|null;accepted_by:string|null;status:string}>();
      if(!target)return Response.json({error:"Request not found."},{status:404});if(target.accepted_by!==user.id)return Response.json({error:"Only the accepted helper can share delivery progress."},{status:403});if(!activeDeliveryStatuses.includes(target.status))return Response.json({error:"Tracking has ended for this request."},{status:409});
      const eta=target.approx_lat!=null&&target.approx_lng!=null?etaMinutes(latitude,longitude,target.approx_lat,target.approx_lng):null;
      const updated=await database.prepare("UPDATE help_requests SET helper_lat=?,helper_lng=?,eta_minutes=?,delivery_started_at=COALESCE(delivery_started_at,?),delivery_updated_at=?,status=CASE WHEN status='ACCEPTED' THEN 'IN_PROGRESS' ELSE status END,updated_at=? WHERE id=? AND accepted_by=? AND status IN ('ACCEPTED','IN_PROGRESS')").bind(latitude,longitude,eta,time,time,time,requestId,user.id).run();
      if(!updated.meta.changes)return Response.json({error:"Tracking has ended for this request."},{status:409});
      return Response.json({ok:true,eta,deliveryUpdatedAt:time});
    }

    if(body.action==="update_status"){
      const id=String(body.id),status=String(body.status),note=String(body.note||`Status changed to ${status}.`).slice(0,500);
      if(!allowedStatus.includes(status))return Response.json({error:"Invalid status."},{status:400});
      const result=await database.prepare("UPDATE help_requests SET status=?,updated_at=? WHERE id=? AND status IN ('ACCEPTED','IN_PROGRESS') AND accepted_by IS NOT NULL AND (requester_id=? OR accepted_by=? OR ?='ADMIN')").bind(status,time,id,user.id,user.id,user.role).run();
      if(!result.meta.changes)return Response.json({error:"Only a participant can update an active request."},{status:403});
      await database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,?,?,?)").bind(id,user.id,status,note,time).run();return Response.json({ok:true});
    }

    if(body.action==="availability"){
      if(user.role!=="VOLUNTEER"&&user.role!=="ADMIN")throw new AuthorizationError("Only registered volunteers can change availability.");
      const volunteerId=String(body.volunteerId);if(volunteerId!==user.id&&user.role!=="ADMIN")throw new AuthorizationError("You can change only your own availability.");
      await database.prepare("UPDATE volunteers SET available=?,updated_at=? WHERE user_id=?").bind(body.available?1:0,time,volunteerId).run();return Response.json({ok:true});
    }
    if(body.action==="assign_volunteer"){
      requireRole(user,["ORGANIZATION","ADMIN"]);const id=String(body.id),volunteerId=String(body.volunteerId);
      const result=await database.prepare("UPDATE help_requests SET assigned_volunteer_id=?,status='VOLUNTEER_ASSIGNED',updated_at=? WHERE id=? AND assigned_volunteer_id IS NULL AND status='ACCEPTED' AND EXISTS(SELECT 1 FROM volunteers WHERE user_id=? AND available=1)").bind(volunteerId,time,id,volunteerId).run();
      if(!result.meta.changes)return Response.json({error:"The volunteer is unavailable or the request already has an assignment."},{status:409});return Response.json({ok:true});
    }

    if(body.action==="add_resource"){
      await consumeRateLimit(`resource:${user.id}`,20,60*60_000);
      const name=String(body.name||"").trim(),quantity=Number(body.quantity),category=String(body.category||"OTHER"),unit=String(body.unit||"items").trim(),area=String(body.publicArea||"").trim();
      if(name.length<2||name.length>120||!categories.includes(category)||!Number.isInteger(quantity)||quantity<1||quantity>1_000_000||unit.length<1||unit.length>30||area.length<2||area.length>120)return Response.json({error:"Enter a valid resource, available quantity, unit, and pickup area."},{status:400});
      const id=makeId("resource"),expiresAt=new Date(Date.now()+7*24*60*60_000).toISOString();
      await database.batch([
        database.prepare("INSERT INTO resources(id,organization_id,event_id,category,name,quantity,unit,owner_id,public_area,verification_status,expires_at,created_at,updated_at) VALUES(?,'community',NULL,?,?,?,?,?,?,'PENDING',?,?,?)").bind(id,category,name,quantity,unit,user.id,area,expiresAt,time,time),
        database.prepare("INSERT INTO resource_transactions(resource_id,delta,note,actor_id,created_at) VALUES(?,?,?,?,?)").bind(id,quantity,"Initial user-confirmed availability",user.id,time),
      ]);return Response.json({ok:true,id});
    }
    if(body.action==="verify_resource"){
      requireRole(user,["ADMIN"]);const id=String(body.id),status=String(body.status);if(!["VERIFIED","REJECTED"].includes(status))return Response.json({error:"Invalid resource verification status."},{status:400});
      const target=await database.prepare("SELECT owner_id,name FROM resources WHERE id=?").bind(id).first<{owner_id:string;name:string}>();if(!target)return Response.json({error:"Resource listing not found."},{status:404});
      const changed=await database.prepare("UPDATE resources SET verification_status=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?").bind(status,user.id,time,time,id).run();if(!changed.meta.changes)return Response.json({error:"Resource listing changed before review."},{status:409});
      await database.batch([database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Resource review completed',?,'RESOURCE_REVIEW',?)").bind(makeId("note"),target.owner_id,`${target.name} was ${status.toLowerCase()} by an administrator.`,time),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'VERIFY_RESOURCE','RESOURCE',?,?,?)").bind(user.id,id,JSON.stringify({status}),time)]);return Response.json({ok:true});
    }
    if(body.action==="adjust_resource"){
      const resourceId=String(body.id),delta=Number(body.delta),note=String(body.note||"").trim().slice(0,250);
      if(!Number.isInteger(delta)||delta===0||note.length<3)return Response.json({error:"Enter a valid quantity change and reason."},{status:400});
      const result=await database.prepare("UPDATE resources SET quantity=quantity+?,updated_at=? WHERE id=? AND quantity+?>=0 AND (owner_id=? OR ?='ADMIN')").bind(delta,time,resourceId,delta,user.id,user.role).run();
      if(!result.meta.changes)return Response.json({error:"Only the resource owner can update it, and stock cannot become negative."},{status:409});
      await database.prepare("INSERT INTO resource_transactions(resource_id,delta,note,actor_id,created_at) VALUES(?,?,?,?,?)").bind(resourceId,delta,note,user.id,time).run();return Response.json({ok:true});
    }
    if(body.action==="delete_resource"){
      const resourceId=String(body.id);const removed=await database.prepare("DELETE FROM resources WHERE id=? AND (owner_id=? OR ?='ADMIN')").bind(resourceId,user.id,user.role).run();
      if(!removed.meta.changes)return Response.json({error:"Only the resource owner can remove this listing."},{status:403});
      await database.prepare("DELETE FROM resource_transactions WHERE resource_id=?").bind(resourceId).run();return Response.json({ok:true});
    }

    if(body.action==="report"){
      await consumeRateLimit(`report:${user.id}`,10,60*60_000);const requestId=String(body.id),reason=String(body.reason||"").trim().slice(0,500);
      if(reason.length<5)return Response.json({error:"Please provide a reason for the report."},{status:400});
      const exists=await database.prepare("SELECT 1 found FROM help_requests WHERE id=?").bind(requestId).first();if(!exists)return Response.json({error:"Request not found."},{status:404});
      await database.prepare("INSERT INTO reports(id,request_id,reporter_id,reason,status,created_at) VALUES(?,?,?,?,'PENDING',?)").bind(makeId("report"),requestId,user.id,reason,time).run();return Response.json({ok:true});
    }
    if(body.action==="review_report"){
      requireRole(user,["ADMIN"]);const status=String(body.status),reportId=String(body.id);if(!["VERIFIED","REMOVED"].includes(status))return Response.json({error:"Invalid review decision."},{status:400});
      const report=await database.prepare("SELECT request_id FROM reports WHERE id=? AND status='PENDING'").bind(reportId).first<{request_id:string}>();if(!report)return Response.json({error:"This report was already reviewed."},{status:409});
      const statements=[database.prepare("UPDATE reports SET status=?,reviewed_at=? WHERE id=? AND status='PENDING'").bind(status,time,reportId),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'REVIEW_REPORT','REPORT',?,?,?)").bind(user.id,reportId,JSON.stringify({status}),time)];
      if(status==="REMOVED")statements.push(database.prepare("UPDATE help_requests SET status='CANCELLED',updated_at=? WHERE id=? AND status NOT IN ('RESOLVED','CANCELLED')").bind(time,report.request_id));
      await database.batch(statements);return Response.json({ok:true});
    }
    if(body.action==="verify_org"){
      requireRole(user,["ADMIN"]);const orgId=String(body.id),verified=body.verified?1:0;await database.batch([database.prepare("UPDATE organizations SET verified=? WHERE id=?").bind(verified,orgId),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'VERIFY_ORGANIZATION','ORGANIZATION',?,?,?)").bind(user.id,orgId,JSON.stringify({verified:!!verified}),time)]);return Response.json({ok:true});
    }
    if(body.action==="create_event"){
      requireRole(user,["ADMIN"]);const name=String(body.name||"").trim(),areas=String(body.areas||"").split(",").map(v=>v.trim()).filter(Boolean);
      if(name.length<3||!areas.length)return Response.json({error:"Enter an event name and at least one affected area."},{status:400});
      const eventId=makeId("event");await database.batch([database.prepare("INSERT INTO disaster_events(id,name,status,affected_areas,starts_at,created_at) VALUES(?,?,'ACTIVE',?,?,?)").bind(eventId,name,JSON.stringify(areas),time,time),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'CREATE_EVENT','EVENT',?,?,?)").bind(user.id,eventId,JSON.stringify({name,areas}),time)]);return Response.json({ok:true});
    }
    if(body.action==="manage_user"){
      requireRole(user,["ADMIN"]);const targetId=String(body.id),operation=String(body.operation);if(targetId===user.id)return Response.json({error:"You cannot change your own administrator access."},{status:400});
      const target=await database.prepare("SELECT id,role,blocked_at FROM users WHERE id=?").bind(targetId).first<{id:string;role:string;blocked_at:string|null}>();if(!target)return Response.json({error:"User not found."},{status:404});
      if(operation==="block"||operation==="unblock")await database.prepare("UPDATE users SET blocked_at=? WHERE id=?").bind(operation==="block"?time:null,targetId).run();
      else if(operation==="set_role"){const role=String(body.role);if(!["RESIDENT","VOLUNTEER","ORGANIZATION","ADMIN"].includes(role))return Response.json({error:"Invalid user role."},{status:400});await database.prepare("UPDATE users SET role=? WHERE id=?").bind(role,targetId).run();}
      else return Response.json({error:"Invalid user-management action."},{status:400});
      await database.batch([database.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(targetId),database.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(targetId),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'MANAGE_USER','USER',?,?,?)").bind(user.id,targetId,JSON.stringify({operation,role:body.role??null}),time)]);return Response.json({ok:true});
    }
    if(body.action==="read_notifications"){await database.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(time,user.id).run();return Response.json({ok:true})}
    return Response.json({error:"Unknown action."},{status:400});
  } catch(error){return actionError(error)}
}
