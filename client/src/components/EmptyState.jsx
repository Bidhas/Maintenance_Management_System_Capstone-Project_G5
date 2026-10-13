export default function EmptyState({ title, subtitle, action }) {
  return (
    <div className="card p-10 text-center">
      <div className="text-3xl mb-2">🗂️</div>
      <div className="font-semibold">{title}</div>
      {subtitle && <div className="text-sm text-ink/55 mt-1">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
