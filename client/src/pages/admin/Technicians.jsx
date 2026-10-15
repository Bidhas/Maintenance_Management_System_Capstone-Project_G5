import { useEffect, useState } from 'react';
import api, { apiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import useAsync from '../../hooks/useAsync';
import StatCard from '../../components/StatCard';
import Modal from '../../components/Modal';
import Fld from '../../components/Fld';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

const DUTY_LABEL = { auto: 'Auto schedule', on: 'Forced on', off: 'Forced off' };

export default function Technicians() {
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = edit
  const { data, error, loading, reload } = useAsync(() => api.get('/technicians').then((r) => r.data), []);
  const cats = useAsync(() => api.get('/categories').then((r) => r.data.categories), []);

  const list = (data?.technicians || []).filter((t) =>
    (!tier || t.tier === tier) &&
    (!q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.specialty.toLowerCase().includes(q.toLowerCase())));
  const st = data?.stats;

  return (
    <>
      <div className="fl between">
        <div>
          <h1>Technicians</h1>
          <p className="mu">Main Technicians (staff) and Volunteer Technicians (students): who is on duty, and how loaded they are.</p>
        </div>
        <button type="button" className="btn" onClick={() => setEditing({})}>Add technician</button>
      </div>

      <div className="gr">
        <StatCard label="Active technicians" value={st?.total ?? '—'} hint={st && `${st.main} Main · ${st.volunteer} Volunteer`} tone="cy" loading={!st} />
        <StatCard label="On duty now" value={st?.on_duty ?? '—'} tone="gr2" loading={!st} />
        <StatCard label="Open assignments" value={st?.open_assignments ?? '—'} tone="am" loading={!st} />
        <StatCard label="Weekly cap (volunteers)" value="Per person" hint="Set on each volunteer" tone="vi" loading={!st} />
      </div>

      <div className="g fl">
        <input className="w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search technicians" aria-label="Search technicians" />
        {[['', 'All'], ['Main', 'Main'], ['Volunteer', 'Volunteer']].map(([v, l]) => (
          <button type="button" key={l} className={`chip${tier === v ? ' sel' : ''}`} onClick={() => setTier(v)}>{l}</button>
        ))}
      </div>

      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="g tw">
          <table>
            <thead><tr><th>Technician</th><th>Tier</th><th>Specialty</th><th>Load</th><th>Duty</th><th /></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={t.is_active ? '' : 'inactive'}>
                  <td><b>{t.name}</b><div className="mu tiny">{t.email}{t.gender ? ` · ${t.gender === 'F' ? 'Female' : 'Male'}` : ''}</div></td>
                  <td><span className={`chip ${t.tier === 'Volunteer' ? 'vi' : 'cy'}`}>{t.tier}</span></td>
                  <td className="mu">{t.specialty}</td>
                  <td>{t.active_orders} active{t.tier === 'Volunteer' && <div className="mu tiny">{t.week_count}/{t.weekly_cap} this week</div>}</td>
                  <td>
                    {!t.is_active ? <span className="mu">Deactivated</span> : (
                      <>
                        <span className="fl sm"><span className={`led${t.on_duty ? ' on' : ''}`} />{t.on_duty ? 'On duty' : 'Off duty'}</span>
                        <div className="mu tiny">{DUTY_LABEL[t.duty_mode]}</div>
                      </>
                    )}
                  </td>
                  <td className="right"><button type="button" className="btn s xs" onClick={() => setEditing(t)}>Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="center mu">No technicians match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <TechModal editing={editing} categories={cats.data || []} onClose={() => setEditing(null)} onDone={reload} />
    </>
  );
}

function TechModal({ editing, categories, onClose, onDone }) {
  const toast = useToast();
  const isNew = editing && !editing.id;
  const blank = { name: '', email: '', phone: '', location: '', tier: 'Main', gender: '', weekly_cap: 3, duty_override: 'auto', password: '', is_active: true, category_ids: [] };
  const [form, setForm] = useState(blank);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setFields({});
    setForm({
      name: editing.name || '', email: editing.email || '', phone: editing.phone || '', location: editing.location || '',
      tier: editing.tier || 'Main', gender: editing.gender || '', weekly_cap: editing.weekly_cap ?? 3,
      duty_override: editing.duty_mode || 'auto', password: '', is_active: editing.is_active ?? true,
      category_ids: (editing.categories || []).map((c) => c.category_id),
    });
  }, [editing]);

  if (!editing) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleCat = (id) => setForm((f) => ({ ...f, category_ids: f.category_ids.includes(id) ? f.category_ids.filter((c) => c !== id) : [...f.category_ids, id] }));
  const isVolunteer = form.tier === 'Volunteer';

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setFields({});
    const payload = { ...form, gender: isVolunteer && form.gender ? form.gender : undefined, weekly_cap: Number(form.weekly_cap) || 3 };
    try {
      if (isNew) await api.post('/technicians', payload);
      else await api.put(`/technicians/${editing.id}`, payload);
      toast.success(isNew ? 'Technician added' : 'Technician updated');
      onDone(); onClose();
    } catch (err) {
      const { message, fields: f } = apiError(err);
      toast.error(message); setFields(f);
    } finally { setBusy(false); }
  }

  return (
    <Modal open={!!editing} onClose={onClose} title={isNew ? 'Add technician' : `Edit ${editing.name}`} wide>
      <form onSubmit={submit}>
        <div className="row">
          <Fld id="t-name" label="Name" error={fields.name}><input id="t-name" value={form.name} onChange={set('name')} /></Fld>
          <Fld id="t-email" label="Email" error={fields.email}><input id="t-email" value={form.email} onChange={set('email')} /></Fld>
          <Fld id="t-phone" label="Phone" error={fields.phone}><input id="t-phone" value={form.phone} onChange={set('phone')} /></Fld>
          <Fld id="t-loc" label="Base location" error={fields.location}><input id="t-loc" value={form.location} onChange={set('location')} /></Fld>
          <Fld id="t-tier" label="Tier" error={fields.tier}>
            <select id="t-tier" value={form.tier} onChange={set('tier')}>
              <option value="Main">Main Technician (staff)</option>
              <option value="Volunteer">Volunteer Technician (student)</option>
            </select>
          </Fld>
          <Fld id="t-duty" label="Duty status" error={fields.duty_override}>
            <select id="t-duty" value={form.duty_override} onChange={set('duty_override')}>
              <option value="auto">Auto: weekday 7 to 9 PM + weekends</option>
              <option value="on">Forced on duty</option>
              <option value="off">Forced off duty</option>
            </select>
          </Fld>
          {isVolunteer && (
            <>
              <Fld id="t-gen" label="Gender (for hostel matching)" error={fields.gender}>
                <select id="t-gen" value={form.gender} onChange={set('gender')}><option value="">Select</option><option value="M">Male</option><option value="F">Female</option></select>
              </Fld>
              <Fld id="t-cap" label="Weekly job cap" error={fields.weekly_cap}>
                <input id="t-cap" type="number" min="1" max="20" value={form.weekly_cap} onChange={set('weekly_cap')} />
              </Fld>
            </>
          )}
        </div>
        <Fld id="t-pw" label={isNew ? 'Password' : 'New password (optional)'} error={fields.password}>
          <input id="t-pw" type="password" value={form.password} onChange={set('password')} placeholder={isNew ? 'At least 8 characters' : 'Leave blank to keep current'} />
        </Fld>

        <div className="field">
          <label>{isVolunteer ? 'Preferred categories (tie-breaker)' : 'Specializations (needed for non-hostel jobs)'}</label>
          <div className="fl">
            {categories.map((c) => (
              <button type="button" key={c.id} className={`chip${form.category_ids.includes(c.id) ? ' sel cy' : ' mu'}`} aria-pressed={form.category_ids.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>

        {!isNew && (
          <div className="trow">
            <div><b>Active account</b><div className="mu tiny">Deactivating returns their open jobs to the queue</div></div>
            <span className="sw"><input type="checkbox" aria-label="Active account" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} /><i /></span>
          </div>
        )}

        <div className="fl mt" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn s" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add technician' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
