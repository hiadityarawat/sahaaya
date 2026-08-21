import { AuthenticationRequiredError, currentUser, db, ensureDatabase, makeId, timestamp } from "../../../lib/site-db";

const allowedStatus=["OPEN","ACCEPTED","VOLUNTEER_ASSIGNED","IN_PROGRESS","RESOLVED","CANCELLED"];
function validCoordinate(value:number,min:number,max:number){return Number.isFinite(value)&&value>=min&&value<=max}
function etaMinutes(fromLat:number,fromLng:number,toLat:number,toLng:number){const rad=(v:number)=>v*Math.PI/180;const dLat=rad(toLat-fromLat),dLng=rad(toLng-fromLng);const a=Math.sin(dLat/2)**2+Math.cos(rad(fromLat))*Math.cos(rad(toLat))*Math.sin(dLng/2)**2;const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return Math.max(2,Math.ceil(km/22*60+3))}
export async function POST(request:Request) {
  try {
    await ensureDatabase(); const user=await currentUser(); const body=await request.json() as Record<string,unknown>; const database=db(); const time=timestamp();
    if(body.action==="create_request"){
      const category=String(body.category); const area=String(body.publicArea).trim(); const people=Number(body.peopleCount); const description=String(body.description).trim(); const urgency=String(body.urgency);
      if(!["FOOD","WATER","MEDICAL","SHELTER","RESCUE","CLOTHES","TRANSPORT","OTHER"].includes(category)||area.length<2||!Number.isInteger(people)||people<1||people>1000||description.length<10||!["NORMAL","URGENT","CRITICAL"].includes(urgency)) return Response.json({error:"Please complete every required field."},{status:400});
      const latitude=Number(body.latitude),longitude=Number(body.longitude);if(!validCoordinate(latitude,-90,90)||!validCoordinate(longitude,-180,180))return Response.json({error:"Allow location access so helpers can find and reach you safely."},{status:400});
      const id=`REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`; await database.batch([
        database.prepare("INSERT INTO help_requests(id,requester_id,event_id,category,public_area,people_count,description,urgency,contact_method,status,approx_lat,approx_lng,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'OPEN',?,?,?,?)").bind(id,user.id,String(body.eventId||"event-flood"),category,area,people,description,urgency,String(body.contactMethod||"IN_APP"),latitude,longitude,time,time),
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'OPEN','Request created with privacy-safe location.',?)").bind(id,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Request created',?,'REQUEST_CREATED',?)").bind(makeId("note"),user.id,`${id} is now being matched with responders.`,time),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'CREATE','REQUEST',?,'{}',?)").bind(user.id,id,time),
      ]); return Response.json({ok:true,id});
    }
    if(body.action==="offer_help"){
      const requestId=String(body.id),message=String(body.message||"").trim();
      if(message.length<5||message.length>500)return Response.json({error:"Briefly describe the help you can provide."},{status:400});
      const helpRequest=await database.prepare("SELECT requester_id,status FROM help_requests WHERE id=?").bind(requestId).first<{requester_id:string;status:string}>();
      if(!helpRequest)return Response.json({error:"This request no longer exists."},{status:404});
      if(helpRequest.requester_id===user.id)return Response.json({error:"You cannot offer help on your own request."},{status:400});
      if(!["OPEN","ACCEPTED"].includes(helpRequest.status))return Response.json({error:"This request is no longer accepting offers."},{status:409});
      const offerId=makeId("offer");
      try{await database.batch([
        database.prepare("INSERT INTO help_offers(id,request_id,helper_id,message,status,created_at,updated_at) VALUES(?,?,?,?,'PENDING',?,?)").bind(offerId,requestId,user.id,message,time,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'New help offer',?,'HELP_OFFER',?)").bind(makeId("note"),helpRequest.requester_id,`${user.name} offered support for ${requestId}.`,time),
      ]);}catch{return Response.json({error:"You have already offered help for this request."},{status:409})}
      return Response.json({ok:true,id:offerId});
    }
    if(body.action==="accept_offer"){
      const offerId=String(body.offerId);
      const offer=await database.prepare("SELECT ho.id,ho.request_id,ho.helper_id,hr.requester_id,hr.status FROM help_offers ho JOIN help_requests hr ON hr.id=ho.request_id WHERE ho.id=?").bind(offerId).first<{id:string;request_id:string;helper_id:string;requester_id:string;status:string}>();
      if(!offer)return Response.json({error:"This offer is no longer available."},{status:404});
      if(offer.requester_id!==user.id)return Response.json({error:"Only the person who requested help can accept an offer."},{status:403});
      if(!["OPEN","ACCEPTED"].includes(offer.status))return Response.json({error:"This request is already being handled."},{status:409});
      await database.batch([
        database.prepare("UPDATE help_offers SET status=CASE WHEN id=? THEN 'ACCEPTED' ELSE 'DECLINED' END,updated_at=? WHERE request_id=? AND status='PENDING'").bind(offerId,time,offer.request_id),
        database.prepare("UPDATE help_requests SET accepted_by=?,status='ACCEPTED',updated_at=? WHERE id=?").bind(offer.helper_id,time,offer.request_id),
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'ACCEPTED','A community helper offer was accepted. Private contact is now shared between both people.',?)").bind(offer.request_id,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Your help offer was accepted',?,'OFFER_ACCEPTED',?)").bind(makeId("note"),offer.helper_id,`${offer.request_id}: contact details are now available.`,time),
      ]);
      return Response.json({ok:true});
    }
    if(body.action==="update_delivery_location"){
      const requestId=String(body.id),latitude=Number(body.latitude),longitude=Number(body.longitude);
      if(!validCoordinate(latitude,-90,90)||!validCoordinate(longitude,-180,180))return Response.json({error:"A valid live location is required."},{status:400});
      const target=await database.prepare("SELECT approx_lat,approx_lng,accepted_by,status FROM help_requests WHERE id=?").bind(requestId).first<{approx_lat:number|null;approx_lng:number|null;accepted_by:string|null;status:string}>();
      if(!target)return Response.json({error:"Request not found."},{status:404});if(target.accepted_by!==user.id)return Response.json({error:"Only the accepted helper can share delivery progress."},{status:403});
      const eta=target.approx_lat!=null&&target.approx_lng!=null?etaMinutes(latitude,longitude,target.approx_lat,target.approx_lng):null;
      await database.prepare("UPDATE help_requests SET helper_lat=?,helper_lng=?,eta_minutes=?,delivery_started_at=COALESCE(delivery_started_at,?),delivery_updated_at=?,status=CASE WHEN status='ACCEPTED' THEN 'IN_PROGRESS' ELSE status END,updated_at=? WHERE id=?").bind(latitude,longitude,eta,time,time,time,requestId).run();
      return Response.json({ok:true,eta});
    }
    if(body.action==="accept_request"){
      const id=String(body.id); const result=await database.prepare("UPDATE help_requests SET status='ACCEPTED',accepted_by=?,updated_at=? WHERE id=? AND status='OPEN'").bind(user.id,time,id).run(); if(!result.meta.changes) return Response.json({error:"This request has already been claimed."},{status:409});
      await database.batch([database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'ACCEPTED','Request accepted by a verified responder.',?)").bind(id,user.id,time),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ACCEPT','REQUEST',?,'{}',?)").bind(user.id,id,time)]); return Response.json({ok:true});
    }
    if(body.action==="assign_volunteer"){
      const id=String(body.id),volunteerId=String(body.volunteerId); const result=await database.prepare("UPDATE help_requests SET assigned_volunteer_id=?,status='VOLUNTEER_ASSIGNED',updated_at=? WHERE id=? AND assigned_volunteer_id IS NULL AND status IN ('ACCEPTED','OPEN')").bind(volunteerId,time,id).run(); if(!result.meta.changes)return Response.json({error:"A volunteer is already assigned."},{status:409}); await database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'VOLUNTEER_ASSIGNED','Volunteer assigned and notified.',?)").bind(id,user.id,time).run(); return Response.json({ok:true});
    }
    if(body.action==="update_status"){
      const id=String(body.id),status=String(body.status),note=String(body.note||`Status changed to ${status}.`).slice(0,500); if(!allowedStatus.includes(status))return Response.json({error:"Invalid status."},{status:400}); const result=await database.prepare("UPDATE help_requests SET status=?,updated_at=? WHERE id=? AND (requester_id=? OR accepted_by=? OR ?='ADMIN')").bind(status,time,id,user.id,user.id,user.role).run();if(!result.meta.changes)return Response.json({error:"Only the requester or accepted helper can update this request."},{status:403});await database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,?,?,?)").bind(id,user.id,status,note,time).run(); return Response.json({ok:true});
    }
    if(body.action==="availability"){await database.prepare("UPDATE volunteers SET available=?,updated_at=? WHERE user_id=?").bind(body.available?1:0,time,String(body.volunteerId)).run();return Response.json({ok:true});}
    if(body.action==="adjust_resource"){
      const resourceId=String(body.id),delta=Number(body.delta),note=String(body.note||"Inventory adjustment").slice(0,250); if(!Number.isInteger(delta)||delta===0)return Response.json({error:"Enter a valid quantity change."},{status:400}); const result=await database.prepare("UPDATE resources SET quantity=quantity+?,updated_at=? WHERE id=? AND quantity+?>=0").bind(delta,time,resourceId,delta).run(); if(!result.meta.changes)return Response.json({error:"Stock cannot become negative."},{status:409});await database.prepare("INSERT INTO resource_transactions(resource_id,delta,note,actor_id,created_at) VALUES(?,?,?,?,?)").bind(resourceId,delta,note,user.id,time).run();return Response.json({ok:true});
    }
    if(body.action==="report"){await database.prepare("INSERT INTO reports(id,request_id,reporter_id,reason,status,created_at) VALUES(?,?,?,?,'PENDING',?)").bind(makeId("report"),String(body.id),user.id,String(body.reason).slice(0,500),time).run();return Response.json({ok:true});}
    if(body.action==="review_report"){await database.prepare("UPDATE reports SET status=?,reviewed_at=? WHERE id=?").bind(String(body.status),time,String(body.id)).run();return Response.json({ok:true});}
    if(body.action==="verify_org"){await database.prepare("UPDATE organizations SET verified=? WHERE id=?").bind(body.verified?1:0,String(body.id)).run();return Response.json({ok:true});}
    if(body.action==="create_event"){const name=String(body.name||"").trim(),areas=String(body.areas||"").split(",").map(v=>v.trim()).filter(Boolean);if(name.length<3||!areas.length)return Response.json({error:"Enter an event name and at least one affected area."},{status:400});await database.prepare("INSERT INTO disaster_events(id,name,status,affected_areas,starts_at,created_at) VALUES(?,?,'ACTIVE',?,?,?)").bind(makeId("event"),name,JSON.stringify(areas),time,time).run();return Response.json({ok:true});}
    if(body.action==="add_resource"){const name=String(body.name||"").trim(),quantity=Number(body.quantity),category=String(body.category||"OTHER"),unit=String(body.unit||"items").trim();if(name.length<2||!Number.isInteger(quantity)||quantity<0)return Response.json({error:"Enter a valid resource and non-negative quantity."},{status:400});await database.prepare("INSERT INTO resources(id,organization_id,event_id,category,name,quantity,unit,updated_at) VALUES(?,'org-hope','event-flood',?,?,?,?,?)").bind(makeId("resource"),category,name,quantity,unit,time).run();return Response.json({ok:true});}
    if(body.action==="read_notifications"){await database.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(time,user.id).run();return Response.json({ok:true});}
    return Response.json({error:"Unknown action."},{status:400});
  } catch(error){if(error instanceof AuthenticationRequiredError)return Response.json({error:"Sign in to continue."},{status:401});console.error(error);return Response.json({error:"The operation could not be completed safely."},{status:500})}
}
