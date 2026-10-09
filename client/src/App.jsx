import { useState, useEffect } from "react";
import { api, toast } from "./api";
import { Toaster, Modal, form, run, fd } from "./ui";
import Requester from "./Requester";
import Tech from "./Tech";
import Admin from "./Admin";
const RL = {
  admin: "Admin",
  req: "Requester",
  main: "Main Tech",
  vol: "Volunteer",
};
const FEAT = [
  ["On/off duty", "7–9 PM weekdays + weekends, with manual override."],
  ["Workload caps", "Weekly limit per volunteer; Admin capacity alerts."],
  ["Reopen", "Same ticket, full history, no duplicates."],
  ["Audit log", "Immutable, Admin-only record of admin actions."],
];
function Auth({ mode, go, done }) {
  const L = mode == "login",
    [pw, setPw] = useState(""),
    [show, setShow] = useState(false),
    [pre, setPre] = useState(""),
    s = (pw.length >= 8) + /[A-Z]/.test(pw) + /\d/.test(pw) + /[^\w]/.test(pw);
  const submit = form(async (d, f) => {
    if (!L && d.password != d.p2)
      return toast("Passwords do not match", "var(--rd)");
    try {
      done(
        await api(L ? "/auth/login" : "/auth/signup", {
          method: "POST",
          body: d,
        }),
      );
    } catch (e) {
      f.classList.remove("sk");
      void f.offsetWidth;
      f.classList.add("sk");
      toast(e.message, "var(--rd)");
    }
  });
  return (
    <div
      className="rv"
      style={{ display: "grid", placeItems: "center", minHeight: "70vh" }}
    >
      <div className="g" style={{ width: "min(430px,100%)" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/logo.png" width="70" style={{ borderRadius: "50%" }} />
          <h2 className="lg mt">
            {L ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mu sm">
            {L
              ? "Log in to your personal dashboard"
              : "Requester account for students, teachers & staff"}
          </p>
        </div>
        <form onSubmit={submit}>
          {!L && (
            <>
              <label>Full name</label>
              <input name="name" required />
              <div className="row">
                <div>
                  <label>I am a</label>
                  <select name="note">
                    <option>Student</option>
                    <option>Teacher</option>
                    <option>Staff</option>
                  </select>
                </div>
                <div>
                  <label>Phone</label>
                  <input name="phone" required pattern="[0-9+ ]{7,15}" />
                </div>
              </div>
            </>
          )}
          <label>Email</label>
          <input
            name="email"
            type="email"
            required
            key={pre}
            defaultValue={pre}
          />
          <label>Password</label>
          <div style={{ position: "relative" }}>
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={L ? 1 : 8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        style={styles.iconButton}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? (
          // Eye Off SVG Icon
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        ) : (
          // Eye SVG Icon
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        )}
      </button>
    </div>
          {!L && (
            <>
              <div className="bar mt">
                <i
                  style={{
                    width: s * 25 + "%",
                    background: [
                      "var(--rd)",
                      "var(--rd)",
                      "var(--am)",
                      "var(--ac)",
                      "var(--gr)",
                    ][s],
                  }}
                />
              </div>
              <label>Confirm password</label>
              <input name="p2" type="password" required />
            </>
          )}
          <button className="btn mt" style={{ width: "100%" }}>
            {L ? "Log in" : "Sign up"} →
          </button>
        </form>
        <p className="sm mu mt" style={{ textAlign: "center" }}>
          {L ? (
            <>
              New here?{" "}
              <a
                href="#"
                style={{ color: "var(--ac)" }}
                onClick={(e) => {
                  e.preventDefault();
                  go("signup");
                }}
              >
                Create an account
              </a>
            </>
          ) : (
            <>
              Already registered?{" "}
              <a
                href="#"
                style={{ color: "var(--ac)" }}
                onClick={(e) => {
                  e.preventDefault();
                  go("login");
                }}
              >
                Log in
              </a>
            </>
          )}
        </p>
        {L && (
          <div className="mt sm mu">
            <b>Demo accounts</b> · password <code>Demo@1234</code> (run db:init
            first)
            <div className="fl mt">
              {[
                ["dorji", "Admin"],
                ["tashi", "Requester"],
                ["pema", "Main tech"],
                ["dechen", "Volunteer"],
              ].map(([e, n]) => (
                <button
                  type="button"
                  key={e}
                  className="btn s xs"
                  onClick={() => {
                    setPre(e + "@cst.edu.bt");
                    setPw("Demo@1234");
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default function App() {
  const [u, setU] = useState(null),
    [v, setV] = useState("home"),
    [bell, setBell] = useState(null),
    [acct, setAcct] = useState(false),
    [n, setN] = useState(0),
    [ready, setReady] = useState(false);
  useEffect(() => {
    localStorage.t
      ? api("/me")
          .then((x) => {
            setU(x);
            setV("app");
          })
          .catch(() => localStorage.removeItem("t"))
          .finally(() => setReady(true))
      : setReady(true);
  }, []);
  useEffect(() => {
    if (!u) return;
    const f = () =>
      api("/notifications/unread")
        .then((x) => setN(x.n))
        .catch(() => {});
    f();
    const i = setInterval(f, 15000);
    return () => clearInterval(i);
  }, [u]);
  const login = ({ token, user }) => {
      localStorage.t = token;
      setU(user);
      setV("app");
      toast("Welcome, " + user.name.split(" ")[0]);
    },
    out = () => {
      localStorage.removeItem("t");
      setU(null);
      setV("home");
      setBell(null);
    };
  const openBell = async () => {
    if (bell) return setBell(null);
    setBell(await api("/notifications"));
    api("/notifications/read", { method: "POST" }).then(() => setN(0));
  };
  const saveAcct = form(async (d) => {
    const r = await run(
      api("/me", {
        method: "PATCH",
        body: {
          name: d.name,
          phone: d.phone,
          currentPassword: d.c,
          newPassword: d.p,
        },
      }),
      "Account updated",
    );
    if (r && r !== true) {
      setU(r);
    }
    if (r) setAcct(false);
  });
  if (!ready) return null;
  return (
    <>
      <header className="g">
        <div className="brand" onClick={() => setV("home")}>
          <img src="/logo.png" alt="logo" />
          <div className="lg">
            CMMS<small>College of Science &amp; Technology</small>
          </div>
        </div>
        <div className="sp" />
        {u ? (
          <>
            {v != "app" && (
              <button className="btn xs" onClick={() => setV("app")}>
                Dashboard
              </button>
            )}
            <button className="btn s xs" onClick={openBell}>
              🔔{n > 0 && <span className="dot">{n}</span>}
            </button>
            <button className="btn s xs" onClick={() => setAcct(true)}>
              <b>{u.name.split(" ")[0]}</b> · {RL[u.role]}
            </button>
            <button className="btn xs" onClick={out}>
              Log out
            </button>
          </>
        ) : (
          <>
            <button className="btn s xs" onClick={() => setV("login")}>
              Log in
            </button>
            <button className="btn xs" onClick={() => setV("signup")}>
              Sign up
            </button>
          </>
        )}
      </header>
      {bell && (
        <div id="pn" className="g on">
          <h3>Notifications</h3>
          {bell.notes.map((x) => (
            <div className="nt" key={x.id}>
              {x.body}
              <br />
              <span className="mu sm">{fd(x.created_at)}</span>
            </div>
          ))}
          {!bell.notes.length && <p className="mu sm">Nothing yet.</p>}
          {bell.sms.map((x) => (
            <div className="nt" key={x.id}>
              {x.body}
              <br />
              <span
                className={
                  "chip " +
                  (x.status == "Delivered"
                    ? "gr2"
                    : x.status == "Failed"
                      ? "rd"
                      : "am")
                }
              >
                {x.status}
              </span>
            </div>
          ))}
        </div>
      )}
      <main key={v}>
        {v == "login" || v == "signup" ? (
          <Auth mode={v} go={setV} done={login} />
        ) : v == "app" && u ? (
          <div className="rv">
            {u.role == "req" ? (
              <Requester user={u} />
            ) : u.role == "admin" ? (
              <Admin user={u} />
            ) : (
              <Tech user={u} />
            )}
          </div>
        ) : (
          <div className="rv">
            <section className="hero">
              <img src="/logo.png" alt="" />
              <h1>
                Fix it <span>faster.</span>
                <br />
                Campus-wide.
              </h1>
              <p>
                The College Maintenance Management System auto-routes every
                request to the right technician — by location, specialization,
                gender-matched hostel volunteers and live duty status.
              </p>
              <div
                className="fl"
                style={{ justifyContent: "center", marginTop: 24 }}
              >
                {u ? (
                  <button className="btn" onClick={() => setV("app")}>
                    Open my dashboard →
                  </button>
                ) : (
                  <>
                    <button className="btn" onClick={() => setV("login")}>
                      Log in
                    </button>
                    <button className="btn s" onClick={() => setV("signup")}>
                      Create account
                    </button>
                  </>
                )}
              </div>
            </section>
            <div className="gr">
              {FEAT.map((f) => (
                <div className="g" data-tilt key={f[1]}>
                  <div className="ic">{f[0]}</div>
                  <h3>{f[1]}</h3>
                  <p className="mu sm">{f[2]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      {acct && (
        <Modal close={() => setAcct(false)}>
          <h2>My account</h2>
          <p className="mu sm">
            {u.email} · {RL[u.role]}
          </p>
          <form onSubmit={saveAcct}>
            <label>Name</label>
            <input name="name" defaultValue={u.name} required />
            <label>Phone</label>
            <input
              name="phone"
              defaultValue={u.phone}
              required
              pattern="[0-9+ ]{7,15}"
            />
            <label>Current password (only to change it)</label>
            <input name="c" type="password" />
            <label>New password</label>
            <input name="p" type="password" minLength={8} />
            <button className="btn mt">Save</button>
          </form>
        </Modal>
      )}
      <Toaster />
    </>
  );
}
