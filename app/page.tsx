"use client";

import { useState } from "react";

const requests = [
  { id: "REQ-2026-10452", need: "Medical", area: "Whitefield", people: 3, age: "4 min", urgency: "Critical", tone: "critical" },
  { id: "REQ-2026-10447", need: "Drinking water", area: "Bellandur", people: 12, age: "11 min", urgency: "Urgent", tone: "urgent" },
  { id: "REQ-2026-10438", need: "Rescue", area: "Marathahalli", people: 5, age: "18 min", urgency: "Critical", tone: "critical" },
];

export default function Home() {
  const [notice, setNotice] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [role, setRole] = useState("Organization");
  const [submitted, setSubmitted] = useState(false);
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Sahaaya home"><span className="brand-mark">✦</span><span>SAHAAYA</span><small>Response Network</small></a>
        <div className="event-pill"><i /> Bengaluru Flood Response <strong>ACTIVE</strong></div>
        <nav aria-label="Primary navigation"><a className="active" href="#overview">Overview</a><a href="#requests">Requests</a><a href="#resources">Resources</a><a href="#map">Live map</a></nav>
        <button className="icon-button" aria-label="Notifications" onClick={() => setShowNotifications(!showNotifications)}>●<span>3</span></button>
        <label className="role-switch"><span>Workspace</span><select value={role} onChange={(event) => {setRole(event.target.value);setNotice(`${event.target.value} workspace loaded.`)}} aria-label="Switch role workspace"><option>Resident</option><option>Volunteer</option><option>Organization</option><option>Admin</option></select></label>
        <button className="profile" aria-label="Open profile"><b>AK</b><span>Arjun K.<small>{role}</small></span></button>
      </header>
      {showNotifications && <aside className="notifications" aria-label="Notifications"><div><b>Notifications</b><button onClick={() => setShowNotifications(false)}>×</button></div><article><i className="good-dot">✓</i><p><b>Volunteer assigned</b><small>Meera S. is heading to Whitefield.</small></p></article><article><i>↗</i><p><b>Status updated</b><small>REQ-2026-10447 is now in progress.</small></p></article><article><i>!</i><p><b>Critical request nearby</b><small>Medical support requested 2.4 km away.</small></p></article><button className="notification-action">Mark all as read</button></aside>}

      <section className="hero" id="top">
        <div><p className="eyebrow">LIVE RESPONSE OVERVIEW · UPDATED JUST NOW</p><h1>Every request. <em>One coordinated response.</em></h1><p className="intro">A shared command center for residents, volunteers, and relief organizations responding across Bengaluru.</p></div>
        <div className="hero-actions"><button className="secondary" onClick={() => setNotice("Live response report prepared.")}>↗ Export situation report</button><button className="primary" onClick={() => {setSubmitted(false);setShowRequest(true)}}>＋ Request help</button></div>
      </section>
      {notice && <div className="toast" role="status">✓ {notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}

      <section className="metrics" id="overview" aria-label="Response statistics">
        <article><div className="metric-icon red">!</div><p>Active requests</p><strong>156</strong><small><b>↑ 12</b> in the last hour</small></article>
        <article><div className="metric-icon orange">◆</div><p>Critical requests</p><strong>21</strong><small>8 awaiting assignment</small></article>
        <article><div className="metric-icon green">✓</div><p>Requests resolved</p><strong>489</strong><small><b className="good">78%</b> resolution rate</small></article>
        <article><div className="metric-icon blue">●</div><p>Active volunteers</p><strong>203</strong><small>17 joined today</small></article>
        <article><div className="metric-icon violet">⬡</div><p>Organizations</p><strong>18</strong><small>All verified partners</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel response-map" id="map">
          <div className="panel-heading"><div><p className="eyebrow">OPERATIONAL VIEW</p><h2>Live response map</h2></div><div className="segmented"><button className="selected">Requests</button><button>Resources</button><button>Volunteers</button></div></div>
          <div className="map-canvas" aria-label="Approximate request map">
            <div className="map-label north">WHITEFIELD</div><div className="map-label center">BELLANDUR</div><div className="map-label west">MARATHAHALLI</div>
            <span className="road r1"/><span className="road r2"/><span className="road r3"/>
            <button className="pin critical p1" aria-label="Critical request in Whitefield">3</button><button className="pin urgent p2" aria-label="Urgent request in Bellandur">7</button><button className="pin normal p3" aria-label="Normal request in Marathahalli">12</button>
            <div className="map-card"><span className="tag critical">CRITICAL</span><strong>REQ-2026-10452</strong><p>Medical help · 3 people</p><small>Whitefield · 4 min ago</small></div>
            <div className="map-legend"><span><i className="dot critical"/> Critical</span><span><i className="dot urgent"/> Urgent</span><span><i className="dot normal"/> Normal</span></div>
          </div>
        </article>

        <article className="panel queue" id="requests">
          <div className="panel-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>Priority queue</h2></div><button className="text-button">View all 23 →</button></div>
          <div className="queue-list">{requests.map((request) => <button className="request-row" key={request.id} onClick={() => setNotice(`${request.id} selected safely.`)}><span className={`priority-bar ${request.tone}`} /><span className="request-main"><span><b>{request.need}</b><i className={`tag ${request.tone}`}>{request.urgency}</i></span><small>{request.id} · {request.area}</small></span><span className="request-meta"><b>{request.people}</b><small>people</small></span><span className="request-time">{request.age}<small>ago</small></span><span className="arrow">›</span></button>)}</div>
          <div className="privacy-note"><b>⌾ Privacy protected</b><span>Map locations are intentionally approximate. Contact details are shared only after verified assignment.</span></div>
        </article>
      </section>

      <section className="lower-grid" id="resources">
        <article className="panel resources"><div className="panel-heading"><div><p className="eyebrow">SUPPLY READINESS</p><h2>Available resources</h2></div><button className="text-button">Manage inventory →</button></div><div className="resource-list">{[['Meals','2,450','68%','food'],['Water bottles','4,820','81%','water'],['First aid kits','126','42%','medical'],['Shelter spaces','84','56%','shelter']].map(([name,count,width,type]) => <div className="resource" key={name}><span className={`resource-symbol ${type}`}>{type === 'water' ? '◒' : type === 'medical' ? '+' : type === 'shelter' ? '⌂' : '◉'}</span><div><p><b>{name}</b><strong>{count}</strong></p><span className="progress"><i style={{width}} /></span><small>{width} ready across partner locations</small></div></div>)}</div></article>
        <article className="panel activity"><div className="panel-heading"><div><p className="eyebrow">COORDINATION LOG</p><h2>Live activity</h2></div><button className="text-button">All activity →</button></div><div className="timeline"><div><i className="good-dot">✓</i><p><b>Hope Foundation</b> accepted <strong>REQ-2026-10447</strong><small>2 minutes ago</small></p></div><div><i>↗</i><p><b>Meera S.</b> was assigned to a rescue request<small>6 minutes ago</small></p></div><div><i className="good-dot">✓</i><p><strong>REQ-2026-10419</strong> was marked resolved<small>9 minutes ago</small></p></div><div><i>＋</i><p><b>120 water bottles</b> added at Bellandur hub<small>14 minutes ago</small></p></div></div></article>
      </section>
      <footer><span><b>SAHAAYA</b> · Privacy-first emergency coordination</span><span>System operational <i className="status-dot"/> · Last sync just now</span></footer>
      {showRequest && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowRequest(false)}><section className="request-modal" role="dialog" aria-modal="true" aria-labelledby="request-title" onMouseDown={(event) => event.stopPropagation()}>{submitted ? <div className="success-state"><span>✓</span><p className="eyebrow">REQUEST CREATED SAFELY</p><h2 id="request-title">Help is being coordinated.</h2><p>Your reference is <b>REQ-2026-10461</b>. Only your approximate area is visible publicly.</p><div className="status-track"><i className="done"/><i/><i/><i/><i/></div><small>OPEN · Potential matches are being notified now</small><button className="primary" onClick={() => {setShowRequest(false);setNotice("REQ-2026-10461 added to your dashboard.")}}>View my request</button></div> : <><div className="modal-heading"><div><p className="eyebrow">EMERGENCY ASSISTANCE</p><h2 id="request-title">Tell us what you need</h2><p>Share only what responders need. Your exact contact details stay protected.</p></div><button aria-label="Close" onClick={() => setShowRequest(false)}>×</button></div><form onSubmit={(event) => {event.preventDefault();setSubmitted(true)}}><label>Help category<select required defaultValue=""><option value="" disabled>Select a category</option><option>Food</option><option>Drinking water</option><option>Medical help</option><option>Shelter</option><option>Rescue</option><option>Transport</option></select></label><label>General area<input required placeholder="e.g. Whitefield" /></label><label>People needing help<input required type="number" min="1" max="1000" placeholder="1" /></label><fieldset><legend>Urgency</legend><label><input type="radio" name="urgency" defaultChecked /> Normal</label><label><input type="radio" name="urgency" /> Urgent</label><label><input type="radio" name="urgency" /> Critical</label></fieldset><label className="wide">Short description<textarea required maxLength={500} placeholder="Describe the immediate need and any safety concerns…" /></label><label>Preferred contact<select><option>In-app message</option><option>Phone call after assignment</option><option>SMS after assignment</option></select></label><label>Optional image<input type="file" accept="image/png,image/jpeg,image/webp" /></label><div className="form-privacy wide">⌾ Your exact location and contact information are never shown on the public map.</div><div className="form-actions wide"><button type="button" className="secondary" onClick={() => setShowRequest(false)}>Cancel</button><button type="submit" className="primary">Create secure request →</button></div></form></> }</section></div>}
    </main>
  );
}
