/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */
"use client";

import { type CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import LiveHelpMap from "./LiveHelpMap";

type Row = Record<string, any>;
type AccessibilityPreferences = {
  simple: boolean;
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  browserAlerts: boolean;
};
type State = {
  user: Row;
  adminAccess: { configured: boolean; authenticated: boolean };
  requests: Row[];
  mapRequests: Row[];
  myRequests: Row[];
  history: Row[];
  offers: Row[];
  events: Row[];
  volunteers: Row[];
  organizations: Row[];
  resources: Row[];
  notifications: Row[];
  reports: Row[];
  users: Row[];
  activity: Row[];
  auditLogs: Row[];
  metrics: Row;
};
const empty: State = {
  user: {},
  adminAccess: { configured: false, authenticated: false },
  requests: [],
  mapRequests: [],
  myRequests: [],
  history: [],
  offers: [],
  events: [],
  volunteers: [],
  organizations: [],
  resources: [],
  notifications: [],
  reports: [],
  users: [],
  activity: [],
  auditLogs: [],
  metrics: {},
};
const defaultAccessibility: AccessibilityPreferences = {
  simple: false,
  largeText: false,
  highContrast: false,
  reduceMotion: false,
  browserAlerts: false,
};
const categories = [
  "ALL",
  "FOOD",
  "WATER",
  "MEDICAL",
  "SHELTER",
  "RESCUE",
  "CLOTHES",
  "TRANSPORT",
  "OTHER",
];
const statuses = [
  "OPEN",
  "ACCEPTED",
  "VOLUNTEER_ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
];

function human(value: string) {
  return value
    ?.replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function ago(value: string) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes}m ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ago`
      : `${Math.floor(minutes / 1440)}d ago`;
}
function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function fetchStateWithRetry(url: string) {
  let lastError: unknown;
  for (const wait of [0, 350, 1000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`Temporary response ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("State request failed");
}

export default function Platform() {
  const [data, setData] = useState<State>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showIntro, setShowIntro] = useState(true);
  const [deliverySuccess, setDeliverySuccess] = useState(false);
  const [view, setView] = useState("overview");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Row | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const seenNotifications = useRef<Set<string>>(new Set());
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(
    () => {
      if (typeof window === "undefined") return defaultAccessibility;
      try {
        return {
          ...defaultAccessibility,
          ...JSON.parse(localStorage.getItem("sahaaya_accessibility") || "{}"),
        };
      } catch {
        return defaultAccessibility;
      }
    },
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => setShowIntro(false),
      accessibility.reduceMotion ? 300 : 6000,
    );
    return () => window.clearTimeout(timer);
  }, [accessibility.reduceMotion]);
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({ q, category, status, scope: view });
        const response = await fetchStateWithRetry(`/api/state?${params}`);
        if (!response.ok) throw new Error();
        setData(await response.json());
        setError("");
      } catch {
        if (!silent)
          setError(
            navigator.onLine
              ? "Coordination data is temporarily unavailable. Please retry."
              : "You are offline. Sahaaya will reconnect automatically.",
          );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [q, category, status, view],
  );
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("simple-mode", accessibility.simple);
    root.classList.toggle("large-text", accessibility.largeText);
    root.classList.toggle("high-contrast", accessibility.highContrast);
    root.classList.toggle("reduce-motion", accessibility.reduceMotion);
    localStorage.setItem(
      "sahaaya_accessibility",
      JSON.stringify(accessibility),
    );
  }, [accessibility]);
  useEffect(() => {
    const refresh = () =>
      document.visibilityState === "visible" && navigator.onLine && load(true);
    const activeDelivery = [...data.requests, ...data.myRequests].some((item) =>
      ["ACCEPTED", "IN_PROGRESS"].includes(item.status),
    );
    const timer = setInterval(refresh, activeDelivery ? 15000 : 30000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, data.requests, data.myRequests]);
  useEffect(() => {
    const current = new Set(data.notifications.map((item) => String(item.id)));
    if (!seenNotifications.current.size) {
      seenNotifications.current = current;
      return;
    }
    if (
      accessibility.browserAlerts &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      const newest = data.notifications.find(
        (item) => !item.read_at && !seenNotifications.current.has(String(item.id)),
      );
      if (newest) new Notification(newest.title, { body: newest.body, tag: newest.id });
    }
    seenNotifications.current = current;
  }, [data.notifications, accessibility.browserAlerts]);
  async function act(payload: Row, success: string, refresh = true) {
    if (!navigator.onLine) {
      setToast("You are offline. Reconnect before sending this change.");
      return null;
    }
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setToast(success);
      if (payload.action === "confirm_delivery") {
        setDeliverySuccess(true);
        window.setTimeout(() => setDeliverySuccess(false), 2600);
      }
      if (refresh) await load(true);
      return result;
    } catch (reason) {
      setToast(
        reason instanceof Error ? reason.message : "Action failed safely.",
      );
      return null;
    }
  }
  const active = data.requests;
  const critical = active.filter((item) => item.urgency === "CRITICAL");
  const unread = data.notifications.filter((item) => !item.read_at);
  const menu = [
    { id: "overview", label: "Community feed", icon: "⌂" },
    { id: "my_requests", label: "My requests", icon: "◌" },
    { id: "requests", label: "Requests & offers", icon: "◎" },
    { id: "map", label: "Live help map", icon: "⌖" },
    { id: "resources", label: "Available resources", icon: "◉" },
    ...(data.user.role === "ADMIN"
      ? [{ id: "admin", label: "Admin dashboard", icon: "◆" }]
      : []),
  ];
  return (
    <main className="platform-shell">
      {showIntro && <SahaayaIntro />}
      <a className="skip-link" href="#main-workspace">
        Skip to main content
      </a>
      <aside className="sidebar">
        <button className="side-brand" onClick={() => setView("overview")}>
          <span>✦</span>
          <b>
            SAHAAYA<small>Response Network</small>
          </b>
        </button>
        <div className="side-event">
          <i />{" "}
          <span>
            <small>
              {data.events[0] ? "ACTIVE EVENT" : "COMMUNITY NETWORK"}
            </small>
            {data.events[0]?.name || "User-posted help only"}
          </span>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {menu.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <i>{item.icon}</i>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="side-section">
          <small>YOUR WORKSPACE</small>
          <button onClick={() => setView("notifications")}>
            <i>●</i> Notifications {unread.length > 0 && <b>{unread.length}</b>}
          </button>
          <button onClick={() => setView("profile")}>
            <i>◌</i> Profile & settings
          </button>
          <a className="side-logout" href="/signout-with-chatgpt?return_to=/">
            <i>↪</i> Log out
          </a>
        </div>
        <div className="system-state">
          <i />
          <span>
            <b>Automatic reconnection enabled</b>
            <small>Updates pause while offline</small>
          </span>
        </div>
      </aside>
      <section className="workspace">
        <header className="workspace-top">
          <button className="mobile-brand" onClick={() => setView("overview")}>
            ✦ SAHAAYA
          </button>
          <div className="crumb">
            <small>COMMUNITY HELP NETWORK</small>
            <b>{menu.find((item) => item.id === view)?.label ?? human(view)}</b>
          </div>
          <div className="top-actions">
            <span className="signed-user">
              Signed in as <b>{data.user.name || "Member"}</b>
            </span>
            <button
              className="top-note"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              ●{unread.length > 0 && <span>{unread.length}</span>}
            </button>
            <button className="avatar" onClick={() => setView("profile")}>
              {(data.user.name || "ME")
                .split(" ")
                .map((part: string) => part[0])
                .join("")
                .slice(0, 2)}
            </button>
            <a
              className="header-logout"
              href="/signout-with-chatgpt?return_to=/"
            >
              Log out
            </a>
          </div>
        </header>
        {showNotifications && (
          <NotificationPanel
            items={data.notifications}
            close={() => setShowNotifications(false)}
            read={() =>
              act(
                { action: "read_notifications" },
                "Notifications marked as read",
              )
            }
          />
        )}
        <div className="workspace-content" id="main-workspace" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={load}>Retry</button>
            </div>
          )}
          {loading ? (
            <Loading />
          ) : (
            <div className="view-stage" key={view}>
              {view === "overview" && (
                <Overview
                  data={data}
                  active={active}
                  critical={critical}
                  openRequest={() => setShowRequest(true)}
                  select={(item) => setSelected(item)}
                  navigate={setView}
                />
              )}
              {view === "requests" && (
                <Requests
                  data={data}
                  q={q}
                  setQ={setQ}
                  category={category}
                  setCategory={setCategory}
                  status={status}
                  setStatus={setStatus}
                  select={setSelected}
                  openRequest={() => setShowRequest(true)}
                />
              )}
              {view === "my_requests" && (
                <MyRequests
                  items={data.myRequests}
                  select={setSelected}
                  openRequest={() => setShowRequest(true)}
                />
              )}
              {view === "map" && (
                <MapView
                  requests={data.mapRequests}
                  setCategory={setCategory}
                  category={category}
                  select={setSelected}
                />
              )}
              {view === "volunteer" && (
                <VolunteerView
                  data={data}
                  active={active}
                  act={act}
                  select={setSelected}
                />
              )}
              {view === "organization" && (
                <OrganizationView data={data} act={act} select={setSelected} />
              )}
              {view === "resources" && (
                <ResourcesView resources={data.resources} act={act} />
              )}
              {view === "admin" && (
                <AdminGate data={data} act={act} reload={() => load(true)} />
              )}
              {view === "notifications" && (
                <NotificationsView
                  items={data.notifications}
                  read={() =>
                    act(
                      { action: "read_notifications" },
                      "Notifications marked as read",
                    )
                  }
                />
              )}
              {view === "profile" && (
                <Profile
                  user={data.user}
                  role={human(data.user.role || "Resident")}
                  accessibility={accessibility}
                  setAccessibility={setAccessibility}
                />
              )}
            </div>
          )}
        </div>
      </section>
      <button className="floating-help" onClick={() => setShowRequest(true)}>
        ＋ <span>Request help</span>
      </button>
      {showRequest && (
        <RequestModal
          events={data.events}
          close={() => setShowRequest(false)}
          submit={async (payload, file) => {
            const result = await act(
              { action: "create_request", ...payload },
              "Emergency request created and matching started",
            );
            if (result && file?.size) {
              const upload = new FormData();
              upload.set("file", file);
              upload.set("requestId", result.id);
              const response = await fetch("/api/uploads", {
                method: "POST",
                body: upload,
              });
              if (!response.ok)
                setToast(
                  (await response.json()).error ||
                    "Request created, but the image could not be uploaded.",
                );
            }
            if (result) {
              setShowRequest(false);
              return true;
            }
            return false;
          }}
        />
      )}
      {selected && (
        <RequestDetail
          item={selected}
          data={data}
          close={() => setSelected(null)}
          act={act}
        />
      )}
      {toast && (
        <div className="global-toast" role="status">
          {toast}
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
      {deliverySuccess && <DeliverySuccess />}
    </main>
  );
}

