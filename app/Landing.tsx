import "./landing.css";
import Link from "next/link";

const needs=[
  ["✚","Medical help","Medicines, first aid, transport, or urgent care"],
  ["◒","Food & water","Meals, drinking water, and essential supplies"],
  ["⌂","Shelter & rescue","Safe shelter, evacuation, and rescue support"],
  ["◇","Other essentials","Clothing, transport, charging, or local assistance"],
];

export default function Landing(){return <main className="public-home">
  <nav className="public-nav"><Link className="public-brand" href="/"><span>✦</span><b>SAHAAYA<small>Community Help Network</small></b></Link><a className="nav-signin" href="/signin-with-chatgpt?return_to=/">Sign in</a></nav>
  <section className="public-hero"><div className="hero-copy"><p className="overline">HELP THAT REACHES YOU</p><h1>Ask for help.<br/><em>Be someone&apos;s hope.</em></h1><p className="hero-lede">A trusted community where people can request urgent support and nearby helpers can respond with food, medicine, shelter, transport, or other essentials.</p><div className="hero-actions"><a className="hero-primary" href="/signin-with-chatgpt?return_to=/">Sign in to request help →</a><a className="hero-secondary" href="/signin-with-chatgpt?return_to=/">I want to help</a></div><p className="signin-note">Use your ChatGPT account securely from any phone, tablet, or computer.</p></div><div className="hero-card"><div className="pulse-ring"><span>✦</span></div><b>Community response is active</b><p>Post a need in minutes. Other signed-in users can offer support, and contact details stay private until you accept an offer.</p><div className="trust-row"><span><b>Private</b><small>Protected contact details</small></span><span><b>Shared</b><small>One live request network</small></span></div></div></section>
  <section className="how-section"><p className="overline">HOW SAHAAYA WORKS</p><h2>One simple path from need to support</h2><div className="steps"><article><i>01</i><b>Sign in securely</b><p>Your identity follows you safely across devices.</p></article><article><i>02</i><b>Post what you need</b><p>Choose a category, urgency, and approximate area.</p></article><article><i>03</i><b>Receive offers</b><p>Community helpers can offer exactly what they have.</p></article><article><i>04</i><b>Connect safely</b><p>Contact details unlock only after you accept an offer.</p></article></div></section>
  <section className="needs-section"><div><p className="overline">SUPPORT CATEGORIES</p><h2>Help for the moments that matter</h2></div><div className="need-grid">{needs.map(([icon,title,text])=><article key={title}><i>{icon}</i><div><b>{title}</b><p>{text}</p></div></article>)}</div></section>
  <section className="safety-banner"><div><span>⌾</span><div><b>Designed for dignity and safety</b><p>Public requests show only an approximate area. Personal contact information is shared only between the requester and their accepted helper.</p></div></div><a href="/signin-with-chatgpt?return_to=/">Join the network →</a></section>
  <footer><Link className="public-brand" href="/"><span>✦</span><b>SAHAAYA<small>Community Help Network</small></b></Link><p>In a life-threatening emergency, contact your local emergency services first.</p></footer>
  </main>}
