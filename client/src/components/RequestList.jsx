import StatusPill from './StatusPill';
import UrgencyBadge from './UrgencyBadge';
import { formatDate, formatDuration, relativeTime } from '../lib/format';

const COLS = {
  code: ['Request', (r) => (
    <>
      <b>{r.code}</b>
      <div className="mu tiny">{r.title}</div>
      {r.status === 'Pending' && r.queue_reason && <div className="am tiny">Queued: {r.queue_reason}</div>}
    </>
  )],
  location: ['Location', (r) => r.location],
  category: ['Category', (r) => r.category_name || '—'],
  requester: ['Requester', (r) => r.requester?.name || '—'],
  tech: ['Technician', (r) => r.technician?.name || <span className="mu">Unassigned</span>],
  urgency: ['Priority', (r) => <UrgencyBadge urgency={r.urgency} />],
  status: ['Status', (r) => (
    <span className="badge-line">
      <StatusPill status={r.status} />
      {r.escalated && <span className="chip vi">Escalated</span>}
      {r.reopen_count > 0 && <span className="chip am">Reopened</span>}
    </span>
  )],
  created: ['Logged', (r) => <span title={formatDate(r.created_at)}>{relativeTime(r.created_at)}</span>],
  completed: ['Completed', (r) => formatDate(r.completed_at)],
  duration: ['Time spent', (r) => formatDuration(r.time_spent_minutes)],
  rating: ['Rating', (r) => (r.rating ? `${r.rating} / 5` : '—')],
};

/** The standard request table. `show` picks the columns; rows open on click or Enter. */
export default function RequestList({ rows, show, onOpen }) {
  const cols = show.map((k) => COLS[k]);
  return (
    <div className="g tw">
      <table>
        <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-a tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r); }}>
              {cols.map(([h, cell]) => <td key={h}>{cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
