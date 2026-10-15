import { useEffect } from 'react';

/** Glass dialog. Click the backdrop, the x, or press Esc to close. */
export default function Modal({ open, title, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="backdrop" onClick={onClose} />
      <div className={`g modal-card${wide ? ' wide' : ''}`}>
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
