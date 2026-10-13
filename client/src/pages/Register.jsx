import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, Input, Select } from '../components/Field';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', college_id: '', phone: '', role: 'Student', password: '', confirm: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setFields({});
    if (form.password !== form.confirm) { setFields({ confirm: 'Passwords do not match' }); return; }
    setBusy(true);
    const res = await register({
      name: form.name, email: form.email, password: form.password, role: form.role,
      college_id: form.college_id, phone: form.phone,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); setFields(res.fields || {}); return; }
    setDone(true);
    setTimeout(() => navigate('/login'), 1800);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="g p-8 text-center max-w-sm rv">
          <div className="text-4xl mb-2">✅</div>
          <div className="font-bold text-lg">Account created</div>
          <p className="text-sm text-mu mt-1">Taking you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="g w-full max-w-lg p-8 rv">
        <Link to="/" className="flex items-center gap-2.5 mb-5">
          <img src="/logo.png" alt="" className="h-10 w-10 rounded-full" />
          <div className="leading-tight">
            <div className="font-extrabold lg">CMMS</div>
            <div className="text-[10px] tracking-wide text-mu">College of Science &amp; Technology</div>
          </div>
        </Link>
        <h1 className="text-2xl font-extrabold">Create your account</h1>
        <p className="text-sm text-mu mt-1">For students, staff and faculty reporting maintenance issues.</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Field label="Full name" error={fields.name}><Input value={form.name} onChange={set('name')} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="I am a" error={fields.role}>
              <Select value={form.role} onChange={set('role')}>
                <option>Student</option>
                <option>Staff</option>
                <option>Faculty</option>
              </Select>
            </Field>
            <Field label="College ID (optional)" error={fields.college_id}><Input value={form.college_id} onChange={set('college_id')} placeholder="0223xxxx" /></Field>
          </div>
          <Field label="Email" error={fields.email}><Input type="email" value={form.email} onChange={set('email')} placeholder="0223xxxx.cst@rub.edu.bt" required /></Field>
          <Field label="Phone (optional)" error={fields.phone}><Input value={form.phone} onChange={set('phone')} placeholder="+975 17xxxxxx" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password" error={fields.password}><Input type="password" value={form.password} onChange={set('password')} required /></Field>
            <Field label="Confirm password" error={fields.confirm}><Input type="password" value={form.confirm} onChange={set('confirm')} required /></Field>
          </div>

          {error && <p className="text-sm rd rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--rd) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--rd) 30%, transparent)' }}>{error}</p>}

          <button type="submit" disabled={busy} className="btn w-full py-2.5">{busy ? 'Creating account…' : 'Create account'}</button>
          <p className="text-center text-xs text-mu">Already have an account? <Link to="/login" className="cy font-semibold">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
