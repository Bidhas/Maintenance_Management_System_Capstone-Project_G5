import Modal from './Modal';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {message && <p className="mu">{message}</p>}
      <div className="fl mt" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn s" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`btn${danger ? ' d' : ''}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}
