import { env } from "cloudflare:workers";
import { AuthenticationRequiredError, AuthorizationError, RateLimitError, consumeRateLimit, currentUser, db, ensureDatabase, timestamp } from "../../../lib/site-db";
import { sameOrigin } from "../../../lib/user-auth";

const types=new Set(["image/jpeg","image/png","image/webp"]);
function validSignature(bytes:Uint8Array,type:string){
  if(type==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==="image/png")return bytes.slice(0,8).every((value,index)=>value===[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  if(type==="image/webp")return new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
  return false;
}

export async function POST(request:Request){
  try{
    if(!sameOrigin(request))return Response.json({error:"Cross-site requests are not allowed."},{status:403});
    await ensureDatabase();const user=await currentUser();await consumeRateLimit(`upload:${user.id}`,10,60*60_000);
    const form=await request.formData();const file=form.get("file");const requestId=String(form.get("requestId")||"");
    if(!(file instanceof File)||!requestId)return Response.json({error:"File and request are required."},{status:400});
    if(!types.has(file.type)||file.size<=0||file.size>5*1024*1024)return Response.json({error:"Use a JPG, PNG, or WebP image smaller than 5 MB."},{status:400});
    const database=db();const owned=await database.prepare("SELECT image_key,status FROM help_requests WHERE id=? AND requester_id=?").bind(requestId,user.id).first<{image_key:string|null;status:string}>();
    if(!owned)throw new AuthorizationError("You can upload an image only to your own request.");
    if(!["OPEN","ACCEPTED","IN_PROGRESS"].includes(owned.status))return Response.json({error:"Images cannot be changed after a request is closed."},{status:409});
    const buffer=await file.arrayBuffer();if(!validSignature(new Uint8Array(buffer).slice(0,16),file.type))return Response.json({error:"The file contents do not match the selected image type."},{status:400});
    const key=`requests/${requestId}/${crypto.randomUUID()}`;
    await env.UPLOADS.put(key,buffer,{httpMetadata:{contentType:file.type},customMetadata:{owner:user.id,requestId}});
    try{
      const updated=await database.prepare("UPDATE help_requests SET image_key=?,updated_at=? WHERE id=? AND requester_id=? AND status IN ('OPEN','ACCEPTED','IN_PROGRESS')").bind(key,timestamp(),requestId,user.id).run();
      if(!updated.meta.changes)throw new Error("Request changed during upload");
      await database.prepare("INSERT INTO uploaded_files(key,request_id,owner_id,content_type,size_bytes,created_at) VALUES(?,?,?,?,?,?)").bind(key,requestId,user.id,file.type,file.size,timestamp()).run();
      if(owned.image_key){await env.UPLOADS.delete(owned.image_key);await database.prepare("DELETE FROM uploaded_files WHERE key=?").bind(owned.image_key).run()}
    }catch(error){await env.UPLOADS.delete(key);throw error}
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof AuthenticationRequiredError)return Response.json({error:"Sign in to continue."},{status:401});
    if(error instanceof AuthorizationError)return Response.json({error:error.message},{status:403});
    if(error instanceof RateLimitError)return Response.json({error:error.message},{status:429});
    const errorId=crypto.randomUUID();console.error("Sahaaya upload failure",errorId,error);return Response.json({error:"The image could not be stored safely.",errorId},{status:500});
  }
}
