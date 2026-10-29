import { useState } from 'react';
import api, { apiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useAsync from '../../hooks/useAsync';
import Fld from '../../components/Fld';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

const TABS = ['Locations', 'Categories', 'Notifications', 'Demo clock', 'Account'];

export default function Settings() {
  const [tab, setTab] = useState('Locations');
  return (
    <>
      <h1>Settings</h1>
      <p className="mu">Manage CampusCare system configuration.</p>
      <div className="fl tabs" role="tablist">
        {TABS.map((t) => (
          <button type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)} className={`chip${tab === t ? ' sel' : ''}`}>{t}</button>
        ))}
      </div>
      {tab === 'Locations' && <LocationsTab />}
      {tab === 'Categories' && <CategoriesTab />}
      {tab === 'Notifications' && <NotificationsTab />}
      {tab === 'Demo clock' && <ClockTab />}
      {tab === 'Account' && <AccountTab />}
    </>
  );
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <span className="sw">
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </span>
  );
}

function LocationsTab() {
  const toast = useToast();
  const { data: blocks, error, loading, reload } = useAsync(() => api.get('/blocks').then((r) => r.data.blocks), []);
  const [name, setName] = useState('');
  const [isHostel, setIsHostel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nb, setNb] = useState({}); // blockId -> { name, gender }
  const [nr, setNr] = useState({}); // blockId -> { building_id, rooms, student }  (bulk-add rooms form)
  const addRooms = (b) => {
    const v = nr[b.id] || {};
    if (!v.rooms?.trim()) return Promise.resolve();
    return attempt(async () => {
      await api.post(`/blocks/${b.id}/rooms`, { building_id: v.building_id ? Number(v.building_id) : undefined, rooms: v.rooms, student_visible: !!v.student });
      setNr((m) => ({ ...m, [b.id]: {} }));
    }, 'Rooms added');
  };

  const attempt = async (fn, msg) => {
    try { await fn(); if (msg) toast.success(msg); reload(); } catch (err) { toast.error(apiError(err).message); }
  };
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await attempt(async () => { await api.post('/blocks', { name: name.trim(), is_hostel: isHostel }); setName(''); setIsHostel(false); }, 'Block added');
    setBusy(false);
  }
  const addBuilding = (b) => {
    const v = nb[b.id] || {};
    if (!v.name?.trim()) return Promise.resolve();
    return attempt(async () => {
      await api.post(`/blocks/${b.id}/buildings`, { name: v.name.trim(), gender: b.is_hostel ? v.gender || undefined : undefined });
      setNb((m) => ({ ...m, [b.id]: {} }));
    }, 'Building added');
  };

  return (
    <div className="g">
      <h2>Blocks and buildings</h2>
      <p className="mu sm">
        These build the location drop-downs on the request form: block, then floor or group, then room. Hostel floors carry a gender (used to match volunteers).
        Students only see hostel rooms and rooms flagged "Students can report" (classrooms). Rooms starting with K (e.g. K101) are kitchens.
      </p>

      <div className="qrow" style={{ marginBottom: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New block name" aria-label="New block name" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <label className="inline"><span className="sw"><input type="checkbox" checked={isHostel} onChange={(e) => setIsHostel(e.target.checked)} aria-label="This block is a hostel" /><i /></span> Hostel</label>
        <button type="button" className="btn" disabled={busy} onClick={add}>Add block</button>
      </div>

      {loading && !blocks ? <Spinner /> : error && !blocks ? <ErrorBox message={error} onRetry={reload} /> : blocks.map((b) => (
        <div key={b.id} className="block-card">
          <div className="head">
            <b>{b.name}</b>
            {b.is_hostel && <span className="chip vi">Hostel</span>}
            <span className="mu tiny">{b.room_total} room(s)</span>
            <span className="sp" />
            <button type="button" className="btn s xs" onClick={() => attempt(() => api.put(`/blocks/${b.id}`, { name: b.name, hostels: b.hostels, rooms: b.rooms_declared ?? 0, is_hostel: !b.is_hostel }))}>{b.is_hostel ? 'Make non-hostel' : 'Make hostel'}</button>
            <button type="button" className="btn d xs" onClick={() => attempt(() => api.delete(`/blocks/${b.id}`), 'Block removed')}>Remove</button>
          </div>
          {(b.is_hostel || b.buildings.length > 0) && (
            <>
              <div className="fl mt">
                {b.buildings.map((bd) => (
                  <span key={bd.id} className={`chip ${bd.gender === 'F' ? 'rd' : bd.gender === 'M' ? 'cy' : 'mu'}`}>
                    {bd.name}{bd.gender ? ` · ${bd.gender === 'F' ? 'Female' : 'Male'}` : ''}
                    <button type="button" className="x-btn" aria-label={`Remove ${bd.name}`} onClick={() => attempt(() => api.delete(`/blocks/buildings/${bd.id}`), 'Building removed')}>×</button>
                  </span>
                ))}
                {b.buildings.length === 0 && <span className="mu tiny">No buildings yet.</span>}
              </div>
              <div className="qrow">
                <input placeholder="Add a building (e.g. Wing 1)" aria-label={`Add a building to ${b.name}`} value={nb[b.id]?.name || ''}
                  onChange={(e) => setNb((m) => ({ ...m, [b.id]: { ...m[b.id], name: e.target.value } }))} onKeyDown={(e) => e.key === 'Enter' && addBuilding(b)} />
                {b.is_hostel && (
                  <select className="w-sm" aria-label="Building gender" value={nb[b.id]?.gender || ''} onChange={(e) => setNb((m) => ({ ...m, [b.id]: { ...m[b.id], gender: e.target.value } }))}>
                    <option value="">Gender</option><option value="M">Male</option><option value="F">Female</option>
                  </select>
                )}
                <button type="button" className="btn s xs" onClick={() => addBuilding(b)}>Add building</button>
              </div>
            </>
          )}
          <div className="qrow">
            <select className="w-sm" aria-label={`Floor or group for new rooms in ${b.name}`} value={nr[b.id]?.building_id || ''} onChange={(e) => setNr((m) => ({ ...m, [b.id]: { ...m[b.id], building_id: e.target.value } }))}>
              <option value="">{b.buildings.length ? 'Floor / group…' : 'No floor'}</option>
              {b.buildings.map((bd) => <option key={bd.id} value={bd.id}>{bd.name}</option>)}
            </select>
            <input placeholder="Add rooms: one per line or comma-separated" aria-label={`Add rooms to ${b.name}`} value={nr[b.id]?.rooms || ''}
              onChange={(e) => setNr((m) => ({ ...m, [b.id]: { ...m[b.id], rooms: e.target.value } }))} />
            {!b.is_hostel && <label className="inline"><input type="checkbox" style={{ width: 'auto' }} checked={!!nr[b.id]?.student} onChange={(e) => setNr((m) => ({ ...m, [b.id]: { ...m[b.id], student: e.target.checked } }))} /> Students can report</label>}
            <button type="button" className="btn s xs" onClick={() => addRooms(b)}>Add rooms</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClockTab() {
  const toast = useToast();
  const { data: clock, error, loading, reload } = useAsync(() => api.get('/settings/clock').then((r) => r.data), []);
  async function setMode(mode) {
    try { await api.post('/settings/clock', { mode }); reload(); toast.success('Demo clock updated. Queued requests re-checked'); }
    catch (err) { toast.error(apiError(err).message); }
  }
  const MODES = [
    ['live', 'Real time', 'Use the actual current time.'],
    ['main-hours', 'Main technicians\' hours', 'Jump to 11 AM. Main technicians (8 AM to 5 PM) are on duty, volunteers are not.'],
    ['volunteer-hours', 'Volunteer hours', 'Jump to 8 PM. Volunteers (7 to 9 PM) are on duty, Main technicians are not.'],
    ['all-off', 'Everyone off duty', 'Jump to 2 AM. Nobody is on the automatic schedule.'],
  ];
  return (
    <div className="g">
      <h2>Demo clock</h2>
      <p className="mu sm">
        Technicians can only claim jobs while on duty: Main 8 AM to 5 PM and Volunteers 7 to 9 PM, every day, Bhutan time (unless a technician forced themselves on or off).
        Use this to demonstrate that without waiting for the real clock. It only affects the running server and resets when it restarts.
      </p>
      {loading && !clock ? <Spinner /> : error && !clock ? <ErrorBox message={error} onRetry={reload} /> : (
        <>
          <div className="g inner">
            <span className="mu sm">Server thinks it is</span>
            <h3>{new Date(clock.now).toLocaleString(undefined, { timeZone: clock.tz, weekday: 'long', hour: 'numeric', minute: '2-digit' })}</h3>
            <div className="fl">
              <b className={clock.main?.open ? 'gr2' : 'am'}>Main: {clock.main?.open ? 'on duty' : 'off duty'}</b>
              <b className={clock.volunteer?.open ? 'gr2' : 'am'}>Volunteers: {clock.volunteer?.open ? 'on duty' : 'off duty'}</b>
            </div>
          </div>
          <div className="clock-modes">
            {MODES.map(([mode, label, text]) => (
              <button type="button" key={mode} className={`mode${clock.mode === mode ? ' on' : ''}`} onClick={() => setMode(mode)}>
                <b>{label}</b><span className="mu sm">{text}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const { data: cats, error, loading, reload } = useAsync(() => api.get('/categories', { params: { all: 1 } }).then((r) => r.data.categories), []);
  const [name, setName] = useState('');
  const [confirmFor, setConfirmFor] = useState(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await api.post('/categories', { name: name.trim() }); setName(''); reload(); toast.success('Category added'); }
    catch (err) { toast.error(apiError(err).message); } finally { setBusy(false); }
  }
  async function remove(c, confirm = false) {
    try {
      await api.delete(`/categories/${c.id}${confirm ? '?confirm=true' : ''}`);
      setConfirmFor(null); reload(); toast.success('Category removed');
    } catch (err) {
      const { message } = apiError(err);
      if (err.response?.data?.needs_confirm) setConfirmFor({ ...c, message }); else toast.error(message);
    }
  }
  return (
    <div className="g">
      <h2>Issue categories</h2>
      {loading && !cats ? <Spinner /> : error && !cats ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="fl">
          {cats.map((c) => (
            <span key={c.id} className={`chip ${c.is_active ? 'cy' : 'mu'}`}>
              {c.name}{c.request_count > 0 && <span className="mu"> ({c.request_count})</span>}
              <button type="button" className="x-btn" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="qrow">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add category" aria-label="New category" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="btn" disabled={busy} onClick={add}>Add category</button>
      </div>
      <ConfirmDialog open={!!confirmFor} title="Remove category?" message={confirmFor?.message} danger confirmLabel="Remove anyway" onCancel={() => setConfirmFor(null)} onConfirm={() => remove(confirmFor, true)} />
    </div>
  );
}

function NotificationsTab() {
  const toast = useToast();
  const { data: s, error, loading, reload } = useAsync(() => api.get('/settings').then((r) => r.data.settings), []);
  const [busy, setBusy] = useState(false);
  async function save(next) {
    setBusy(true);
    try { await api.put('/settings', next); toast.success('Settings saved'); reload(); }
    catch (err) { toast.error(apiError(err).message); } finally { setBusy(false); }
  }
  if (loading && !s) return <Spinner />;
  if (error && !s) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div className="row">
      <div className="g">
        <h2>Urgency response targets (SLA)</h2>
        {['High', 'Medium', 'Low'].map((u) => (
          <div key={u} className="trow">
            <div>
              <b>{u === 'High' ? 'Urgent priority' : `${u} priority`}</b>
              {s.sla_compliance[u] != null && <div className="mu tiny">{s.sla_compliance[u]}% SLA met</div>}
            </div>
            <span className="fl" style={{ flexWrap: 'nowrap' }}>
              <input type="number" min="1" className="mini" style={{ width: 80, textAlign: 'right' }} aria-label={`${u} priority hours`} defaultValue={s.sla_hours[u]}
                onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v !== s.sla_hours[u]) save({ sla_hours: { ...s.sla_hours, [u]: v } }); }} />
              <span className="mu sm">hours</span>
            </span>
          </div>
        ))}
      </div>
      <div className="g">
        <h2>How jobs are assigned</h2>
        <div className="trow">
          <div><b>Technicians pick their own jobs</b><div className="mu tiny">ON: every request appears on every technician's job board. OFF: the system assigns on-duty technicians automatically.</div></div>
          <Switch label="Technicians pick jobs" checked={s.assignment_mode === 'pick'} disabled={busy} onChange={(v) => save({ assignment_mode: v ? 'pick' : 'auto' })} />
        </div>
      </div>
      <div className="g">
        <h2>Notification channels</h2>
        <div className="trow">
          <div><b>Email notifications</b><div className="mu tiny">Send emails for request updates</div></div>
          <Switch label="Email notifications" checked={s.notify_email_enabled} disabled={busy} onChange={(v) => save({ notify_email_enabled: v })} />
        </div>
        <div className="trow">
          <div><b>In-app notifications</b><div className="mu tiny">Show alerts inside CampusCare</div></div>
          <Switch label="In-app notifications" checked={s.notify_inapp_enabled} disabled={busy} onChange={(v) => save({ notify_inapp_enabled: v })} />
        </div>
      </div>
    </div>
  );
}

function AccountTab() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try { await api.put('/auth/profile', { name }); await refresh(); toast.success('Account updated'); }
    catch (err) { toast.error(apiError(err).message); } finally { setBusy(false); }
  }
  return (
    <form className="g narrow" style={{ margin: 0 }} onSubmit={save}>
      <h2>Account</h2>
      <Fld id="ac-name" label="Name"><input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} /></Fld>
      <Fld id="ac-email" label="Email"><input id="ac-email" value={user.email} disabled /></Fld>
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}
