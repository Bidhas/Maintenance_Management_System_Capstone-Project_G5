import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { apiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Field, Input, Select } from '../components/Field';
import { initials } from '../lib/format';

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${checked ? 'bg-good' : 'bg-black/15'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwFields, setPwFields] = useState({});
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name, phone: user.phone || '',
      college_id: user.college_id || '', programme: user.programme || '', hostel_room: user.hostel_room || '',
      location: user.location || '', availability: user.availability || 'Available',
      email_notifications: user.email_notifications ?? true, inapp_notifications: user.inapp_notifications ?? true,
    });
  }, [user]);

  if (!user || !form) return <div className="skeleton h-64 rounded-xl" />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveProfile(e) {
    e.preventDefault();
    setFields({}); setBusy(true);
    try {
      await api.put('/auth/profile', form);
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      const { message, fields: f } = apiError(err);
      toast.error(message); setFields(f);
    } finally { setBusy(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwFields({});
    if (pw.new_password !== pw.confirm) { setPwFields({ confirm: 'Passwords do not match' }); return; }
    setPwBusy(true);
    try {
      await api.put('/auth/password', { current_password: pw.current_password, new_password: pw.new_password });
      toast.success('Password updated');
      setPw({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      const { message, fields: f } = apiError(err);
      toast.error(message); setPwFields(f);
    } finally { setPwBusy(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Profile</h1>
      <p className="text-sm text-ink/55 mt-0.5">Account settings</p>

      <div className="card p-5 mt-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-amber text-ink font-bold text-lg flex items-center justify-center shrink-0">{initials(user.name)}</div>
        <div>
          <div className="font-bold text-lg">{user.name}</div>
          <div className="text-xs text-ink/50 uppercase tracking-wide mt-0.5">
            {user.role === 'requester' ? user.account_type : user.role === 'technician' ? 'Technician' : user.designation} · {user.hostel_room || user.location || user.email}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 mt-5">
        <div className="space-y-5">
          <form onSubmit={saveProfile} className="card p-6">
            <h2 className="font-bold mb-4">Personal details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full name" error={fields.name}><Input value={form.name} onChange={set('name')} required /></Field>
              {user.role === 'requester' && <Field label="Student ID" error={fields.college_id}><Input value={form.college_id} onChange={set('college_id')} /></Field>}
              <Field label="Email"><Input value={user.email} disabled /></Field>
              <Field label="Phone" error={fields.phone}><Input value={form.phone} onChange={set('phone')} /></Field>
              {user.role === 'requester' && (
                <>
                  <Field label="Hostel / Room" error={fields.hostel_room}><Input value={form.hostel_room} onChange={set('hostel_room')} /></Field>
                  <Field label="Programme" error={fields.programme}><Input value={form.programme} onChange={set('programme')} /></Field>
                </>
              )}
              {user.role === 'technician' && (
                <>
                  <Field label="Base location" error={fields.location}><Input value={form.location} onChange={set('location')} /></Field>
                  <Field label="Tier"><Input value={user.tier === 'Volunteer' ? 'Volunteer Technician' : 'Main Technician'} disabled /></Field>
                  {user.tier === 'Volunteer' && <Field label="Gender (hostel matching)"><Input value={user.gender === 'F' ? 'Female' : user.gender === 'M' ? 'Male' : '—'} disabled /></Field>}
                  <Field label="Specialty" className={user.tier === 'Volunteer' ? '' : 'col-span-2'}><Input value={user.specialty} disabled /></Field>
                </>
              )}
            </div>
            <div className="flex justify-end mt-5">
              <button type="submit" disabled={busy} className="btn-accent">{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>

          <form onSubmit={changePassword} className="card p-6">
            <h2 className="font-bold mb-4">Change password</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current password" error={pwFields.current_password}>
                <Input type="password" value={pw.current_password} onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} required />
              </Field>
              <Field label="New password" error={pwFields.new_password}>
                <Input type="password" value={pw.new_password} onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} placeholder="At least 8 characters" required />
              </Field>
              <Field label="Confirm new password" error={pwFields.confirm} className="col-span-2">
                <Input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} required />
              </Field>
            </div>
            <div className="flex justify-end mt-5">
              <button type="submit" disabled={pwBusy} className="btn-outline">{pwBusy ? 'Updating…' : 'Update password'}</button>
            </div>
          </form>
        </div>

        <div className="space-y-5">
          {user.role === 'technician' && <DutyCard user={user} onChanged={refresh} />}

          <div className="card p-5">
            <h2 className="font-bold mb-3">Notification preferences</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-semibold">Email notifications</div><div className="text-[11px] text-ink/45">Request updates sent to your inbox</div></div>
                <Toggle checked={form.email_notifications} onChange={(v) => setForm((f) => ({ ...f, email_notifications: v }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-semibold">In-app notifications</div><div className="text-[11px] text-ink/45">Show alerts inside CMMS</div></div>
                <Toggle checked={form.inapp_notifications} onChange={(v) => setForm((f) => ({ ...f, inapp_notifications: v }))} />
              </div>
            </div>
            <button onClick={saveProfile} className="btn-outline btn-sm w-full mt-4">Save preferences</button>
          </div>

          {user.role === 'requester' && (
            <div className="card p-5">
              <h2 className="font-bold mb-3">Account summary</h2>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-ink/55">Requests submitted:</span><span className="font-semibold">{user.summary?.submitted ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-ink/55">Currently open:</span><span className="font-semibold">{user.summary?.open ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-ink/55">Member since:</span><span className="font-semibold">{new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DutyCard({ user, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const OPTIONS = [['auto', 'Auto', 'Follow the schedule: weekday 7–9 PM and weekends'], ['on', 'On duty', 'Available for new jobs right now'], ['off', 'Off duty', 'Do not assign me anything']];

  async function pick(mode) {
    setBusy(true);
    try { await api.patch('/auth/duty', { duty_override: mode }); await onChanged(); toast.success('Duty status updated'); }
    catch (err) { toast.error(apiError(err).message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">Duty status</h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${user.on_duty ? 'bg-good' : 'bg-white/30'}`} />{user.on_duty ? 'On duty now' : 'Off duty now'}</span>
      </div>
      <div className="space-y-2">
        {OPTIONS.map(([mode, label, text]) => (
          <button key={mode} disabled={busy} onClick={() => pick(mode)} className="tk w-full text-left" style={{ marginBottom: 0, ...(user.duty_mode === mode ? { borderColor: 'var(--ac)' } : {}) }}>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-mu">{text}</div>
          </button>
        ))}
      </div>
      {user.tier === 'Volunteer' && (
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1"><span className="text-mu">Jobs this week</span><span className="font-semibold">{user.week_count} / {user.weekly_cap}</span></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (user.week_count / user.weekly_cap) * 100)}%` }} /></div>
          <p className="text-[11px] text-mu mt-1.5">Once you reach your weekly cap you are skipped by auto-assignment until the week rolls over.</p>
        </div>
      )}
    </div>
  );
}
