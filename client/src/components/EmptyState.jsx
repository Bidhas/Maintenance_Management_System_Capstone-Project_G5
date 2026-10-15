export default function EmptyState({ title, subtitle, action }) {
  return (
    <div className="g empty">
      <b>{title}</b>
      {subtitle && <span className="mu">{subtitle}</span>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}
