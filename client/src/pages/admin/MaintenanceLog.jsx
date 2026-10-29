import { useState } from 'react';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { formatDateTime, formatDuration } from '../../lib/format';

const TABS = ['Completed work', 'By location', 'By technician', 'Equipment used', 'Suspensions'];

/**
 * Maintenance log (replaces the old Audit log screen). Read-only. Everything here is computed on the server
 * from completed requests (+ the suspension records), so it always matches what technicians actually reported.
 */
export default function MaintenanceLog() {
  const [tab, setTab] = useState(TABS[0]);
  const [f, setF] = useState({ from: '', to: '', block: '', tech_id: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { data, error, loading, reload } = useAsync(async () => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    return (await api.get('/maintenance-log', { params })).data;
  }, [f.from, f.to, f.block, f.tech_id]);

  const sm = data?.summary;
  return (
    <>
      <h1>Maintenance log</h1>
      <p className="mu">Completed maintenance work: where it happened, how much per room, who did it, and what equipment was used.</p>

      <div className="gr">
        <StatCard label="Jobs completed" value={sm?.completed ?? '—'} tone="gr2" loading={!sm} />
        <StatCard label="Time spent" value={sm ? formatDuration(sm.minutes) : '—'} tone="cy" loading={!sm} />
        <StatCard label="Rooms serviced" value={sm?.rooms ?? '—'} tone="vi" loading={!sm} />
        <StatCard label="Accounts suspended now" value={sm?.suspended_now ?? '—'} tone="am" loading={!sm} />
      </div>

      <div className="g">
        <div className="filters">
          <label className="inline">From <input type="date" value={f.from} onChange={set('from')} aria-label="From date" /></label>
          <label className="inline">To <input type="date" value={f.to} onChange={set('to')} aria-label="To date" /></label>
          <select value={f.block} onChange={set('block')} aria-label="Block">
            <option value="">All blocks</option>{(data?.filters.blocks || []).map((b) => <option key={b}>{b}</option>)}
          </select>
          <select value={f.tech_id} onChange={set('tech_id')} aria-label="Technician">
            <option value="">All technicians</option>{(data?.filters.technicians || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="fl tabs" role="tablist">
        {TABS.map((t) => <button type="button" role="tab" aria-selected={tab === t} key={t} className={`chip${tab === t ? ' sel' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : (
        <>
          {tab === 'Completed work' && (data.jobs.length === 0 ? <EmptyState title="No completed work in this range" /> : (
            <div className="g tw"><table>
              <thead><tr><th>Completed</th><th>Request</th><th>Location</th><th>Category</th><th>Technician</th><th>Time</th><th>Equipment</th></tr></thead>
              <tbody>{data.jobs.map((j) => (
                <tr key={j.request_id}>
                  <td className="mu sm nowrap">{formatDateTime(j.completed_at)}</td>
                  <td><b>{j.code}</b><div className="mu tiny">{j.title}</div></td>
                  <td>{[j.block, j.floor, j.room_no].filter(Boolean).join(' · ')}</td>
                  <td>{j.category_name}</td>
                  <td>{j.tech_name || '—'} {j.tier && <span className="mu tiny">({j.tier})</span>}</td>
                  <td>{formatDuration(j.time_spent_minutes)}</td>
                  <td>{j.equipment_used || '—'}</td>
                </tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'By location' && (data.by_room.length === 0 ? <EmptyState title="No completed work yet" /> : (
            <div className="g tw"><table>
              <thead><tr><th>Block</th><th>Floor / group</th><th>Room</th><th>Jobs done</th><th>Time spent</th><th>Last completed</th></tr></thead>
              <tbody>{data.by_room.map((r, i) => (
                <tr key={i}><td>{r.block}</td><td>{r.floor || '—'}</td><td>{r.room_no}</td><td><b>{r.jobs}</b></td><td>{formatDuration(Number(r.minutes))}</td><td className="mu sm">{formatDateTime(r.last_completed)}</td></tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'By technician' && (data.by_technician.length === 0 ? <EmptyState title="No completed work yet" /> : (
            <div className="g tw"><table>
              <thead><tr><th>Technician</th><th>Tier</th><th>Jobs completed</th><th>Time spent</th></tr></thead>
              <tbody>{data.by_technician.map((t) => (
                <tr key={t.tech_id}><td><b>{t.name}</b></td><td>{t.tier}</td><td><b>{t.jobs}</b></td><td>{formatDuration(Number(t.minutes))}</td></tr>))}</tbody>
            </table></div>
          ))}

          {tab === 'Equipment used' && (data.equipment.length === 0 ? <EmptyState title="No equipment recorded yet" subtitle="Technicians list equipment when they complete a job." /> : (
            <div className="g tw"><table>
              <thead><tr><th>Equipment / material</th><th>Times used</th></tr></thead>
              <tbody>{data.equipment.map((e) => <tr key={e.item}><td>{e.item}</td><td><b>{e.uses}</b></td></tr>)}</tbody>
            </table></div>
          ))}

          {tab === 'Suspensions' && (
            <>
              <h2>Suspended right now</h2>
              {data.suspensions.current.length === 0 ? <EmptyState title="Nobody is suspended" /> : (
                <div className="g tw"><table>
                  <thead><tr><th>Account</th><th>Type</th><th>Reason</th><th>Since</th></tr></thead>
                  <tbody>{data.suspensions.current.map((u) => (
                    <tr key={u.id}><td><b>{u.name}</b><div className="mu tiny">{u.email}</div></td><td>{u.account_type}</td><td>{u.suspended_reason}</td><td className="mu sm">{formatDateTime(u.suspended_at)}</td></tr>))}</tbody>
                </table></div>
              )}
              <h2 className="mt">History</h2>
              {data.suspensions.history.length === 0 ? <EmptyState title="No suspensions recorded" /> : (
                <div className="g tw"><table>
                  <thead><tr><th>When</th><th>Account</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
                  <tbody>{data.suspensions.history.map((h) => (
                    <tr key={h.id}><td className="mu sm nowrap">{formatDateTime(h.created_at)}</td><td>{h.user_name}</td>
                      <td><span className={`chip ${h.action === 'USER_SUSPEND' ? 'rd' : 'gr2'}`}>{h.action === 'USER_SUSPEND' ? 'Suspended' : 'Reinstated'}</span></td>
                      <td>{h.actor_name || '—'}</td><td>{h.details || '—'}</td></tr>))}</tbody>
                </table></div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
