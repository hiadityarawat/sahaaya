"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- native navigation is an intentional reliability fallback */
import { type CSSProperties, FormEvent, useState } from "react";
import "./auth.css";
import "./auth-hardening.css";

type Mode = "login" | "register" | "forgot" | "reset" | "activate";

const copy = {
  login: ["Welcome back", "Sign in to coordinate help securely."],
  register: ["Create your account", "Join Sahaaya from any device."],
  forgot: ["Recover your account", "Check whether password recovery is available."],
  reset: ["Choose a new password", "Use your private recovery link to continue."],
  activate: ["Activate your existing account", "Choose a private Sahaaya password without losing your requests, history, or role."],
} as const;

function AnimatedName({ className, property = "--auth-letter" }: { className: string; property?: string }) {
  return (
    <strong className={className} aria-label="SAHAAYA">
      {"SAHAAYA".split("").map((letter, index) => (
        <i key={`${letter}-${index}`} style={{ [property]: index } as CSSProperties} aria-hidden="true">
          {letter}
        </i>
      ))}
    </strong>
  );
}

function AuthShowcase() {
  return (
    <div className="auth-showcase">
      <div className="auth-showcase-copy">
        <p>LIVE HELP · BEAUTIFULLY COORDINATED</p>
        <h1>Help begins with a trusted connection.</h1>
        <span>Securely match nearby needs with people ready to help—without revealing private details too early.</span>
      </div>
      <div className="auth-showcase-stage" aria-hidden="true">
        <span className="showcase-glow" />
        <span className="showcase-orbit showcase-orbit-one" />
        <span className="showcase-orbit showcase-orbit-two" />
        <div className="showcase-scene">
          <header>
            <span><i className="brand-logo-mark" /><b>SAHAAYA</b></span>
            <small><i /> NETWORK LIVE</small>
          </header>
          <div className="showcase-map">
            <span className="showcase-grid" />
            <span className="showcase-road road-one" />
            <span className="showcase-road road-two" />
            <span className="showcase-route"><i /></span>
            <article className="showcase-request request-medical">
              <i>＋</i><span><small>CRITICAL</small><b>Medical support</b><em>1.2 km away</em></span>
            </article>
            <article className="showcase-request request-food">
              <i>⌂</i><span><small>OPEN</small><b>Food supplies</b><em>8 people</em></span>
            </article>
            <article className="showcase-request request-match">
              <i>✓</i><span><small>MATCHED</small><b>Helper connected</b><em>ETA 12 min</em></span>
            </article>
            <span className="showcase-location"><i /> Your area</span>
          </div>
          <footer><span>3 verified needs nearby</span><b>Private until matched</b></footer>
        </div>
        <div className="showcase-caption"><i /> Live requests move from need to delivery</div>
      </div>
    </div>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const endpoint = mode === "register" ? "register" : mode === "forgot" ? "forgot-password" : mode === "reset" ? "reset-password" : mode === "activate" ? "claim-legacy" : "login";
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Please try again.");
      if (mode === "forgot") {
        setMessage(data.message || "Recovery request received.");
        return;
      }
      if (mode === "reset") {
        setMessage("Password updated. You can now sign in.");
        setTimeout(() => location.assign("/login"), 900);
        return;
      }
      location.assign("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`auth-shell auth-${mode}`}>
      <section className="auth-story">
        <a href="/" className="auth-brand" aria-label="Sahaaya home">
          <i className="brand-logo-mark" aria-hidden="true" />
          <span className="auth-brand-copy">
            <AnimatedName className="auth-brand-word" />
            <small>COMMUNITY HELP NETWORK</small>
          </span>
        </a>
        {mode === "login" ? <AuthShowcase /> : (
          <div className="auth-story-copy">
            <p>INDEPENDENT · PRIVATE · MULTI-DEVICE</p>
            <h1>Help begins with a trusted connection.</h1>
            <span>Your Sahaaya account belongs to Sahaaya—not another platform. Secure server sessions protect your identity across devices.</span>
          </div>
        )}
        <small className="auth-emergency">In a life-threatening emergency, contact local emergency services first.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="auth-kicker">SECURE ACCOUNT ACCESS</p>
          <h2>{copy[mode][0]}</h2>
          <p>{copy[mode][1]}</p>
          <form onSubmit={submit}>
            {mode === "register" && <label className="auth-honeypot" aria-hidden="true">Website<input name="website" autoComplete="off" tabIndex={-1} /></label>}
            {mode === "register" && <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>}
            {mode !== "reset" && mode !== "activate" && <label>Email address<input name="email" type="email" autoComplete="email" required /></label>}
            {mode === "reset" && <input type="hidden" name="token" value={typeof window !== "undefined" ? new URLSearchParams(location.search).get("token") ?? "" : ""} />}
            {(mode === "login" || mode === "register" || mode === "reset" || mode === "activate") && (
              <label>{mode === "reset" || mode === "activate" ? "New Sahaaya password" : "Password"}<span className="password-field"><input name="password" type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={128} required /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button></span></label>
            )}
            {(mode === "register" || mode === "reset" || mode === "activate") && <label>Confirm password<input name="confirmPassword" type={show ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required /><small>At least 10 characters with a letter and number.</small></label>}
            {mode === "activate" && <p className="auth-note">This one-time check uses the original signed-in identity only to prove that the existing Sahaaya profile belongs to you. Afterwards, your new Sahaaya password works independently on any device.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in securely" : mode === "register" ? "Create Sahaaya account" : mode === "forgot" ? "Check recovery availability" : mode === "activate" ? "Activate existing account" : "Update password"}</button>
          </form>
          <div className="auth-links">
            {mode === "login" && <><a href="/forgot-password">Forgot password?</a><span>Used Sahaaya before independent accounts? <a href="/activate-account">Activate your existing account</a></span><span>New here? <a href="/register">Create an account</a></span></>}
            {mode === "register" && <><span>Already registered? <a href="/login">Sign in</a></span><span>Have an older Sahaaya profile? <a href="/activate-account">Activate it safely</a></span></>}
            {(mode === "forgot" || mode === "reset" || mode === "activate") && <a href="/login">← Back to sign in</a>}
          </div>
        </div>
      </section>
    </main>
  );
}
