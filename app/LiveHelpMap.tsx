"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

type DisasterDetails={status:string;areas:string;startTime:string;safetyInfo:string;emergencyGuidance:string};
export type MapPoint={id:string;lat:number;lng:number;label:string;kind?:"request"|"helper"|"disaster";details?:DisasterDetails};
type Point=MapPoint;
type DisplayPoint=Point&{memberIds?:string[];count?:number};

function clusterPoints(points:Point[]):DisplayPoint[]{
  const disasters=points.filter(point=>point.kind==="disaster"),operational=points.filter(point=>point.kind!=="disaster");
  if(operational.length<40)return [...operational,...disasters];
  const groups=new Map<string,Point[]>();
  for(const point of operational){const key=`${Math.round(point.lat*50)}:${Math.round(point.lng*50)}`;groups.set(key,[...(groups.get(key)||[]),point])}
  return [...groups.values()].map((group)=>group.length===1?group[0]:({id:`cluster-${group[0].id}`,lat:group.reduce((sum,p)=>sum+p.lat,0)/group.length,lng:group.reduce((sum,p)=>sum+p.lng,0)/group.length,label:`${group.length} nearby help requests`,kind:"request",count:group.length,memberIds:group.map(p=>p.id)})).concat(disasters);
}
export default function LiveHelpMap({points,route=false,onSelect}:{points:Point[];route?:boolean;onSelect?:(id:string)=>void}){
  const host=useRef<HTMLDivElement>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let disposed=false;let map:{remove:()=>void}|undefined;(async()=>{
    if(!host.current||!points.length)return;try{const L=await loadLeaflet();if(disposed||!host.current)return;setError("");
    const center:[number,number]=[points.reduce((sum,p)=>sum+p.lat,0)/points.length,points.reduce((sum,p)=>sum+p.lng,0)/points.length];
    const instance=L.map(host.current,{zoomControl:true,attributionControl:true}).setView(center,points.length>1?13:14);map=instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(instance);
    const bounds:[number,number][]=[];const shown=route?points:clusterPoints(points);
    for(const point of shown){bounds.push([point.lat,point.lng]);const helper=point.kind==="helper",disaster=point.kind==="disaster",cluster=!!point.count;const markerClass=cluster?"cluster":helper?"helper":disaster?"disaster":"request",markerSymbol=cluster?point.count:helper?"➤":disaster?"!":"✚";const icon=L.divIcon({className:"sahaaya-map-icon",html:`<span class="${markerClass}">${markerSymbol}</span>`,iconSize:[38,38],iconAnchor:[19,19]});let popup:HTMLElement;if(disaster&&point.details){popup=document.createElement("div");popup.className="disaster-map-popup";const notice=document.createElement("span");notice.className="disaster-info-only";notice.textContent="INFORMATION ONLY";const title=document.createElement("strong");title.textContent=point.label;const status=document.createElement("small");status.textContent=`Status: ${point.details.status} · Started ${new Date(point.details.startTime).toLocaleString()}`;const areas=document.createElement("p");areas.textContent=`Affected areas: ${point.details.areas}`;const safety=document.createElement("p");safety.textContent=`Safety: ${point.details.safetyInfo}`;const guidance=document.createElement("p");guidance.textContent=`Emergency guidance: ${point.details.emergencyGuidance}`;popup.append(notice,title,status,areas,safety,guidance)}else{popup=document.createElement("span");popup.textContent=cluster?`${point.label} · Click to zoom`:onSelect?`${point.label} · Click the marker to open`:point.label}const marker=L.marker([point.lat,point.lng],{icon,title:cluster?`${point.label}. Zoom in`:disaster?`${point.label}. Information only`:onSelect?`${point.label}. Open request`:point.label,alt:disaster?`${point.label}, disaster information only`:point.label}).addTo(instance).bindPopup(popup,{maxWidth:360});if(cluster)marker.on("click",()=>instance.setView([point.lat,point.lng],Math.min(instance.getZoom()+2,17)));else if(!disaster&&onSelect)marker.on("click",()=>onSelect(point.id))}
    if(route&&points.length>1)L.polyline(points.map(p=>[p.lat,p.lng] as [number,number]),{color:"#176b55",weight:5,dashArray:"10 9"}).addTo(instance);
    if(bounds.length>1)instance.fitBounds(L.latLngBounds(bounds),{padding:[45,45],maxZoom:15});
    }catch{if(!disposed)setError("The live map is temporarily unavailable. Location updates will continue safely.")}
  })();return()=>{disposed=true;map?.remove()}},[points,route,onSelect]);
  if(error)return <div className="map-empty" role="status">{error}</div>;
  if(!points.length)return <div className="map-empty">Location will appear after permission is granted.</div>;
  return <div className="leaflet-host" ref={host} aria-label="Live help and disaster information map"/>;
}

async function loadLeaflet():Promise<any>{
  const browser=window as typeof window&{L?:any;__sahaayaLeaflet?:Promise<any>};if(browser.L)return browser.L;if(browser.__sahaayaLeaflet)return browser.__sahaayaLeaflet;
  if(!document.querySelector('link[data-sahaaya-leaflet]')){const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.setAttribute("data-sahaaya-leaflet","");document.head.appendChild(link)}
  browser.__sahaayaLeaflet=new Promise((resolve,reject)=>{const timer=window.setTimeout(()=>reject(new Error("Map library timed out")),8000);const done=(value:any)=>{window.clearTimeout(timer);resolve(value)};const failed=()=>{window.clearTimeout(timer);reject(new Error("Map library could not load"))};const existing=document.querySelector<HTMLScriptElement>('script[data-sahaaya-leaflet]');if(existing){existing.addEventListener("load",()=>done(browser.L),{once:true});existing.addEventListener("error",failed,{once:true});return}const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.crossOrigin="anonymous";script.integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";script.setAttribute("data-sahaaya-leaflet","");script.onload=()=>done(browser.L);script.onerror=failed;document.head.appendChild(script)});return browser.__sahaayaLeaflet;
}
