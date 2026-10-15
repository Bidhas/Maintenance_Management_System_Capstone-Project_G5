import { useState } from 'react';
import Modal from './Modal';

/** Asks for a short reason (min 5 characters) before a destructive/admin action. */
export default function ReasonDialog({ open, title, label = 'Reason', placeholder, confirmLabel = 'Confirm', danger, onSubmit, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    try { await onSubmit(text.trim()); setText(''); }
    catch (e) { setError(e?.message || 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className={`field${error ? ' invalid' : ''}`}>
        <label htmlFor="reason-text">{label}</label>
        <textarea id="reason-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        {error && <span className="err">{error}</span>}
      </div>
      <div className="fl" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn s" onClick={onClose}>Cancel</button>
        <button type="button" className={`btn${danger ? ' d' : ''}`} disabled={busy || text.trim().length < 5} onClick={go}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
