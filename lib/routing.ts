import { env } from "cloudflare:workers";

type RoutingRuntime=typeof env&{SAHAAYA_ROUTING_API_URL?:string};
export const routingConfigured=()=>Boolean((env as RoutingRuntime).SAHAAYA_ROUTING_API_URL?.trim());

function fallback(fromLat:number,fromLng:number,toLat:number,toLng:number){const rad=(v:number)=>v*Math.PI/180,dLat=rad(toLat-fromLat),dLng=rad(toLng-fromLng),a=Math.sin(dLat/2)**2+Math.cos(rad(fromLat))*Math.cos(rad(toLat))*Math.sin(dLng/2)**2,km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return Math.max(2,Math.ceil(km/22*60+3))}

export async function estimateArrival(fromLat:number,fromLng:number,toLat:number,toLng:number){
  const configured=(env as RoutingRuntime).SAHAAYA_ROUTING_API_URL?.trim();
  if(configured){
    try{
      const base=new URL(configured);if(base.protocol!=="https:")throw new Error("Routing endpoint must use HTTPS");
      const route=new URL(`route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}`,base.href.endsWith("/")?base: `${base.href}/`);route.searchParams.set("overview","false");route.searchParams.set("steps","false");
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500),response=await fetch(route,{headers:{Accept:"application/json"},signal:controller.signal});clearTimeout(timer);if(!response.ok)throw new Error(`Routing provider returned ${response.status}`);const data=await response.json() as {routes?:Array<{duration?:number}>},seconds=data.routes?.[0]?.duration;if(typeof seconds!=="number"||!Number.isFinite(seconds)||seconds<=0)throw new Error("Routing provider returned no duration");return {minutes:Math.max(1,Math.ceil(seconds/60)),source:"ROUTE" as const};
    }catch(error){console.error("Sahaaya route estimate fallback",error)}
  }
  return {minutes:fallback(fromLat,fromLng,toLat,toLng),source:"STRAIGHT_LINE" as const};
}
