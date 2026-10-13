export default function StatCard({ label, value, hint, hintTone = 'default', loading }) {
  const toneClass = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', default: 'text-ink/50' }[hintTone];
  return (
    <div className="card p-4">
      <div className="text-xs text-ink/55">{label}</div>
      {loading ? (
        <div className="skeleton h-7 w-16 mt-2" />
      ) : (
        <div className="text-2xl font-extrabold mt-1">{value}</div>
      )}
      {hint && !loading && <div className={`text-xs mt-1 ${toneClass}`}>{hint}</div>}
    </div>
  );
}
