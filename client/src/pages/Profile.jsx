import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { apiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import Fld from '../components/Fld';
import Spinner from '../components/Spinner';
import { initials } from '../lib/format';
import { ROLE_LABEL } from '../lib/ui';

function Switch({ checked, onChange, label }) {
  return (
    <span className="sw">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <i />
    </span>
  );
}

function DutyCard({ user, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const OPTIONS = [['auto', 'Auto', 'Follow the schedule: Main 8 AM to 5 PM, Volunteers 7 to 9 PM, every day'], ['on', 'On duty', 'Available for new jobs right now'], ['off', 'Off duty', 'Do not assign me anything']];
  async function pick(mode) {
    setBusy(true);
    try { await api.patch('/auth/duty', { duty_override: mode }); await onChanged(); toast.success('Duty status updated'); }
    catch (err) { toast.error(apiError(err).message); } finally { setBusy(false); }
  }
  return (
    <div className="g">
      <div className="fl between">
        <h2>Duty status</h2>
        <span className="fl sm"><span className={`led${user.on_duty ? ' on' : ''}`} />{user.on_duty ? 'On duty now' : 'Off duty now'}</span>
      </div>
      <div className="stack">
        {OPTIONS.map(([mode, label, text]) => (
          <button type="button" key={mode} disabled={busy} className={`mode${user.duty_mode === mode ? ' on' : ''}`} onClick={() => pick(mode)} style={{ width: '100%' }}>
            <b>{label}</b><span className="mu sm">{text}</span>
          </button>
        ))}
      </div>
      {user.tier === 'Volunteer' && (
        <div className="mt">
          <div className="fl between sm"><span className="mu">Jobs this week</span><b>{user.week_count} / {user.weekly_cap}</b></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (user.week_count / user.weekly_cap) * 100)}%` }} /></div>
          <p className="mu tiny">Once you reach your weekly cap you are skipped by auto-assignment until the week rolls over.</p>
        </div>
      )}
    </div>
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

  if (!user || !form) return <Spinner />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveProfile(e) {
    e?.preventDefault();
    setFields({}); setBusy(true);
    try { await api.put('/auth/profile', form); await refresh(); toast.success('Profile updated'); }
    catch (err) { const { message, fields: f } = apiError(err); toast.error(message); setFields(f); }
    finally { setBusy(false); }
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
    } catch (err) { const { message, fields: f } = apiError(err); toast.error(message); setPwFields(f); }
    finally { setPwBusy(false); }
  }

  const pwSet = (k) => (e) => setPw((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <div className="g fl">
        <span className="avatar lg">{initials(user.name)}</span>
        <div>
          <h2 style={{ margin: 0 }}>{user.name}</h2>
          <span className="mu sm">{ROLE_LABEL[user.role](user)} · {user.hostel_room || user.location || user.email}</span>
        </div>
      </div>

      <div className="row2-1">
        <div>
          <form className="g" onSubmit={saveProfile}>
            <h2>Personal details</h2>
            <div className="row">
              <Fld id="p-name" label="Full name" error={fields.name}><input id="p-name" value={form.name} onChange={set('name')} required /></Fld>
              {user.role === 'requester' && <Fld id="p-cid" label="Student / staff ID" error={fields.college_id}><input id="p-cid" value={form.college_id} onChange={set('college_id')} placeholder="Taken from your college email" /></Fld>}
              <Fld id="p-email" label="Email"><input id="p-email" value={user.email} disabled /></Fld>
              <Fld id="p-phone" label="Phone" error={fields.phone}><input id="p-phone" value={form.phone} onChange={set('phone')} /></Fld>
              {user.role === 'requester' && (
                <>
                  <Fld id="p-room" label="Hostel / room" error={fields.hostel_room}><input id="p-room" value={form.hostel_room} onChange={set('hostel_room')} /></Fld>
                  <Fld id="p-prog" label="Programme" error={fields.programme}><input id="p-prog" value={form.programme} onChange={set('programme')} /></Fld>
                </>
              )}
              {user.role === 'technician' && (
                <>
                  <Fld id="p-loc" label="Base location" error={fields.location}><input id="p-loc" value={form.location} onChange={set('location')} /></Fld>
                  <Fld id="p-tier" label="Tier"><input id="p-tier" value={user.tier === 'Volunteer' ? 'Volunteer Technician' : 'Main Technician'} disabled /></Fld>
                  {user.tier === 'Volunteer' && <Fld id="p-gen" label="Gender (hostel matching)"><input id="p-gen" value={user.gender === 'F' ? 'Female' : user.gender === 'M' ? 'Male' : '—'} disabled /></Fld>}
                  <Fld id="p-spec" label="Specialty"><input id="p-spec" value={user.specialty || ''} disabled /></Fld>
                </>
              )}
            </div>
            <button type="submit" disabled={busy} className="btn">{busy ? 'Saving…' : 'Save changes'}</button>
          </form>

          {user.has_password ? (
          <form className="g" onSubmit={changePassword}>
            <h2>Change password</h2>
            <div className="row">
              <Fld id="pw-cur" label="Current password" error={pwFields.current_password}><input id="pw-cur" type="password" value={pw.current_password} onChange={pwSet('current_password')} required /></Fld>
              <Fld id="pw-new" label="New password" error={pwFields.new_password}><input id="pw-new" type="password" value={pw.new_password} onChange={pwSet('new_password')} placeholder="At least 8 characters" required /></Fld>
            </div>
            <Fld id="pw-conf" label="Confirm new password" error={pwFields.confirm}><input id="pw-conf" type="password" value={pw.confirm} onChange={pwSet('confirm')} required /></Fld>
            <button type="submit" disabled={pwBusy} className="btn s">{pwBusy ? 'Updating…' : 'Update password'}</button>
          </form>
          ) : (
          <div className="g"><h2>Sign-in</h2><p className="mu sm">You sign in with your college Google account, so there is no password to manage here.</p></div>
          )}
        </div>

        <div>
          {user.role === 'technician' && <DutyCard user={user} onChanged={refresh} />}

          <div className="g">
            <h2>Notification preferences</h2>
            <div className="trow">
              <div><b>Email notifications</b><div className="mu tiny">Request updates sent to your inbox</div></div>
              <Switch label="Email notifications" checked={form.email_notifications} onChange={(v) => setForm((f) => ({ ...f, email_notifications: v }))} />
            </div>
            <div className="trow">
              <div><b>In-app notifications</b><div className="mu tiny">Show alerts inside CampusCare</div></div>
              <Switch label="In-app notifications" checked={form.inapp_notifications} onChange={(v) => setForm((f) => ({ ...f, inapp_notifications: v }))} />
            </div>
            <button type="button" className="btn s xs mt" onClick={() => saveProfile()}>Save preferences</button>
          </div>

          {user.role === 'requester' && (
            <div className="g">
              <h2>Account summary</h2>
              <div className="kv"><span>Requests submitted</span><b>{user.summary?.submitted ?? 0}</b></div>
              <div className="kv"><span>Currently open</span><b>{user.summary?.open ?? 0}</b></div>
              <div className="kv"><span>Member since</span><b>{new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</b></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
