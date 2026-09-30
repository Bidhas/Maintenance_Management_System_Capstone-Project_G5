import { useState } from "react";
import "./LoginPage.css";

const ROLES = ["Student", "Teacher", "Technician", "Admin"];

// Placeholder activity feed for the brand panel — swap this out for a
// real "recent activity" API call once the backend exists.
const SAMPLE_TICKETS = [
  { id: "WO-0231", text: "Ceiling fan not spinning · Hostel C", meta: "08:12", color: "var(--rust)" },
  { id: "WO-0229", text: "AC unit leaking · Hostel B", meta: "In progress", color: "var(--teal)" },
  { id: "WO-0221", text: "Window latch fixed · Block B", meta: "Completed", color: "var(--moss)" },
];

export default function LoginPage({ onLogin }) {
  const [role, setRole] = useState("Student");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError("Enter your college ID/email and password to continue.");
      return;
    }

    setSubmitting(true);
    try {
      // ---- BACKEND INTEGRATION POINT -----------------------------------
      // Replace this block with a real call once the auth API exists, e.g.
      //
      //   const res = await fetch("/api/auth/login", {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({ role, identifier, password, remember }),
      //   });
      //   if (!res.ok) throw new Error("Invalid credentials");
      //   const { token, user } = await res.json();
      //   // store token, redirect to the dashboard for `user.role`
      //
      // For now this just hands the form data up to whatever the parent
      // wants to do with it (e.g. fake-navigate during frontend dev).
      await new Promise((resolve) => setTimeout(resolve, 400)); // fake latency
      onLogin?.({ role, identifier, password, remember });
      // --------------------------------------------------------------------
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-app">
      {/* ---------------- LEFT BRAND PANEL ---------------- */}
      <div className="brand">
        <div className="brand-mark">
          <svg width="34" height="34" viewBox="0 0 30 30" fill="none">
            <rect x="1" y="1" width="28" height="28" stroke="#ECEFEA" strokeWidth="1.4" />
            <path d="M9 20 L15 9 L21 20" stroke="#E2A33B" strokeWidth="2" strokeLinejoin="round" fill="none" />
            <circle cx="15" cy="15.3" r="2.2" fill="#ECEFEA" />
          </svg>
          <div>
            <div className="brand-mark-text">CMMS</div>
            <div className="brand-mark-sub">FACILITY OPS</div>
          </div>
        </div>

        <div className="brand-headline">Report it once. Track it to done.</div>
        <div className="brand-copy">
          One system for hostel, classroom, and office maintenance — from the
          moment a fault is logged to the moment it's fixed.
        </div>

        <div className="brand-stats">
          <div className="bs-cell">
            <div className="bs-num">4</div>
            <div className="bs-label">BLOCKS COVERED</div>
          </div>
          <div className="bs-cell">
            <div className="bs-num">18</div>
            <div className="bs-label">TECHNICIANS</div>
          </div>
          <div className="bs-cell">
            <div className="bs-num">1.2K</div>
            <div className="bs-label">REQUESTS RESOLVED</div>
          </div>
        </div>

        <div className="brand-tickets">
          {SAMPLE_TICKETS.map((t) => (
            <div className="bt-row" key={t.id}>
              <span className="bt-dot" style={{ background: t.color }} />
              <span className="bt-text">
                {t.id} · {t.text}
              </span>
              <span className="bt-time">{t.meta}</span>
            </div>
          ))}
        </div>

        <div className="brand-footer">[INSTITUTION NAME] · DEPARTMENT OF [DEPARTMENT]</div>
      </div>

      {/* ---------------- RIGHT FORM PANEL ---------------- */}
      <div className="form-side">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-eyebrow">SIGN IN</div>
          <div className="login-title">Welcome back</div>
          <div className="login-sub">Select your role and sign in to continue.</div>

          <div className="role-picker" role="tablist" aria-label="Select role">
            {ROLES.map((r) => (
              <div
                key={r}
                role="tab"
                aria-selected={role === r}
                tabIndex={0}
                className={`role-opt${role === r ? " sel" : ""}`}
                onClick={() => setRole(r)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setRole(r)}
              >
                {r}
              </div>
            ))}
          </div>

          <div className="l-field">
            <label htmlFor="identifier">COLLEGE ID OR EMAIL</label>
            <input
              id="identifier"
              type="text"
              placeholder="e.g. 0223xxxx@college.bt"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="l-field">
            <label htmlFor="password">PASSWORD</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="l-error">{error}</div>}

          <div className="l-row">
            <label className="l-remember">
              <input
                type="checkbox"
                className="l-checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="box" aria-hidden="true">
                {remember && <span className="box-tick" />}
              </span>
              Keep me signed in
            </label>
            <a className="l-forgot" href="#forgot-password">
              Forgot password?
            </a>
          </div>

          <button className="btn-signin" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <div className="login-foot">
            New here? Contact your hostel warden or admin office for an account.
          </div>
        </form>
      </div>
    </div>
  );
}
