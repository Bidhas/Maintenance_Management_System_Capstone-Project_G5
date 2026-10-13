export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,10,16,.72)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div className="g w-full max-w-sm p-6 rv" style={{ background: 'rgba(10,32,45,.88)' }} onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-base lg">{title}</div>
        {message && <p className="text-sm text-mu mt-2">{message}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-outline btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? 'btn-danger btn-sm' : 'btn-brand btn-sm'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
