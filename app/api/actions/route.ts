import { currentUser, db, ensureDatabase, makeId, timestamp } from "../../../lib/site-db";

const allowedStatus=["OPEN","ACCEPTED","VOLUNTEER_ASSIGNED","IN_PROGRESS","RESOLVED","CANCELLED"];
export async function POST(request:Request) {
  await ensureDatabase(); const user=await currentUser(); const body=await request.json() as Record<string,unknown>; const database=db(); const time=timestamp();
  try {
    if(body.action==="create_request"){
      const category=String(body.category); const area=String(body.publicArea).trim(); const people=Number(body.peopleCount); const description=String(body.description).trim(); const urgency=String(body.urgency);
      if(!["FOOD","WATER","MEDICAL","SHELTER","RESCUE","CLOTHES","TRANSPORT","OTHER"].includes(category)||area.length<2||!Number.isInteger(people)||people<1||people>1000||description.length<10||!["NORMAL","URGENT","CRITICAL"].includes(urgency)) return Response.json({error:"Please complete every required field."},{status:400});
      const id=`REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`; await database.batch([
        database.prepare("INSERT INTO help_requests(id,requester_id,event_id,category,public_area,people_count,description,urgency,contact_method,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'OPEN',?,?)").bind(id,user.id,String(body.eventId||"event-flood"),category,area,people,description,urgency,String(body.contactMethod||"IN_APP"),time,time),
        database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'OPEN','Request created with privacy-safe location.',?)").bind(id,user.id,time),
        database.prepare("INSERT INTO notifications(id,user_id,title,body,type,created_at) VALUES(?,?, 'Request created',?,'REQUEST_CREATED',?)").bind(makeId("note"),user.id,`${id} is now being matched with responders.`,time),
        database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'CREATE','REQUEST',?,'{}',?)").bind(user.id,id,time),
      ]); return Response.json({ok:true,id});
    }
    if(body.action==="accept_request"){
      const id=String(body.id); const result=await database.prepare("UPDATE help_requests SET status='ACCEPTED',accepted_by=?,updated_at=? WHERE id=? AND status='OPEN'").bind(user.id,time,id).run(); if(!result.meta.changes) return Response.json({error:"This request has already been claimed."},{status:409});
      await database.batch([database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'ACCEPTED','Request accepted by a verified responder.',?)").bind(id,user.id,time),database.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,'ACCEPT','REQUEST',?,'{}',?)").bind(user.id,id,time)]); return Response.json({ok:true});
    }
    if(body.action==="assign_volunteer"){
      const id=String(body.id),volunteerId=String(body.volunteerId); const result=await database.prepare("UPDATE help_requests SET assigned_volunteer_id=?,status='VOLUNTEER_ASSIGNED',updated_at=? WHERE id=? AND assigned_volunteer_id IS NULL AND status IN ('ACCEPTED','OPEN')").bind(volunteerId,time,id).run(); if(!result.meta.changes)return Response.json({error:"A volunteer is already assigned."},{status:409}); await database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,'VOLUNTEER_ASSIGNED','Volunteer assigned and notified.',?)").bind(id,user.id,time).run(); return Response.json({ok:true});
    }
    if(body.action==="update_status"){
      const id=String(body.id),status=String(body.status),note=String(body.note||`Status changed to ${status}.`).slice(0,500); if(!allowedStatus.includes(status))return Response.json({error:"Invalid status."},{status:400}); await database.batch([database.prepare("UPDATE help_requests SET status=?,updated_at=? WHERE id=?").bind(status,time,id),database.prepare("INSERT INTO request_updates(request_id,author_id,status,body,created_at) VALUES(?,?,?,?,?)").bind(id,user.id,status,note,time)]); return Response.json({ok:true});
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
    if(body.action==="read_notifications"){await database.prepare("UPDATE notifications SET read_at=? WHERE user_id IN (?, 'local-owner') AND read_at IS NULL").bind(time,user.id).run();return Response.json({ok:true});}
    return Response.json({error:"Unknown action."},{status:400});
  } catch(error){console.error(error);return Response.json({error:"The operation could not be completed safely."},{status:500})}
}
