import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, Input } from '../components/Field';
import { dashboardPath } from '../lib/paths';

const ROLES = [
  { key: 'requester', label: 'Student / Staff' },
  { key: 'technician', label: 'Technician' },
  { key: 'admin', label: 'Admin' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState('requester');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={dashboardPath(user)} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await login({ role, identifier: identifier.trim(), password, remember });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setShake(true);
      setTimeout(() => setShake(false), 450);
      return;
    }
    navigate(location.state?.from || dashboardPath(res.user), { replace: true });
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

        <h1 className="text-2xl font-extrabold">Welcome back</h1>
        <p className="text-sm text-mu mt-1">Select your role and sign in to continue.</p>

        <div className="tabs mt-5">
          {ROLES.map((r) => (
            <button key={r.key} type="button" className={role === r.key ? 'on' : ''} onClick={() => { setRole(r.key); setError(''); }}>
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Field label={role === 'requester' ? 'College ID or Email' : 'Email'}>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={role === 'requester' ? '0223xxxx or you@rub.edu.bt' : 'you@college.bt'} autoFocus required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </Field>

          {error && <p className="text-sm rd rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--rd) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--rd) 30%, transparent)' }}>{error}</p>}

          <label className="flex items-center gap-2 text-sm text-mu normal-case tracking-normal font-normal" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 'auto' }} />
            Keep me signed in
          </label>

          <button type="submit" disabled={busy} className="btn w-full py-2.5">{busy ? 'Signing in…' : 'Sign in'}</button>

          <p className="text-center text-xs text-mu">
            {role === 'requester' ? (
              <>New here? <Link to="/register" className="cy font-semibold">Create an account</Link></>
            ) : (
              'Contact the admin office for a technician or admin account.'
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
