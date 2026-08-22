"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

type Point={id:string;lat:number;lng:number;label:string;kind?:"request"|"helper"};
export default function LiveHelpMap({points,route=false}:{points:Point[];route?:boolean}){
  const host=useRef<HTMLDivElement>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let disposed=false;let map:{remove:()=>void}|undefined;(async()=>{
    if(!host.current||!points.length)return;try{const L=await loadLeaflet();if(disposed||!host.current)return;setError("");
    const center:[number,number]=[points.reduce((sum,p)=>sum+p.lat,0)/points.length,points.reduce((sum,p)=>sum+p.lng,0)/points.length];
    const instance=L.map(host.current,{zoomControl:true,attributionControl:true}).setView(center,points.length>1?13:14);map=instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(instance);
    const bounds:[number,number][]=[];
    for(const point of points){bounds.push([point.lat,point.lng]);const helper=point.kind==="helper";const icon=L.divIcon({className:"sahaaya-map-icon",html:`<span class="${helper?"helper":"request"}">${helper?"➤":"✚"}</span>`,iconSize:[38,38],iconAnchor:[19,19]});const popup=document.createElement("span");popup.textContent=point.label;L.marker([point.lat,point.lng],{icon,title:point.label,alt:point.label}).addTo(instance).bindPopup(popup)}
    if(route&&points.length>1)L.polyline(points.map(p=>[p.lat,p.lng] as [number,number]),{color:"#176b55",weight:5,dashArray:"10 9"}).addTo(instance);
    if(bounds.length>1)instance.fitBounds(L.latLngBounds(bounds),{padding:[45,45],maxZoom:15});
    }catch{if(!disposed)setError("The live map is temporarily unavailable. Location updates will continue safely.")}
  })();return()=>{disposed=true;map?.remove()}},[points,route]);
  if(error)return <div className="map-empty" role="status">{error}</div>;
  if(!points.length)return <div className="map-empty">Location will appear after permission is granted.</div>;
  return <div className="leaflet-host" ref={host} aria-label="Live help delivery map"/>;
}

async function loadLeaflet():Promise<any>{
  const browser=window as typeof window&{L?:any;__sahaayaLeaflet?:Promise<any>};if(browser.L)return browser.L;if(browser.__sahaayaLeaflet)return browser.__sahaayaLeaflet;
  if(!document.querySelector('link[data-sahaaya-leaflet]')){const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.setAttribute("data-sahaaya-leaflet","");document.head.appendChild(link)}
  browser.__sahaayaLeaflet=new Promise((resolve,reject)=>{const timer=window.setTimeout(()=>reject(new Error("Map library timed out")),8000);const done=(value:any)=>{window.clearTimeout(timer);resolve(value)};const failed=()=>{window.clearTimeout(timer);reject(new Error("Map library could not load"))};const existing=document.querySelector<HTMLScriptElement>('script[data-sahaaya-leaflet]');if(existing){existing.addEventListener("load",()=>done(browser.L),{once:true});existing.addEventListener("error",failed,{once:true});return}const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.crossOrigin="anonymous";script.integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";script.setAttribute("data-sahaaya-leaflet","");script.onload=()=>done(browser.L);script.onerror=failed;document.head.appendChild(script)});return browser.__sahaayaLeaflet;
}
