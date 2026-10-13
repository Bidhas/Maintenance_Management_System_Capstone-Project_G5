export default function Modal({ open, title, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(2,10,16,.72)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`g w-full ${wide ? 'max-w-xl' : 'max-w-md'} p-6 my-8 rv`} style={{ background: 'rgba(10,32,45,.88)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-base lg">{title}</div>
          <button onClick={onClose} className="text-mu hover:text-tx text-lg leading-none" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
