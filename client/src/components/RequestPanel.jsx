import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api, { apiError } from '../lib/api';
import useAsync from '../hooks/useAsync';
import Spinner from './Spinner';
import ErrorBox from './ErrorBox';
import Stars from './Stars';
import StatusPill from './StatusPill';
import UrgencyBadge from './UrgencyBadge';
import { formatDateTime, formatDuration } from '../lib/format';

const STEPS = ['Pending', 'Assigned', 'In Progress', 'Completed'];
const STEP_LABEL = { Pending: 'Submitted', Assigned: 'Assigned', 'In Progress': 'In progress', Completed: 'Completed' };

function Timeline({ request, history }) {
  if (request.status === 'Declined') {
    return <div className="tl"><div><b className="rd">Declined</b> <span className="mu">{request.decline_reason}</span></div></div>;
  }
  const at = (s) => history.find((h) => h.new_status === s)?.changed_at;
  const current = STEPS.indexOf(request.status);
  return (
    <div className="tl">
      {STEPS.map((s, i) => (
        <div key={s} style={{ opacity: i <= current ? 1 : 0.45 }}>
          <b>{STEP_LABEL[s]}</b> <span className="mu">{at(s) ? formatDateTime(at(s)) : i === current + 1 ? 'Up next' : ''}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- inline action forms (one open at a time, under the request details) ---------- */
function Form({ title, children, onCancel, onSubmit, busy, disabled, submitLabel, danger }) {
  return (
    <form className="action" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <h3>{title}</h3>
      {children}
      <div className="fl mt">
        <button type="submit" className={`btn${danger ? ' d' : ''}`} disabled={busy || disabled}>{busy ? 'Working…' : submitLabel}</button>
        <button type="button" className="btn s" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function AssignForm({ requestId, onDone, onCancel, run, busy }) {
  const { data } = useAsync(() => api.get('/technicians').then((r) => r.data.technicians.filter((t) => t.is_active)), []);
  const [techId, setTechId] = useState('');
  return (
    <Form title="Assign technician" onCancel={onCancel} busy={busy} disabled={!techId} submitLabel="Assign"
      onSubmit={() => run(() => api.post(`/requests/${requestId}/assign`, { tech_id: techId }), 'Technician assigned', onDone)}>
      <div className="field">
        <label htmlFor="a-tech">Technician</label>
        <select id="a-tech" value={techId} onChange={(e) => setTechId(e.target.value)}>
          <option value="">Select a technician</option>
          {(data || []).map((t) => <option key={t.id} value={t.id} disabled={t.availability === 'Off Duty'}>{t.name} · {t.specialty} ({t.availability})</option>)}
        </select>
      </div>
    </Form>
  );
}

function UrgencyForm({ requestId, current, onDone, onCancel, run, busy }) {
  const [urgency, setUrgency] = useState(current);
  return (
    <Form title="Change urgency" onCancel={onCancel} busy={busy} submitLabel="Save"
      onSubmit={() => run(() => api.patch(`/requests/${requestId}/urgency`, { urgency }), 'Urgency updated', onDone)}>
      <div className="field">
        <label htmlFor="u-lvl">Urgency</label>
        <select id="u-lvl" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">Urgent</option>
        </select>
      </div>
    </Form>
  );
}

function TextForm({ title, label, placeholder, min = 5, submitLabel, danger, onSend, onCancel, busy, run, done, doneMsg }) {
  const [text, setText] = useState('');
  return (
    <Form title={title} onCancel={onCancel} busy={busy} disabled={text.trim().length < min} submitLabel={submitLabel} danger={danger}
      onSubmit={() => run(() => onSend(text.trim()), doneMsg, done)}>
      <div className="field">
        <label htmlFor="t-text">{label}</label>
        <textarea id="t-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      </div>
    </Form>
  );
}

function CompleteForm({ requestId, onDone, onCancel, run, busy }) {
  const [notes, setNotes] = useState('');
  const [minutes, setMinutes] = useState('');
  const [equipment, setEquipment] = useState('');
  const [photo, setPhoto] = useState(null);
  return (
    <Form title="Submit proof and complete" onCancel={onCancel} busy={busy} disabled={notes.trim().length < 5 || !minutes || equipment.trim().length < 2} submitLabel="Mark complete"
      onSubmit={() => {
        const fd = new FormData();
        fd.append('resolution_notes', notes);
        fd.append('time_spent_minutes', minutes);
        fd.append('equipment_used', equipment); // feeds the admin Maintenance Log
        if (photo) fd.append('photo', photo);
        return run(() => api.post(`/requests/${requestId}/complete`, fd), 'Work order completed', onDone);
      }}>
      <div className="field"><label htmlFor="c-notes">Resolution notes</label><textarea id="c-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done to fix the issue?" /></div>
      <div className="field"><label htmlFor="c-eq">Equipment / materials used</label><input id="c-eq" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder='e.g. ladder, LED bulb, multimeter — or "None"' /></div>
      <div className="row">
        <div className="field"><label htmlFor="c-min">Time spent (minutes)</label><input id="c-min" type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 45" /></div>
        <div className="field"><label htmlFor="c-photo">Completion photo (optional)</label><input id="c-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files[0] || null)} /></div>
      </div>
    </Form>
  );
}

function EscalateForm({ requestId, onDone, onCancel, run, busy }) {
  const [reason, setReason] = useState('Beyond skill level');
  const [note, setNote] = useState('');
  return (
    <Form title="Escalate to a Main Technician" onCancel={onCancel} busy={busy} submitLabel="Escalate"
      onSubmit={() => run(() => api.post(`/requests/${requestId}/escalate`, { reason, note }), 'Escalated. A Main Technician will pick this up', onDone)}>
      <p className="mu sm">The job leaves your list and goes to the Main Technician pool. It is logged and visible to the admin.</p>
      <div className="field"><label htmlFor="e-r">Reason</label>
        <select id="e-r" value={reason} onChange={(e) => setReason(e.target.value)}><option>Wrong tools</option><option>Beyond skill level</option><option>Needs follow-up</option></select></div>
      <div className="field"><label htmlFor="e-n">Note (optional)</label><textarea id="e-n" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find? What does the specialist need to know?" /></div>
    </Form>
  );
}

function FeedbackForm({ requestId, onDone, onCancel, run, busy }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  return (
    <Form title="Rate this resolution" onCancel={onCancel} busy={busy} submitLabel="Send feedback"
      onSubmit={() => run(() => api.post(`/requests/${requestId}/feedback`, { rating, comment }), 'Thanks for the feedback', onDone)}>
      <Stars value={rating} onChange={setRating} />
      <div className="field mt"><label htmlFor="f-c">Comment (optional)</label><textarea id="f-c" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything else you would like to share?" /></div>
    </Form>
  );
}

/**
 * Everything about one request: details, timeline, proof, and the actions the signed-in person may take.
 * Used inside a dialog on list pages and as a full page on /requests/:id.
 */
export default function RequestPanel({ id, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/requests/${id}`).then((r) => r.data), [id]);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAction(null); }, [id]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const { request: r, history, escalations = [] } = data;
  const isMine = user.role === 'technician' && r.technician?.id === user.id;
  const isOwner = user.role === 'requester' && r.requester.id === user.id;
  const open = !['Completed', 'Declined'].includes(r.status);

  async function run(fn, msg, done) {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
      setAction(null);
      await reload();
      onChanged?.();
      done?.();
    } catch (err) { toast.error(apiError(err).message); }
    finally { setBusy(false); }
  }
  const quick = (path, msg) => () => run(() => api.post(`/requests/${r.id}/${path}`), msg);
  const common = { requestId: r.id, run, busy, onCancel: () => setAction(null) };

  return (
    <div>
      <div className="fl">
        <h2 style={{ margin: 0 }}>{r.code}</h2>
        <UrgencyBadge urgency={r.urgency} />
        <StatusPill status={r.status} />
        {r.escalated && <span className="chip vi">Escalated</span>}
        {r.reopen_count > 0 && <span className="chip am">Reopened ×{r.reopen_count}</span>}
      </div>
      <h3 style={{ marginTop: 8 }}>{r.title}</h3>

      <dl className="facts">
        <div><dt>Location</dt><dd>{r.location}</dd></div>
        <div><dt>Category</dt><dd>{r.category_name || '—'}</dd></div>
        <div><dt>Requester</dt><dd>{r.requester.name}</dd></div>
        <div><dt>Technician</dt><dd>{r.technician ? `${r.technician.name} · ${r.technician.tier}` : 'Unassigned'}</dd></div>
        <div><dt>Logged</dt><dd>{formatDateTime(r.created_at)}</dd></div>
        {r.completed_at && <div><dt>Completed</dt><dd>{formatDateTime(r.completed_at)}</dd></div>}
        {r.equipment_used && <div><dt>Equipment used</dt><dd>{r.equipment_used}</dd></div>}
      </dl>

      <div className="desc">{r.description}</div>
      {r.photo_url && <img className="photo" src={r.photo_url} alt="Attached to the request" />}

      {r.status === 'Pending' && r.queue_reason && (
        <div className="g warn mt">
          <b>Queued, not assigned yet</b>
          <div className="mu sm">{r.queue_reason}. {user.role === 'technician' ? 'Press Claim to take it.' : 'A technician will pick it up during working hours.'}</div>
        </div>
      )}

      <h3 className="mt">Progress</h3>
      <Timeline request={r} history={history} />

      {r.resolution_notes && (
        <>
          <h3 className="mt">Proof of completion</h3>
          <div className="desc">{r.resolution_notes}</div>
          <p className="mu sm">Time spent: {formatDuration(r.time_spent_minutes)}</p>
          {r.completion_photo_url && <img className="photo" src={r.completion_photo_url} alt="Completion proof" />}
        </>
      )}
      {r.rating && (
        <p className="mt"><Stars value={r.rating} /> {r.feedback_comment && <span className="mu">“{r.feedback_comment}”</span>}</p>
      )}

      {escalations.length > 0 && (
        <>
          <h3 className="mt">Escalation history</h3>
          {escalations.map((e, i) => (
            <div key={i} className="sm" style={{ marginBottom: 8 }}>
              <b>{e.from_name || 'A volunteer'}</b> escalated this: <span className="vi">{e.reason}</span>
              {e.note && <div className="mu">“{e.note}”</div>}
              <div className="mu tiny">{formatDateTime(e.created_at)}{e.to_name ? ` · now with ${e.to_name}` : ' · awaiting a Main Technician'}</div>
            </div>
          ))}
        </>
      )}

      {/* ---- actions ---- */}
      {!action && (
        <div className="action">
          <div className="fl">
            {user.role === 'technician' && isMine && r.status === 'Assigned' && <button type="button" className="btn" disabled={busy} onClick={quick('start', 'Work started')}>Start work</button>}
            {user.role === 'technician' && isMine && r.status === 'In Progress' && <button type="button" className="btn" onClick={() => setAction('complete')}>Submit proof and complete</button>}
            {user.role === 'technician' && isMine && user.tier === 'Volunteer' && ['Assigned', 'In Progress'].includes(r.status) && <button type="button" className="btn s" onClick={() => setAction('escalate')}>Escalate to a Main Technician</button>}
            {user.role === 'technician' && !r.technician && r.status === 'Pending' && (
              <>
                <button type="button" className="btn" disabled={busy || r.can_claim === false} onClick={quick('claim', 'Job accepted')}>Claim this request</button>
                {r.can_claim === false && r.claim_blocked_reason && <span className="mu sm">{r.claim_blocked_reason}</span>}
              </>
            )}
            {isOwner && r.status === 'Completed' && !r.rating && <button type="button" className="btn" onClick={() => setAction('feedback')}>Leave feedback</button>}
            {isOwner && r.status === 'Completed' && <button type="button" className="btn s" onClick={() => setAction('reopen')}>Reopen this request</button>}
            {user.role === 'admin' && open && <button type="button" className="btn" onClick={() => setAction('assign')}>{r.technician ? 'Reassign technician' : 'Assign technician'}</button>}
            {user.role === 'admin' && open && <button type="button" className="btn s" onClick={() => setAction('urgency')}>Change urgency</button>}
            {user.role === 'admin' && ['Pending', 'Assigned'].includes(r.status) && <button type="button" className="btn d" onClick={() => setAction('decline')}>Decline</button>}
          </div>
          {user.role === 'admin' && !open && <span className="mu sm">No further actions on a {r.status.toLowerCase()} request.</span>}
        </div>
      )}
      {action === 'assign' && <AssignForm {...common} onDone={() => {}} />}
      {action === 'urgency' && <UrgencyForm {...common} current={r.urgency} onDone={() => {}} />}
      {action === 'decline' && <TextForm {...common} title="Decline request" label="Reason" placeholder="Explain why this request is being declined" submitLabel="Decline" danger doneMsg="Request declined" onSend={(reason) => api.post(`/requests/${r.id}/decline`, { reason })} />}
      {action === 'reopen' && <TextForm {...common} title="Reopen this request" label="What went wrong?" placeholder="e.g. The fan worked for a day and then stopped again." submitLabel="Reopen" doneMsg="Request reopened" onSend={(why) => api.post(`/requests/${r.id}/reopen`, { why })} />}
      {action === 'complete' && <CompleteForm {...common} onDone={() => {}} />}
      {action === 'escalate' && <EscalateForm {...common} onDone={() => {}} />}
      {action === 'feedback' && <FeedbackForm {...common} onDone={() => {}} />}
    </div>
  );
}
