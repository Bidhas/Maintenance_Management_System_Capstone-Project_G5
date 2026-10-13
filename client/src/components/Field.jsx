export function Field({ label, error, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function Input({ error, className = '', ...props }) {
  return <input className={`input ${error ? 'border-bad focus:ring-bad/30 focus:border-bad' : ''} ${className}`} {...props} />;
}

export function Select({ error, children, className = '', ...props }) {
  return (
    <select className={`input ${error ? 'border-bad focus:ring-bad/30 focus:border-bad' : ''} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea className={`input min-h-[110px] resize-y ${error ? 'border-bad focus:ring-bad/30 focus:border-bad' : ''} ${className}`} {...props} />;
}
