import { db } from "../../../lib/site-db";
import { env } from "cloudflare:workers";
import { emailDeliveryConfigured } from "../../../lib/email-delivery";
import { routingConfigured } from "../../../lib/routing";

export const dynamic="force-dynamic";

export async function GET() {
  const started=Date.now();
  try{
    const result=await db().prepare("SELECT 1 healthy").first<{healthy:number}>();
    if(result?.healthy!==1)throw new Error("Database readiness check failed");
    return Response.json({status:"ok",database:"ready",objectStorage:env.UPLOADS?"bound":"unavailable",emailDelivery:emailDeliveryConfigured()?"configured":"not_configured",routeEstimates:routingConfigured()?"configured":"fallback",latencyMs:Date.now()-started,time:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const errorId=crypto.randomUUID();console.error("Sahaaya health failure",errorId,error);
    return Response.json({status:"degraded",database:"unavailable",errorId,time:new Date().toISOString()},{status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
  }
}
