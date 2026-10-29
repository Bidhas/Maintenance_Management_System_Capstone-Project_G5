import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Field, Input } from '../components/Field';
import GoogleButton from '../components/GoogleButton';
import { dashboardPath } from '../lib/paths';

/**
 * Sign-in page. The main (and for students/staff the ONLY) way in is "Continue with Google" using the
 * college account. Admin / technician accounts may also have a password fallback, shown only when the
 * server says it is enabled (ALLOW_PASSWORD_LOGIN) — see GET /api/auth/config.
 */
export default function Login() {
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [cfg, setCfg] = useState(null); // { googleClientId, passwordLogin, domain }
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/config').then((r) => setCfg(r.data)).catch(() => setCfg({ googleClientId: null, passwordLogin: true, domain: 'rub.edu.bt' }));
  }, []);

  if (user) return <Navigate to={dashboardPath(user)} replace />;

  const fail = (message) => { setError(message); setShake(true); setTimeout(() => setShake(false), 450); };
  const done = (res) => navigate(location.state?.from || dashboardPath(res.user), { replace: true });

  async function onGoogle(credential) {
    setError(''); setBusy(true);
    const res = await loginWithGoogle(credential);
    setBusy(false);
    if (!res.ok) return fail(res.message);
    done(res);
  }

  async function onPassword(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const res = await login({ role, identifier: identifier.trim(), password, remember: true });
    setBusy(false);
    if (!res.ok) return fail(res.message);
    done(res);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className={`g w-full max-w-md p-8 rv ${shake ? 'sk' : ''}`}>
        <Link to="/" className="flex items-center gap-2.5 mb-6">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-full" />
          <div className="leading-tight">
            <div className="font-extrabold lg">CMMS</div>
            <div className="text-[10px] tracking-wide text-mu">College of Science &amp; Technology</div>
          </div>
        </Link>

        <h1 className="text-2xl font-extrabold">Welcome</h1>
        <p className="text-sm text-mu mt-1">Sign in with your college Google account. No registration needed.</p>

        <div className="mt-6">
          {!cfg ? <p className="text-sm text-mu">Loading…</p> : cfg.googleClientId ? (
            <GoogleButton clientId={cfg.googleClientId} hostedDomain={cfg.domain} onCredential={onGoogle} />
          ) : (
            <p className="text-sm rd">Google sign-in is not configured on this server yet (GOOGLE_CLIENT_ID is missing).</p>
          )}
          {busy && <p className="text-center text-xs text-mu mt-3">Signing you in…</p>}
        </div>

        {error && <p className="text-sm rd rounded-xl px-3 py-2 mt-4" style={{ background: 'color-mix(in srgb, var(--rd) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--rd) 30%, transparent)' }}>{error}</p>}

        <p className="text-center text-xs text-mu mt-5">
          Students use <b>02250345.cst@{cfg?.domain || 'rub.edu.bt'}</b>, teachers and staff use <b>yourname.cst@{cfg?.domain || 'rub.edu.bt'}</b>. Other accounts are not allowed.
        </p>

        {cfg?.passwordLogin && (
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--bd, rgba(255,255,255,.12))' }}>
            <button type="button" className="text-xs text-mu underline" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Hide' : 'Admin / technician password sign-in'}
            </button>
            {showPw && (
              <form onSubmit={onPassword} className="mt-4 space-y-4">
                <div className="tabs">
                  {[['admin', 'Admin'], ['technician', 'Technician']].map(([k, label]) => (
                    <button key={k} type="button" className={role === k ? 'on' : ''} onClick={() => { setRole(k); setError(''); }}>{label}</button>
                  ))}
                </div>
                <Field label="Email"><Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={`you@${cfg.domain}`} required /></Field>
                <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></Field>
                <button type="submit" disabled={busy} className="btn w-full py-2.5">{busy ? 'Signing in…' : 'Sign in'}</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