function Loading() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="network-loader"><i>✦</i></span>
      <p>Synchronizing response network…</p>
    </div>
  );
}

function SahaayaIntro() {
  return (
    <div className="sahaaya-intro" role="status" aria-label="Sahaaya is loading">
      <div className="intro-emblem">
        <span className="intro-orbit"><i /></span>
        <b>✦</b>
      </div>
      <div className="intro-wordmark" aria-hidden="true">
        {"SAHAAYA".split("").map((letter, index) => (
          <span key={`${letter}-${index}`} style={{ "--letter": index } as CSSProperties}>{letter}</span>
        ))}
      </div>
      <p>Community Response Network</p>
      <span className="intro-progress"><i /></span>
    </div>
  );
}

function DeliverySuccess() {
  return (
    <div className="delivery-success" role="status" aria-live="assertive">
      <div className="success-seal"><i>✓</i></div>
      <p className="overline">DELIVERY VERIFIED</p>
      <h2>Help reached safely</h2>
      <p>The request is complete and both participants have been notified.</p>
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <p className="overline">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({
  data,
  active,
  critical,
  openRequest,
  select,
  navigate,
}: {
  data: State;
  active: Row[];
  critical: Row[];
  openRequest: () => void;
  select: (r: Row) => void;
  navigate: (v: string) => void;
}) {
  const mine = active.filter((r) => r.is_owner);
  const offered = data.offers.filter(
    (o) => o.helper_id === data.user.id && o.status === "PENDING",
  );
  return (
    <>
      <PageHead
        eyebrow="LIVE COMMUNITY NETWORK · UPDATED AUTOMATICALLY"
        title="Ask for help. Offer what you can."
        description="Every request below was posted by a signed-in community member. Completed requests leave the active feed automatically."
        action={
          <div className="head-actions">
            <button className="soft-btn" onClick={() => navigate("requests")}>
              View all needs
            </button>
            <button className="solid-btn" onClick={openRequest}>
              ＋ Request help
            </button>
          </div>
        }
      />
      <div className="stat-grid">
        <Stat
          icon="!"
          tone="red"
          label="Active community needs"
          value={active.length}
          note={`${active.filter((r) => r.status === "OPEN").length} awaiting help`}
        />
        <Stat
          icon="◆"
          tone="amber"
          label="Critical requests"
          value={critical.length}
          note="Shown first to nearby helpers"
        />
        <Stat
          icon="◎"
          tone="green"
          label="My active requests"
          value={mine.length}
          note="Manage offers and progress"
        />
        <Stat
          icon="♡"
          tone="blue"
          label="My pending offers"
          value={offered.length}
          note="Waiting for requester approval"
        />
        <Stat
          icon="✓"
          tone="purple"
          label="My completed history"
          value={data.history.length}
          note="Private to participants"
        />
      </div>
      <div className="overview-grid">
        <MapCard requests={data.mapRequests} select={select} />
        <section className="surface priority-card">
          <CardHead
            eyebrow="NEEDS ATTENTION"
            title="Priority queue"
            action={
              <button onClick={() => navigate("requests")}>View all →</button>
            }
          />
          <div className="priority-list">
            {active.slice(0, 5).map((item) => (
              <RequestRow key={item.id} item={item} select={select} />
            ))}
          </div>
          <div className="privacy-strip">
            ⌾ <b>Privacy protected</b>
            <span>
              Approximate areas are public. Contact details appear only after
              verified assignment.
            </span>
          </div>
        </section>
      </div>
      <div className="two-grid">
        <ResourceSummary
          resources={data.resources}
          navigate={() => navigate("resources")}
        />
        <Activity items={data.activity} />
      </div>
    </>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: string;
  tone: string;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article className="stat-card">
      <i className={tone}>{icon}</i>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}
function CardHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-head">
      <div>
        <p className="overline">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value.toLowerCase()}`}>{human(value)}</span>;
}
function RequestRow({ item, select }: { item: Row; select: (r: Row) => void }) {
  return (
    <button className="request-line" onClick={() => select(item)}>
      <i className={item.urgency.toLowerCase()} />
      <span>
        <b>{human(item.category)}</b>
        <small>
          {item.id} · {item.public_area}
        </small>
      </span>
      <Badge value={item.urgency} />
      <span className="people">
        <b>{item.people_count}</b>
        <small>people</small>
      </span>
      <time>{ago(item.created_at)}</time>
      <em>›</em>
    </button>
  );
}

function MapCard({
  requests,
  select,
}: {
  requests: Row[];
  select: (request: Row) => void;
}) {
  const located = requests.filter(
    (r) => Number.isFinite(r.approx_lat) && Number.isFinite(r.approx_lng),
  );
  return (
    <section className="surface map-panel">
      <CardHead
        eyebrow="OPERATIONAL VIEW"
        title="Live community map"
        action={<span className="safe-map">⌾ Approximate until matched</span>}
      />
      <LiveHelpMap
        points={located.map((r) => ({
          id: r.id,
          lat: r.approx_lat,
          lng: r.approx_lng,
          label: `${human(r.category)} needed in ${r.public_area}`,
          kind: "request",
        }))}
        onSelect={(id) => {
          const request = located.find((item) => item.id === id);
          if (request) select(request);
        }}
      />
    </section>
  );
}

function MyRequests({
  items,
  select,
  openRequest,
}: {
  items: Row[];
  select: (item: Row) => void;
  openRequest: () => void;
}) {
  const active = items.filter(
    (item) => !["RESOLVED", "CANCELLED"].includes(item.status),
  );
  const completed = items.filter((item) => item.status === "RESOLVED");
  const cancelled = items.filter((item) => item.status === "CANCELLED");

  return (
    <>
      <PageHead
        eyebrow="PRIVATE REQUEST HISTORY"
        title="My requests"
        description="Only requests created by your signed-in account appear here. Open any request to review offers, delivery progress, or its final status."
        action={
          <button className="solid-btn" onClick={openRequest}>
            ＋ New request
          </button>
        }
      />
      <div className="mini-stats">
        <article>
          <small>ALL MY REQUESTS</small>
          <b>{items.length}</b>
        </article>
        <article>
          <small>ACTIVE</small>
          <b>{active.length}</b>
        </article>
        <article>
          <small>COMPLETED</small>
          <b>{completed.length}</b>
        </article>
        <article>
          <small>CANCELLED</small>
          <b>{cancelled.length}</b>
        </article>
      </div>
      <section className="surface data-card">
        <div className="table-title">
          <b>Your request history</b>
          <small>Newest first · private to your account</small>
        </div>
        {items.length ? (
          <div className="request-table">
            <div className="tr th">
              <span>Request</span>
              <span>Area</span>
              <span>People</span>
              <span>Urgency</span>
              <span>Status</span>
              <span>Created</span>
              <span />
            </div>
            {items.map((item) => (
              <button className="tr" key={item.id} onClick={() => select(item)}>
                <span>
                  <b>{human(item.category)}</b>
                  <small>{item.id}</small>
                </span>
                <span>{item.public_area}</span>
                <span>{item.people_count}</span>
                <span>
                  <Badge value={item.urgency} />
                </span>
                <span>
                  <Badge value={item.status} />
                </span>
                <span>{ago(item.created_at)}</span>
                <span>›</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="You have not created a request yet"
            text="When you request help, it will appear here automatically and remain in your private history after completion or cancellation."
          />
        )}
      </section>
    </>
  );
}

function Requests({
  data,
  q,
  setQ,
  category,
  setCategory,
  status,
  setStatus,
  select,
  openRequest,
}: {
  data: State;
  q: string;
  setQ: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  select: (r: Row) => void;
  openRequest: () => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="REQUEST OPERATIONS"
        title="Help request registry"
        description="Search, triage, assign, and follow every request without exposing sensitive contact details."
        action={
          <button className="solid-btn" onClick={openRequest}>
            ＋ New request
          </button>
        }
      />
      <section className="surface filter-bar">
        <label className="search">
          ⌕
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ID, area, or description"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((v) => (
              <option key={v}>{human(v)}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            {statuses.map((v) => (
              <option key={v}>{human(v)}</option>
            ))}
          </select>
        </label>
        <button
          className="soft-btn"
          onClick={() => {
            setQ("");
            setCategory("ALL");
            setStatus("ALL");
          }}
        >
          Clear filters
        </button>
      </section>
      <section className="surface data-card">
        <div className="table-title">
          <b>{data.requests.length} requests</b>
          <small>Sorted by urgency, then newest</small>
        </div>
        {data.requests.length ? (
          <div className="request-table">
            <div className="tr th">
              <span>Request</span>
              <span>Area</span>
              <span>People</span>
              <span>Urgency</span>
              <span>Status</span>
              <span>Created</span>
              <span />
            </div>
            {data.requests.map((item) => (
              <button className="tr" key={item.id} onClick={() => select(item)}>
                <span>
                  <b>{human(item.category)}</b>
                  <small>{item.id}</small>
                </span>
                <span>{item.public_area}</span>
                <span>{item.people_count}</span>
                <span>
                  <Badge value={item.urgency} />
                </span>
                <span>
                  <Badge value={item.status} />
                </span>
                <span>{ago(item.created_at)}</span>
                <span>›</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="No requests match these filters"
            text="Clear one or more filters to broaden the search."
          />
        )}
      </section>
    </>
  );
}

function MapView({
  requests,
  setCategory,
  category,
  select,
}: {
  requests: Row[];
  setCategory: (v: string) => void;
  category: string;
  select: (r: Row) => void;
}) {
  const shown = (
    category === "ALL"
      ? requests
      : requests.filter((r) => r.category === category)
  ).filter(
    (r) => Number.isFinite(r.approx_lat) && Number.isFinite(r.approx_lng),
  );
  return (
    <>
      <PageHead
        eyebrow="CONSENT-BASED LOCATION"
        title="Live help map"
        description="Requests appear by approximate area. Exact positions and helper movement are visible only to matched participants."
      />
      <div className="map-layout">
        <section className="surface map-filters">
          <b>Map filters</b>
          <label>
            Help category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((v) => (
                <option key={v}>{human(v)}</option>
              ))}
            </select>
          </label>
          <p>
            ⌾ Select a request below or click its map marker to open it and
            offer help. Once accepted, both people can see the private live
            delivery route and estimated arrival.
          </p>
          <div className="map-request-list">
            {shown.slice(0, 8).map((item) => (
              <button key={item.id} onClick={() => select(item)}>
                <Badge value={item.urgency} />
                <span>
                  <b>{human(item.category)}</b>
                  <small>{item.public_area}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="surface full-map">
          <LiveHelpMap
            points={shown.map((r) => ({
              id: r.id,
              lat: r.approx_lat,
              lng: r.approx_lng,
              label: `${human(r.category)} · ${r.public_area}`,
              kind: "request",
            }))}
            onSelect={(id) => {
              const request = shown.find((item) => item.id === id);
              if (request) select(request);
            }}
          />
        </section>
      </div>
    </>
  );
}

function VolunteerView({
  data,
  active,
  act,
  select,
}: {
  data: State;
  active: Row[];
  act: (p: Row, s: string) => Promise<any>;
  select: (r: Row) => void;
}) {
  const volunteer = data.volunteers[0];
  const matches = active.filter(
    (item) =>
      JSON.parse(volunteer?.skills || "[]").includes(item.category) ||
      JSON.parse(volunteer?.areas || "[]").includes(item.public_area),
  );
  const assigned = data.requests.filter(
    (item) => item.assigned_volunteer_id === volunteer?.user_id,
  );
  return (
    <>
      <PageHead
        eyebrow="VOLUNTEER OPERATIONS"
        title="Volunteer response center"
        description="Discover suitable nearby requests, manage availability, and complete active tasks safely."
        action={
          <label className="availability">
            <span className={volunteer?.available ? "on" : ""} />
            <input
              type="checkbox"
              checked={!!volunteer?.available}
              onChange={(e) =>
                act(
                  {
                    action: "availability",
                    volunteerId: volunteer.user_id,
                    available: e.target.checked,
                  },
                  e.target.checked
                    ? "You are now available"
                    : "Availability paused",
                )
              }
            />
            {volunteer?.available ? "Available" : "Unavailable"}
          </label>
        }
      />
      <div className="mini-stats">
        <article>
          <small>NEARBY MATCHES</small>
          <b>{matches.length}</b>
        </article>
        <article>
          <small>ACTIVE TASKS</small>
          <b>{assigned.filter((r) => r.status !== "RESOLVED").length}</b>
        </article>
        <article>
          <small>COMPLETED TASKS</small>
          <b>{volunteer?.completed_tasks || 0}</b>
        </article>
        <article>
          <small>PRIMARY AREAS</small>
          <b className="words">
            {JSON.parse(volunteer?.areas || "[]").join(", ")}
          </b>
        </article>
      </div>
      <div className="two-grid align-start">
        <section className="surface">
          <CardHead eyebrow="SMART MATCHING" title="Recommended requests" />
          <div className="priority-list">
            {matches.length ? (
              matches.slice(0, 8).map((item) => (
                <div className="match-row" key={item.id}>
                  <RequestRow item={item} select={select} />
                  <button
                    className="solid-btn small"
                    onClick={() =>
                      act(
                        { action: "accept_request", id: item.id },
                        `${item.id} accepted`,
                      )
                    }
                  >
                    Accept
                  </button>
                </div>
              ))
            ) : (
              <Empty
                title="No suitable requests right now"
                text="Keep availability on and new matches will appear automatically."
              />
            )}
          </div>
        </section>
        <section className="surface">
          <CardHead eyebrow="YOUR WORK" title="Active and completed tasks" />
          <div className="task-list">
            {assigned.length ? (
              assigned.map((item) => (
                <button key={item.id} onClick={() => select(item)}>
                  <Badge value={item.status} />
                  <b>
                    {human(item.category)} · {item.public_area}
                  </b>
                  <small>
                    {item.id} · {item.people_count} people
                  </small>
                </button>
              ))
            ) : (
              <Empty
                title="No assigned tasks"
                text="Accepted and assigned requests will appear here."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function OrganizationView({
  data,
  act,
  select,
}: {
  data: State;
  act: (p: Row, s: string) => Promise<any>;
  select: (r: Row) => void;
}) {
  const open = data.requests.filter((r) => r.status === "OPEN");
  const accepted = data.requests.filter((r) =>
    ["ACCEPTED", "VOLUNTEER_ASSIGNED", "IN_PROGRESS"].includes(r.status),
  );
  return (
    <>
      <PageHead
        eyebrow="VERIFIED PARTNER HUB"
        title="Organization operations"
        description="Triage requests, assign qualified volunteers, and coordinate resources from one operational queue."
      />
      <div className="mini-stats">
        <article>
          <small>OPEN REQUESTS</small>
          <b>{open.length}</b>
        </article>
        <article>
          <small>IN PROGRESS</small>
          <b>{accepted.length}</b>
        </article>
        <article>
          <small>AVAILABLE VOLUNTEERS</small>
          <b>{data.volunteers.filter((v) => v.available).length}</b>
        </article>
        <article>
          <small>RESOURCE TYPES</small>
          <b>{data.resources.length}</b>
        </article>
      </div>
      <div className="org-grid">
        <section className="surface">
          <CardHead eyebrow="TRIAGE" title="Unaccepted requests" />
          <div className="org-queue">
            {open.slice(0, 10).map((item) => (
              <div key={item.id}>
                <button className="org-request" onClick={() => select(item)}>
                  <Badge value={item.urgency} />
                  <span>
                    <b>
                      {human(item.category)} for {item.people_count}
                    </b>
                    <small>
                      {item.id} · {item.public_area} · {ago(item.created_at)}
                    </small>
                  </span>
                </button>
                <button
                  className="solid-btn small"
                  onClick={() =>
                    act(
                      { action: "accept_request", id: item.id },
                      `${item.id} accepted by organization`,
                    )
                  }
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="surface">
          <CardHead eyebrow="ASSIGNMENTS" title="Dispatch volunteer" />
          <div className="assignment-list">
            {accepted.slice(0, 8).map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.id}</b>
                  <small>
                    {human(item.category)} · {item.public_area}
                  </small>
                </span>
                {item.assigned_volunteer_id ? (
                  <Badge value="VOLUNTEER_ASSIGNED" />
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) =>
                      e.target.value &&
                      act(
                        {
                          action: "assign_volunteer",
                          id: item.id,
                          volunteerId: e.target.value,
                        },
                        "Volunteer assigned and notified",
                      )
                    }
                  >
                    <option value="" disabled>
                      Assign volunteer
                    </option>
                    {data.volunteers
                      .filter((v) => v.available)
                      .map((v) => (
                        <option key={v.user_id} value={v.user_id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function ResourcesView({
  resources,
  act,
}: {
  resources: Row[];
  act: (p: Row, s: string) => Promise<any>;
}) {
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="ADMIN-VERIFIED AVAILABILITY"
        title="Available resources"
        description="Community members post real supplies. Listings become public only after an administrator verifies them and automatically expire after seven days."
        action={
          <button className="solid-btn" onClick={() => setAdding(true)}>
            ＋ List a resource
          </button>
        }
      />
      {resources.length ? (
        <section className="resource-board">
          {resources.map((item) => (
            <article className="resource-tile" key={item.id}>
              <span className={`resource-big ${item.category.toLowerCase()}`}>
                {item.category === "MEDICAL"
                  ? "+"
                  : item.category === "SHELTER"
                    ? "⌂"
                    : "◉"}
              </span>
              <div>
                <p>{human(item.category)}</p>
                <h3>{item.name}</h3>
                <strong>
                  {item.quantity.toLocaleString()} <small>{item.unit}</small>
                </strong>
                <span className="stock-track">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(12, item.quantity / 50))}%`,
                    }}
                  />
                </span>
                <small>
                  Posted by {item.owner_name} · {item.public_area} · updated{" "}
                  {ago(item.updated_at)}
                </small>
                {item.is_owner && <Badge value={item.verification_status} />}
              </div>
              {item.is_owner && (
                <span>
                  <button className="soft-btn" onClick={() => setAdjust(item)}>
                    Update
                  </button>
                  <button
                    className="soft-btn danger-text"
                    onClick={() =>
                      window.confirm("Remove this resource listing?") &&
                      act(
                        { action: "delete_resource", id: item.id },
                        "Resource listing removed",
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              )}
            </article>
          ))}
        </section>
      ) : (
        <Empty
          title="No resources have been listed yet"
          text="Available supplies appear here only after a signed-in member confirms what they can provide."
        />
      )}
      {adjust && (
        <AdjustResource
          item={adjust}
          close={() => setAdjust(null)}
          submit={async (delta, note) => {
            await act(
              { action: "adjust_resource", id: adjust.id, delta, note },
              "Resource availability updated",
            );
            setAdjust(null);
          }}
        />
      )}
      {adding && (
        <AddResource
          close={() => setAdding(false)}
          submit={async (payload) => {
            const result = await act(
              { action: "add_resource", ...payload },
              "Your resource is now visible to the community",
            );
            if (result) setAdding(false);
          }}
        />
      )}
    </>
  );
}
function ResourceSummary({
  resources,
  navigate,
}: {
  resources: Row[];
  navigate: () => void;
}) {
  return (
    <section className="surface">
      <CardHead
        eyebrow="USER-POSTED SUPPLIES"
        title="Available resources"
        action={
          <button onClick={navigate}>
            {resources.length
              ? "View listings →"
              : "List what you can provide →"}
          </button>
        }
      />
      {resources.length ? (
        <div className="resource-summary">
          {resources.slice(0, 4).map((item) => (
            <article key={item.id}>
              <i className={item.category.toLowerCase()}>
                {item.category === "MEDICAL" ? "+" : "◉"}
              </i>
              <span>
                <b>{item.name}</b>
                <strong>{item.quantity.toLocaleString()}</strong>
                <small>
                  {item.unit} · {item.public_area} · {item.owner_name}
                </small>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No confirmed resources yet"
          text="This section stays empty until a real user lists available supplies."
        />
      )}
    </section>
  );
}

function AdminGate({
  data,
  act,
  reload,
}: {
  data: State;
  act: (p: Row, s: string) => Promise<any>;
  reload: () => Promise<void>;
}) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const setup = !data.adminAccess.configured;
    if (setup && password !== confirmation) {
      setMessage("The two passwords do not match.");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: setup ? "setup" : "login",
          loginId,
          password,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPassword("");
      setConfirmation("");
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Admin login was unsuccessful.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (!data.adminAccess.authenticated)
    return (
      <div className="admin-login-shell">
        <section className="surface admin-login-card">
          <span className="admin-shield">◆</span>
          <p className="overline">RESTRICTED ADMINISTRATION</p>
          <h1>
            {data.adminAccess.configured
              ? "Unlock the Admin dashboard"
              : "Secure your Admin dashboard"}
          </h1>
          <p>
            {data.adminAccess.configured
              ? "Enter the administrator ID and password created for this signed-in account."
              : "Create the administrator ID and strong password that will protect this account's privileged controls."}
          </p>
          <form onSubmit={authenticate}>
            <label>
              Administrator ID
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                autoComplete="username"
                minLength={4}
                maxLength={40}
                required
                placeholder="e.g. sahaaya-admin"
              />
            </label>
            <label>
              Administrator password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  data.adminAccess.configured
                    ? "current-password"
                    : "new-password"
                }
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            {!data.adminAccess.configured && (
              <>
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
                <small>
                  Use 12 or more characters with uppercase, lowercase, a number,
                  and a symbol. Your password is never stored in readable form.
                </small>
              </>
            )}
            {message && <div className="admin-login-error">{message}</div>}
            <button className="solid-btn" disabled={working}>
              {working
                ? "Checking securely…"
                : data.adminAccess.configured
                  ? "Unlock Admin dashboard"
                  : "Create credentials & continue"}
            </button>
          </form>
          <div className="privacy-copy">
            Your ChatGPT identity and administrator credentials must both match.
            Repeated failed attempts are temporarily limited.
          </div>
        </section>
      </div>
    );

  return (
    <AdminView
      data={data}
      act={act}
      lock={async () => {
        await fetch("/api/admin-auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "logout" }),
        });
        await reload();
      }}
    />
  );
}

function AdminView({
  data,
  act,
  lock,
}: {
  data: State;
  act: (p: Row, s: string) => Promise<any>;
  lock: () => Promise<void>;
}) {
  const [showEvent, setShowEvent] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="SYSTEM GOVERNANCE"
        title="Administration control room"
        description="Review reports, verify partners, monitor activity, and manage events without automated fraud judgments."
        action={
          <div className="head-actions">
            <button className="soft-btn" onClick={lock}>
              Lock dashboard
            </button>
            <button className="solid-btn" onClick={() => setShowEvent(true)}>
              ＋ Create disaster event
            </button>
          </div>
        }
      />
      <div className="mini-stats">
        <article>
          <small>PENDING REPORTS</small>
          <b>{data.reports.filter((r) => r.status === "PENDING").length}</b>
        </article>
        <article>
          <small>UNVERIFIED PARTNERS</small>
          <b>{data.organizations.filter((o) => !o.verified).length}</b>
        </article>
        <article>
          <small>REGISTERED USERS</small>
          <b>{data.users.length}</b>
        </article>
        <article>
          <small>ACTIVE EVENTS</small>
          <b>{data.events.filter((e) => e.status === "ACTIVE").length}</b>
        </article>
      </div>
      <AdminSecurity />
      <div className="admin-grid">
        <section className="surface admin-users-card">
          <CardHead eyebrow="ACCESS CONTROL" title="User administration" />
          <div className="admin-user-list">
            {data.users.map((account) => (
              <article key={account.id}>
                <span className="org-avatar">
                  {(account.name || account.email).slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{account.name}</b>
                  <small>{account.email}</small>
                </div>
                <select
                  value={account.role}
                  disabled={account.id === data.user.id}
                  aria-label={`Role for ${account.name}`}
                  onChange={(event) =>
                    act(
                      {
                        action: "manage_user",
                        id: account.id,
                        operation: "set_role",
                        role: event.target.value,
                      },
                      `${account.name}'s role was updated`,
                    )
                  }
                >
                  {["RESIDENT", "VOLUNTEER", "ORGANIZATION", "ADMIN"].map(
                    (role) => (
                      <option value={role} key={role}>
                        {human(role)}
                      </option>
                    ),
                  )}
                </select>
                <button
                  className={account.blocked_at ? "soft-btn" : "danger"}
                  disabled={account.id === data.user.id}
                  onClick={() => {
                    if (
                      !account.blocked_at &&
                      !window.confirm(`Block ${account.name}'s account?`)
                    )
                      return;
                    act(
                      {
                        action: "manage_user",
                        id: account.id,
                        operation: account.blocked_at ? "unblock" : "block",
                      },
                      account.blocked_at
                        ? `${account.name} was unblocked`
                        : `${account.name} was blocked`,
                    );
                  }}
                >
                  {account.id === data.user.id
                    ? "Current admin"
                    : account.blocked_at
                      ? "Unblock"
                      : "Block"}
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="surface">
          <CardHead eyebrow="HUMAN REVIEW REQUIRED" title="Reported requests" />
          <div className="review-list">
            {data.reports.map((report) => (
              <article key={report.id}>
                <div>
                  <Badge value={report.status} />
                  <b>
                    {report.request_id} · {human(report.category)}
                  </b>
                  <p>{report.reason}</p>
                  <small>
                    {report.public_area} · reported {ago(report.created_at)}
                  </small>
                </div>
                <span>
                  <button
                    onClick={() =>
                      act(
                        {
                          action: "review_report",
                          id: report.id,
                          status: "VERIFIED",
                        },
                        "Report reviewed and request retained",
                      )
                    }
                  >
                    Verify
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      act(
                        {
                          action: "review_report",
                          id: report.id,
                          status: "REMOVED",
                        },
                        "Report reviewed and request removed from queue",
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="surface">
          <CardHead eyebrow="PARTNER TRUST" title="Organization verification" />
          <div className="org-list">
            {data.organizations.map((org) => (
              <article key={org.id}>
                <span className="org-avatar">
                  {org.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{org.name}</b>
                  <small>
                    {org.public_area} · {org.contact_email}
                  </small>
                </div>
                <Badge value={org.verified ? "VERIFIED" : "PENDING"} />
                <button
                  className="soft-btn"
                  onClick={() =>
                    act(
                      {
                        action: "verify_org",
                        id: org.id,
                        verified: !org.verified,
                      },
                      org.verified
                        ? "Verification paused"
                        : "Organization verified",
                    )
                  }
                >
                  {org.verified ? "Review" : "Verify"}
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="surface events-card">
          <CardHead eyebrow="SUPPLY TRUST" title="Resource verification" />
          <div className="review-list">
            {data.resources.filter((item) => item.verification_status !== "VERIFIED").map((item) => (
              <article key={item.id}>
                <div>
                  <Badge value={item.verification_status} />
                  <b>{item.name} · {item.quantity} {item.unit}</b>
                  <p>{item.owner_name} · {item.public_area}</p>
                  <small>Expires {new Date(item.expires_at).toLocaleDateString()}</small>
                </div>
                <span>
                  <button onClick={() => act({ action: "verify_resource", id: item.id, status: "VERIFIED" }, "Resource listing verified")}>Verify</button>
                  <button className="danger" onClick={() => act({ action: "verify_resource", id: item.id, status: "REJECTED" }, "Resource listing rejected")}>Reject</button>
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="surface events-card">
          <CardHead eyebrow="DISASTER EVENTS" title="Event lifecycle" />
          <div className="event-list">
            {data.events.map((event) => (
              <article key={event.id}>
                <Badge value={event.status} />
                <div>
                  <b>{event.name}</b>
                  <small>{JSON.parse(event.affected_areas).join(" · ")}</small>
                </div>
                <time>{new Date(event.starts_at).toLocaleDateString()}</time>
              </article>
            ))}
          </div>
        </section>
        <Activity items={data.activity} />
        <section className="surface admin-audit-card">
          <CardHead eyebrow="ACCOUNTABILITY" title="Administrator audit log" />
          <div className="activity-list">
            {data.auditLogs.slice(0, 12).map((entry) => (
              <article key={entry.id}>
                <i>◆</i>
                <p>
                  <b>{human(entry.action)}</b> · {entry.entity_type} {entry.entity_id}
                  <small>{entry.actor_name} · {ago(entry.created_at)}</small>
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
      {showEvent && (
        <CreateEvent
          close={() => setShowEvent(false)}
          submit={async (payload) => {
            const result = await act(
              { action: "create_event", ...payload },
              "Disaster event created",
            );
            if (result) setShowEvent(false);
          }}
        />
      )}
    </>
  );
}

function AdminSecurity() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const send = async (payload: Row) => {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setMessage("The new passwords do not match.");
      return;
    }
    setWorking(true);
    try {
      await send({ action: "change_password", currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setMessage("Administrator password changed and all older sessions were closed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password change failed safely.");
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="surface admin-security-card">
      <div>
        <p className="overline">ADMIN SESSION SECURITY</p>
        <h2>Credentials and active sessions</h2>
        <p>Rotate the administrator password or immediately close every unlocked Admin session.</p>
      </div>
      <form onSubmit={changePassword}>
        <input aria-label="Current administrator password" type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        <input aria-label="New administrator password" type="password" autoComplete="new-password" placeholder="New strong password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} required />
        <input aria-label="Confirm new administrator password" type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} required />
        <button className="soft-btn" disabled={working}>{working ? "Changing…" : "Change password"}</button>
      </form>
      <button
        className="danger-btn"
        onClick={async () => {
          if (!window.confirm("Log out every Admin dashboard session now?")) return;
          try {
            await send({ action: "logout_all" });
            window.location.reload();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not close sessions.");
          }
        }}
      >
        Log out all Admin sessions
      </button>
      {message && <p className="admin-security-message" role="status">{message}</p>}
    </section>
  );
}

function Activity({ items }: { items: Row[] }) {
  return (
    <section className="surface">
      <CardHead eyebrow="COORDINATION LOG" title="Live activity" />
      <div className="activity-list">
        {items.slice(0, 6).map((item, index) => (
          <article key={item.id || index}>
            <i>{item.status === "RESOLVED" ? "✓" : "↗"}</i>
            <p>
              <b>{item.request_id}</b> · {item.body}
              <small>{ago(item.created_at)}</small>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
function NotificationsView({
  items,
  read,
}: {
  items: Row[];
  read: () => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="IN-APP ALERTS"
        title="Notification center"
        description="Assignments, status changes, resolutions, and important disaster updates in one place."
        action={
          <button className="soft-btn" onClick={read}>
            Mark all read
          </button>
        }
      />
      <section className="surface notification-page">
        {items.map((item) => (
          <article className={item.read_at ? "read" : ""} key={item.id}>
            <i>
              {item.type === "ALERT"
                ? "!"
                : item.type === "STATUS"
                  ? "↗"
                  : "✓"}
            </i>
            <div>
              <b>{item.title}</b>
              <p>{item.body}</p>
              <small>{ago(item.created_at)}</small>
            </div>
            {!item.read_at && <span>NEW</span>}
          </article>
        ))}
      </section>
    </>
  );
}
function NotificationPanel({
  items,
  close,
  read,
}: {
  items: Row[];
  close: () => void;
  read: () => void;
}) {
  return (
    <aside className="notification-panel">
      <header>
        <h3>Notifications</h3>
        <button onClick={close}>×</button>
      </header>
      {items.slice(0, 5).map((item) => (
        <article key={item.id}>
          <i>{item.type === "ALERT" ? "!" : "✓"}</i>
          <div>
            <b>{item.title}</b>
            <p>{item.body}</p>
            <small>{ago(item.created_at)}</small>
          </div>
        </article>
      ))}
      <button className="mark-read" onClick={read}>
        Mark all as read
      </button>
    </aside>
  );
}
function Profile({
  user,
  role,
  accessibility,
  setAccessibility,
}: {
  user: Row;
  role: string;
  accessibility: AccessibilityPreferences;
  setAccessibility: (
    value: AccessibilityPreferences | ((current: AccessibilityPreferences) => AccessibilityPreferences),
  ) => void;
}) {
  const toggle = (key: keyof AccessibilityPreferences) =>
    setAccessibility((current) => ({ ...current, [key]: !current[key] }));
  const enableBrowserAlerts = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setAccessibility((current) => ({
      ...current,
      browserAlerts: permission === "granted",
    }));
  };
  return (
    <>
      <PageHead
        eyebrow="ACCOUNT & PRIVACY"
        title="Profile settings"
        description="Manage your operational identity, safety preferences, and account access."
      />
      <div className="profile-layout">
        <section className="surface profile-card">
          <span className="large-avatar">
            {(user.name || "AK")
              .split(" ")
              .map((p: string) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge value={role.toUpperCase()} />
          <a className="soft-btn" href="/signout-with-chatgpt?return_to=/">
            Sign out securely
          </a>
        </section>
        <section className="surface settings-card">
          <CardHead
            eyebrow="SAFETY DEFAULTS"
            title="Privacy and notifications"
          />
          <label htmlFor="privacy-location">
            <span>
              <b>Hide exact location publicly</b>
              <small>Only an approximate service area is shown on maps.</small>
            </span>
            <input
              id="privacy-location"
              aria-label="Hide exact location publicly"
              type="checkbox"
              checked
              readOnly
            />
          </label>
          <label htmlFor="assignment-notifications">
            <span>
              <b>Assignment notifications</b>
              <small>Receive an alert whenever a responder is assigned.</small>
            </span>
            <input
              id="assignment-notifications"
              aria-label="Assignment notifications"
              type="checkbox"
              defaultChecked
            />
          </label>
          <label htmlFor="critical-alerts">
            <span>
              <b>Critical event alerts</b>
              <small>
                Important official disaster information appears in-app.
              </small>
            </span>
            <input
              id="critical-alerts"
              aria-label="Critical event alerts"
              type="checkbox"
              defaultChecked
            />
          </label>
          <div className="settings-divider">
            <b>Reading and accessibility</b>
            <small>These choices stay only on this device.</small>
          </div>
          <label htmlFor="simple-mode">
            <span>
              <b>Simple mode</b>
              <small>Hides secondary details and keeps the main actions clear.</small>
            </span>
            <input
              id="simple-mode"
              aria-label="Simple mode"
              type="checkbox"
              checked={accessibility.simple}
              onChange={() => toggle("simple")}
            />
          </label>
          <label htmlFor="large-text">
            <span>
              <b>Larger text and controls</b>
              <small>Makes reading and tapping easier across the website.</small>
            </span>
            <input
              id="large-text"
              aria-label="Larger text and controls"
              type="checkbox"
              checked={accessibility.largeText}
              onChange={() => toggle("largeText")}
            />
          </label>
          <label htmlFor="high-contrast">
            <span>
              <b>High contrast</b>
              <small>Strengthens borders, text, and status visibility.</small>
            </span>
            <input
              id="high-contrast"
              aria-label="High contrast"
              type="checkbox"
              checked={accessibility.highContrast}
              onChange={() => toggle("highContrast")}
            />
          </label>
          <label htmlFor="reduce-motion">
            <span>
              <b>Reduce motion</b>
              <small>Stops non-essential movement and smooth scrolling.</small>
            </span>
            <input
              id="reduce-motion"
              aria-label="Reduce motion"
              type="checkbox"
              checked={accessibility.reduceMotion}
              onChange={() => toggle("reduceMotion")}
            />
          </label>
          <label htmlFor="browser-alerts">
            <span>
              <b>Instant browser alerts</b>
              <small>Shows new assignments and delivery updates while Sahaaya is open.</small>
            </span>
            <input
              id="browser-alerts"
              aria-label="Instant browser alerts"
              type="checkbox"
              checked={accessibility.browserAlerts}
              onChange={() =>
                accessibility.browserAlerts
                  ? toggle("browserAlerts")
                  : void enableBrowserAlerts()
              }
            />
          </label>
          <div className="security-note">
            Account authentication is handled by secure workspace sign-in.
            Operational permissions are checked again for every protected server
            action.
          </div>
        </section>
      </div>
    </>
  );
}

function RequestModal({
  events,
  close,
  submit,
}: {
  events: Row[];
  close: () => void;
  submit: (p: Row, file?: File) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [draft] = useState<Row>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(
        localStorage.getItem("sahaaya_request_draft") || "{}",
      );
    } catch {
      return {};
    }
  });
  const [clientRequestId] = useState(() =>
    String(draft.clientRequestId || crypto.randomUUID()),
  );
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const candidate = f.get("image");
    const file = candidate instanceof File ? candidate : undefined;
    f.delete("image");
    setBusy(true);
    setLocationError("");
    try {
      if (!navigator.geolocation)
        throw new Error("Location is not supported on this device.");
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000,
          }),
      );
      const submitted = await submit(
        {
          ...Object.fromEntries(f),
          clientRequestId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        file,
      );
      if (submitted) localStorage.removeItem("sahaaya_request_draft");
    } catch (reason) {
      setLocationError(
        reason instanceof Error
          ? reason.message
          : "Allow location access to create this request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay" onMouseDown={close}>
      <section
        className="modal request-form"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="overline">EMERGENCY ASSISTANCE</p>
            <h2>Tell the community what you need</h2>
            <p>Your current location is requested only when you submit.</p>
          </div>
          <button onClick={close} aria-label="Close request form">×</button>
        </header>
        <form
          onSubmit={onSubmit}
          onInput={(event) => {
            const values = new FormData(event.currentTarget);
            values.delete("image");
            localStorage.setItem(
              "sahaaya_request_draft",
              JSON.stringify({
                ...Object.fromEntries(values),
                clientRequestId,
              }),
            );
          }}
        >
          <label>
            Help category
            <select
              name="category"
              required
              defaultValue={draft.category || ""}
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.slice(1).map((v) => (
                <option key={v} value={v}>
                  {human(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            General area
            <input
              name="publicArea"
              required
              minLength={2}
              placeholder="e.g. Whitefield"
              defaultValue={draft.publicArea || ""}
            />
          </label>
          <label>
            People needing help
            <input
              name="peopleCount"
              required
              type="number"
              min="1"
              max="1000"
              defaultValue={draft.peopleCount || ""}
            />
          </label>
          <label>
            Disaster event
            <select name="eventId" defaultValue={draft.eventId || ""}>
              <option value="">General community emergency</option>
              {events
                .filter((e) => e.status === "ACTIVE")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset>
            <legend>Urgency</legend>
            {["NORMAL", "URGENT", "CRITICAL"].map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="urgency"
                  value={v}
                  defaultChecked={(draft.urgency || "NORMAL") === v}
                />
                {human(v)}
              </label>
            ))}
          </fieldset>
          <label>
            Preferred contact
            <select name="contactMethod">
              <option value="IN_APP">In-app / email after match</option>
            </select>
          </label>
          <label className="wide">
            Short description
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={1000}
              placeholder="Describe the immediate need and any safety concerns…"
              defaultValue={draft.description || ""}
            />
          </label>
          <label className="wide">
            Optional image (JPG, PNG, or WebP · max 5 MB)
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </label>
          <div className="privacy-copy wide">
            ⌾ Your exact position and contact stay private. They are revealed
            only to the helper whose offer you accept. An unfinished text draft
            stays only on this device until it is submitted.
          </div>
          {locationError && (
            <div className="location-error wide" role="alert">
              {locationError}
            </div>
          )}
          <div className="modal-actions wide">
            <button type="button" className="soft-btn" onClick={close}>
              Cancel
            </button>
            <button disabled={busy} className="solid-btn">
              {busy
                ? "Getting your location…"
                : "Share location & request help →"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RequestDetail({
  item,
  data,
  close,
  act,
}: {
  item: Row;
  data: State;
  close: () => void;
  act: (p: Row, s: string, refresh?: boolean) => Promise<any>;
}) {
  const [note, setNote] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState("");
  const [tracking, setTracking] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastLocationRef = useRef<{
    at: number;
    lat: number;
    lng: number;
  } | null>(null);
  const locationRequestPending = useRef(false);
  const activeMatch = ["ACCEPTED", "IN_PROGRESS"].includes(item.status);
  const offers = data.offers.filter((o) => o.request_id === item.id);
  const myOffer = offers.find((o) => o.helper_id === data.user.id);
  const acceptedContact = item.is_owner
    ? item.helper_email
    : item.requester_email;
  const mapPoints = [] as {
    id: string;
    lat: number;
    lng: number;
    label: string;
    kind: "request" | "helper";
  }[];
  if (Number.isFinite(item.approx_lat) && Number.isFinite(item.approx_lng))
    mapPoints.push({
      id: "request",
      lat: item.approx_lat,
      lng: item.approx_lng,
      label: `Help destination · ${item.public_area}`,
      kind: "request",
    });
  if (Number.isFinite(item.helper_lat) && Number.isFinite(item.helper_lng))
    mapPoints.unshift({
      id: "helper",
      lat: item.helper_lat,
      lng: item.helper_lng,
      label: `${item.helper_name || "Helper"} is here`,
      kind: "helper",
    });
  useEffect(
    () => () => {
      if (watchRef.current !== null)
        navigator.geolocation.clearWatch(watchRef.current);
    },
    [],
  );
  function startTracking() {
    if (!navigator.geolocation) {
      setNote("Live location is unavailable on this device.");
      return;
    }
    setTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const next = {
          at: Date.now(),
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const previous = lastLocationRef.current;
        if (
          locationRequestPending.current ||
          (previous &&
            next.at - previous.at < 12000 &&
            distanceMeters(previous, next) < 30)
        )
          return;
        locationRequestPending.current = true;
        const result = await act(
          {
            action: "update_delivery_location",
            id: item.id,
            latitude: next.lat,
            longitude: next.lng,
          },
          "Live location and ETA updated",
          false,
        );
        locationRequestPending.current = false;
        if (result) {
          lastLocationRef.current = next;
          setNote(
            result.eta
              ? `Location shared · about ${result.eta} minutes away`
              : "Live location shared",
          );
        }
      },
      () => {
        setTracking(false);
        setNote("Allow location permission to share delivery progress.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  }
  function stopTracking() {
    if (watchRef.current !== null)
      navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  }
  return (
    <div className="overlay right" onMouseDown={close}>
      <section
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="overline">COMMUNITY REQUEST</p>
            <h2>{item.id}</h2>
          </div>
          <button onClick={close}>×</button>
        </header>
        <div className="detail-body">
          <div className="detail-badges">
            <Badge value={item.urgency} />
            <Badge value={item.status} />
            {item.is_owner && <span className="mine-badge">Your request</span>}
          </div>
          <h3>{human(item.category)} assistance</h3>
          <p className="description">{item.description}</p>
          <dl>
            <div>
              <dt>Area</dt>
              <dd>{item.public_area}</dd>
            </div>
            <div>
              <dt>People needing help</dt>
              <dd>{item.people_count}</dd>
            </div>
            <div>
              <dt>Requested by</dt>
              <dd>{item.requester_name}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(item.created_at).toLocaleString()}</dd>
            </div>
          </dl>
          {item.can_contact && (
            <section className="contact-unlocked">
              <p className="overline">PRIVATE MATCH</p>
              <b>{item.is_owner ? item.helper_name : item.requester_name}</b>
              <a href={`mailto:${acceptedContact}`}>{acceptedContact}</a>
              <small>
                Contact is visible only to the requester and accepted helper.
              </small>
            </section>
          )}
          {item.is_helper && activeMatch && (
            <section className="delivery-code-card">
              <p className="overline">ONE-TIME DELIVERY CODE</p>
              {generatedCode ? (
                <>
                  <strong>{generatedCode}</strong>
                  <p>
                    Tell this code to the requester only after delivery. It
                    expires at {new Date(codeExpiresAt).toLocaleTimeString()}{" "}
                    and is never stored in readable form.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Generate a fresh code when you arrive. Creating a new code
                    invalidates any previous one.
                  </p>
                  <button
                    className="solid-btn small"
                    onClick={async () => {
                      const result = await act(
                        { action: "generate_delivery_code", id: item.id },
                        "One-time delivery code generated",
                        false,
                      );
                      if (result) {
                        setGeneratedCode(result.code);
                        setCodeExpiresAt(result.expiresAt);
                      }
                    }}
                  >
                    Generate secure code
                  </button>
                </>
              )}
            </section>
          )}
          {item.is_owner && activeMatch && (
            <section className="confirm-delivery">
              <p className="overline">CONFIRM SAFE DELIVERY</p>
              <h4>Enter the helper&apos;s 6-digit code</h4>
              <p>
                Ask for the code only after you receive the parcel or support.
              </p>
              <div>
                <input
                  value={deliveryCode}
                  onChange={(e) =>
                    setDeliveryCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  aria-label="Six-digit delivery confirmation code"
                />
                <button
                  className="solid-btn"
                  disabled={deliveryCode.length !== 6}
                  onClick={async () => {
                    const result = await act(
                      {
                        action: "confirm_delivery",
                        id: item.id,
                        code: deliveryCode,
                      },
                      "Delivery confirmed and request completed",
                    );
                    if (result) close();
                  }}
                >
                  Confirm delivery
                </button>
              </div>
            </section>
          )}
          {activeMatch && (
            <section className="tracking-card">
              <div className="tracking-head">
                <div>
                  <p className="overline">LIVE DELIVERY TRACKING</p>
                  <b>
                    {item.eta_minutes
                      ? `About ${item.eta_minutes} minutes away`
                      : "Waiting for helper location"}
                  </b>
                  <small>
                    {item.delivery_updated_at
                      ? `Updated ${ago(item.delivery_updated_at)}`
                      : "The helper can start sharing when they begin the journey."}
                  </small>
                </div>
                {item.is_helper &&
                  (tracking ? (
                    <button className="soft-btn" onClick={stopTracking}>
                      Stop sharing
                    </button>
                  ) : (
                    <button className="solid-btn small" onClick={startTracking}>
                      Start live trip
                    </button>
                  ))}
              </div>
              <LiveHelpMap points={mapPoints} route />
            </section>
          )}
          {item.is_owner && offers.length > 0 && (
            <section className="offer-list">
              <h4>Help offers</h4>
              {offers.map((offer) => (
                <article key={offer.id}>
                  <div>
                    <b>{offer.helper_name}</b>
                    <p>{offer.message}</p>
                    <small>
                      {ago(offer.created_at)} · {human(offer.status)}
                    </small>
                  </div>
                  {offer.status === "PENDING" && item.status === "OPEN" && (
                    <button
                      className="solid-btn small"
                      onClick={async () => {
                        await act(
                          { action: "accept_offer", offerId: offer.id },
                          `${offer.helper_name}'s offer accepted`,
                        );
                        close();
                      }}
                    >
                      Accept offer
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          {!item.is_owner && !item.accepted_by && (
            <section className="offer-box">
              <h4>Can you help?</h4>
              <p>
                Tell the requester what you can provide. Your contact stays
                private until they accept.
              </p>
              <textarea
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                placeholder="e.g. I can deliver two food packets within 30 minutes."
                maxLength={500}
              />
              <button
                className="solid-btn"
                disabled={!!myOffer}
                onClick={() =>
                  act(
                    {
                      action: "offer_help",
                      id: item.id,
                      message: offerMessage,
                    },
                    "Your help offer was sent",
                  )
                }
              >
                {myOffer ? "Offer already sent" : "Offer this help →"}
              </button>
            </section>
          )}
          {item.is_owner && !item.accepted_by && item.status === "OPEN" && (
            <section className="request-owner-controls">
              <div>
                <b>No longer need help?</b>
                <p>
                  You can cancel this request or permanently delete it while no
                  helper is accepted.
                </p>
              </div>
              <span>
                <button
                  className="soft-btn"
                  onClick={async () => {
                    const result = await act(
                      { action: "cancel_request", id: item.id },
                      "Request cancelled and removed from the active feed",
                    );
                    if (result) close();
                  }}
                >
                  Cancel request
                </button>
                <button
                  className="soft-btn danger-text"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Permanently delete this request? This cannot be undone.",
                      )
                    )
                      return;
                    const result = await act(
                      { action: "delete_request", id: item.id },
                      "Request permanently deleted",
                    );
                    if (result) close();
                  }}
                >
                  Delete permanently
                </button>
              </span>
            </section>
          )}
          <div className="privacy-copy">
            ⌾ Exact location and contact details are protected until a help
            offer is accepted.
          </div>
          <h4>Status timeline</h4>
          <div className="status-timeline">
            {["OPEN", "ACCEPTED", "IN_PROGRESS", "RESOLVED"].map(
              (value, index, flow) => {
                const current = Math.max(0, flow.indexOf(item.status));
                return (
                  <div className={index <= current ? "done" : ""} key={value}>
                    <i>{index < current ? "✓" : index + 1}</i>
                    <span>
                      <b>{human(value)}</b>
                      <small>
                        {index === current
                          ? `Current · ${ago(item.updated_at)}`
                          : index < current
                            ? "Completed"
                            : "Pending"}
                      </small>
                    </span>
                  </div>
                );
              },
            )}
          </div>
          {activeMatch && (item.is_owner || item.is_helper) && (
            <>
              <h4>Update progress</h4>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Supplies are on the way…"
              />
              <div className="detail-actions">
                <select
                  defaultValue={item.status}
                  onChange={async (e) => {
                    await act(
                      {
                        action: "update_status",
                        id: item.id,
                        status: e.target.value,
                        note,
                      },
                      `${item.id} status updated`,
                    );
                  }}
                >
                  {["ACCEPTED", "IN_PROGRESS"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <button
            className="soft-btn danger-text"
            onClick={() =>
              act(
                {
                  action: "report",
                  id: item.id,
                  reason: "Submitted for human review from request details",
                },
                "Request sent for human review",
              )
            }
          >
            Report concern
          </button>
        </div>
      </section>
    </div>
  );
}

function AdjustResource({
  item,
  close,
  submit,
}: {
  item: Row;
  close: () => void;
  submit: (delta: number, note: string) => Promise<void>;
}) {
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState("");
  return (
    <div className="overlay" onMouseDown={close}>
      <section
        className="modal compact"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="overline">RESOURCE LEDGER</p>
            <h2>Adjust {item.name}</h2>
            <p>
              {item.quantity.toLocaleString()} {item.unit} currently available
            </p>
          </div>
          <button onClick={close}>×</button>
        </header>
        <div className="adjust-form">
          <label>
            Quantity change
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              placeholder="Use -50 for distribution"
            />
          </label>
          <label>
            Reason
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Distributed at Bellandur hub"
            />
          </label>
          <div className="projected">
            Projected balance{" "}
            <b>
              {item.quantity + delta} {item.unit}
            </b>
          </div>
          <div className="modal-actions">
            <button className="soft-btn" onClick={close}>
              Cancel
            </button>
            <button
              className="solid-btn"
              disabled={!delta || !note || item.quantity + delta < 0}
              onClick={() => submit(delta, note)}
            >
              Record transaction
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
function AddResource({
  close,
  submit,
}: {
  close: () => void;
  submit: (payload: Row) => Promise<void>;
}) {
  return (
    <div className="overlay" onMouseDown={close}>
      <section
        className="modal compact"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="overline">REAL COMMUNITY RESOURCE</p>
            <h2>List what you can provide</h2>
            <p>
              Post only supplies that are currently available. You remain
              responsible for keeping the quantity accurate.
            </p>
          </div>
          <button onClick={close}>×</button>
        </header>
        <form
          className="adjust-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <label>
            Resource name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Sealed food packets"
            />
          </label>
          <label>
            Category
            <select name="category">
              {categories.slice(1).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Available quantity
            <input
              name="quantity"
              type="number"
              min="1"
              max="1000000"
              required
            />
          </label>
          <label>
            Unit
            <input
              name="unit"
              required
              maxLength={30}
              placeholder="kits, meals, bottles…"
            />
          </label>
          <label>
            Pickup or service area
            <input
              name="publicArea"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Whitefield"
            />
          </label>
          <div className="privacy-copy">
            Your name, general area, resource, and quantity will be visible to
            signed-in users. Do not enter an exact home address.
          </div>
          <div className="modal-actions">
            <button type="button" className="soft-btn" onClick={close}>
              Cancel
            </button>
            <button className="solid-btn">Publish availability</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function CreateEvent({
  close,
  submit,
}: {
  close: () => void;
  submit: (payload: Row) => Promise<void>;
}) {
  return (
    <div className="overlay" onMouseDown={close}>
      <section
        className="modal compact"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="overline">DISASTER EVENT</p>
            <h2>Create response event</h2>
            <p>Group related requests, areas, partners, and resources.</p>
          </div>
          <button onClick={close}>×</button>
        </header>
        <form
          className="adjust-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <label>
            Event name
            <input
              name="name"
              required
              minLength={3}
              placeholder="e.g. Bengaluru Flood Response"
            />
          </label>
          <label>
            Affected areas
            <input
              name="areas"
              required
              placeholder="Whitefield, Bellandur, Marathahalli"
            />
          </label>
          <div className="privacy-copy">
            Creating an event does not automatically label any resident or
            request as fraudulent or unsafe.
          </div>
          <div className="modal-actions">
            <button type="button" className="soft-btn" onClick={close}>
              Cancel
            </button>
            <button className="solid-btn">Create active event</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>◎</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
