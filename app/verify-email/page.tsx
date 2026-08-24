"use client";
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useState } from "react";
import "../auth.css";

export default function VerifyEmailPage(){
  const [state,setState]=useState<"working"|"success"|"error">("working"),[message,setMessage]=useState("Verifying your private link…");
  useEffect(()=>{const token=new URLSearchParams(location.search).get("token")??"";(async()=>{try{if(!token)throw new Error("This verification link is incomplete.");const response=await fetch("/api/auth/verify-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})}),data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"Verification failed.");setState("success");setMessage("Your email is verified. You can safely continue to Sahaaya.")}catch(error){setState("error");setMessage(error instanceof Error?error.message:"Verification failed.")}})()},[]);
  return <main className="auth-shell"><section className="auth-story"><a href="/" className="auth-brand"><i className="brand-logo-mark" aria-hidden="true"/><span>SAHAAYA<small>COMMUNITY HELP NETWORK</small></span></a><div><p>TRUSTED ACCOUNT</p><h1>One verified identity. Safer coordination.</h1><span>Email verification reduces impersonation and protects community requests.</span></div><small>Never share password or delivery codes by email.</small></section><section className="auth-panel"><div className="auth-card"><p className="auth-kicker">EMAIL VERIFICATION</p><h2>{state==="working"?"Checking your link":state==="success"?"Verification complete":"Link unavailable"}</h2><p className={state==="error"?"auth-error":"auth-success"} role="status">{message}</p><div className="auth-links"><a href={state==="success"?"/":"/settings/security"}>{state==="success"?"Continue to Sahaaya →":"Open security settings →"}</a></div></div></section></main>
}
