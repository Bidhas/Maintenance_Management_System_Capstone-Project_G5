import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import useAsync from '../../hooks/useAsync';
import Fld from '../../components/Fld';
import ClockBanner from '../../components/ClockBanner';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

const URGENCY = [['Low', 'Low', 'gr2'], ['Medium', 'Medium', 'am'], ['High', 'Urgent', 'rd']];

export default function NewRequest() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [b, c, r] = await Promise.all([api.get('/blocks'), api.get('/categories'), api.get('/requests')]);
    return { blocks: b.data.blocks, categories: c.data.categories, duty: r.data.duty };
  }, []);

  const [form, setForm] = useState({ block: '', building_id: '', room_no: '', category_id: '', title: '', description: '', urgency: '' });
  const [photo, setPhoto] = useState(null);
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setBlock = (e) => setForm((f) => ({ ...f, block: e.target.value, building_id: '' }));

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const { blocks, categories, duty } = data;
  const selectedBlock = form.block ? blocks.find((b) => b.name === form.block) : null;
  const buildings = selectedBlock?.buildings || [];
  const suspended = !!user?.suspended_reason;

  async function onSubmit(e) {
    e.preventDefault();
    setFormError(''); setFields({});
    if (!form.urgency) { setFields({ urgency: 'Select an urgency level' }); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (k !== 'building_id' || v) fd.append(k, v); });
      if (photo) fd.append('photo', photo);
      const res = await api.post('/requests', fd);
      const r = res.data.request;
      toast.success(r.status === 'Assigned' && r.technician
        ? `${r.code} submitted and assigned to ${r.technician.name}`
        : `${r.code} submitted. Queued: ${r.queue_reason || 'awaiting assignment'}`);
      navigate('/requests/mine');
    } catch (err) {
      const { message, fields: f } = apiError(err);
      setFormError(message); setFields(f);
    } finally { setBusy(false); }
  }

  return (
    <>
      <ClockBanner duty={duty} />
      {suspended && (
        <div className="g warn">
          <b>New requests are disabled on your account</b>
          <div className="mu sm">Reason: {user.suspended_reason}. Please contact the estate office to be reinstated.</div>
        </div>
      )}
      <form className="g form narrow wide-form" onSubmit={onSubmit}>
        <h1>Report a problem</h1>
        <p className="mu">Tell us where the issue is and what is happening. Hostel requests go to a volunteer for your building; if nobody is on duty it is queued and assigned automatically.</p>
        <fieldset disabled={suspended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className={buildings.length ? 'row3' : 'row'}>
            <Fld id="n-block" label="Block" error={fields.block}>
              <select id="n-block" value={form.block} onChange={setBlock} required>
                <option value="">Select a block</option>
                {blocks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </Fld>
            {buildings.length > 0 && (
              <Fld id="n-bld" label={selectedBlock.is_hostel ? 'Hostel building' : 'Building (optional)'} error={fields.building_id}>
                <select id="n-bld" value={form.building_id} onChange={set('building_id')} required={selectedBlock.is_hostel}>
                  <option value="">Select a building</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Fld>
            )}
            <Fld id="n-room" label="Room / office" error={fields.room_no}>
              <input id="n-room" value={form.room_no} onChange={set('room_no')} placeholder="e.g. Room 214" required />
            </Fld>
          </div>
          <Fld id="n-cat" label="Issue category" error={fields.category_id}>
            <select id="n-cat" value={form.category_id} onChange={set('category_id')} required>
              <option value="">Select a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Fld>
          <Fld id="n-title" label="Title" error={fields.title}>
            <input id="n-title" value={form.title} onChange={set('title')} placeholder="Short summary, e.g. Ceiling fan not spinning" required />
          </Fld>
          <Fld id="n-desc" label="Describe the issue" error={fields.description} hint="Mention when it started and whether it affects safety.">
            <textarea id="n-desc" rows={4} value={form.description} onChange={set('description')} placeholder="What is wrong, and when did it start?" required />
          </Fld>
          <Fld id="n-photo" label="Photo (optional)" error={fields.photo}>
            <input id="n-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files[0] || null)} />
          </Fld>
          <Fld id="n-urg" label="Urgency" error={fields.urgency}>
            <div className="fl" id="n-urg" role="group" aria-label="Urgency">
              {URGENCY.map(([key, label, tone]) => (
                <button type="button" key={key} className={`chip ${tone}${form.urgency === key ? ' sel' : ''}`} aria-pressed={form.urgency === key}
                  style={form.urgency === key ? { background: 'color-mix(in srgb, currentColor 16%, transparent)' } : undefined}
                  onClick={() => setForm((f) => ({ ...f, urgency: key }))}>{label}</button>
              ))}
            </div>
          </Fld>
          {formError && <span className="err">{formError}</span>}
          <div className="fl mt">
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
            <button type="button" className="btn s" disabled={busy} onClick={() => navigate('/requests/mine')}>Cancel</button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
