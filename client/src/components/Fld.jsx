/** Label + control + error, styled by cm.css. Pass the control as children (give it the same id). */
export default function Fld({ id, label, error, hint, children, className = '' }) {
  return (
    <div className={`field${error ? ' invalid' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small className="mu">{hint}</small>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
