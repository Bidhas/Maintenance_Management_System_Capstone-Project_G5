import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import usePolling from '../../hooks/usePolling';
import StatCard from '../../components/StatCard';
import UrgencyBadge from '../../components/UrgencyBadge';
import StatusPill from '../../components/StatusPill';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { initials, relativeTime } from '../../lib/format';

export default function Overview() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api.get('/dashboard/admin').then((r) => r.data), []);
  usePolling(reload, 30000);

  const maxCat = data ? Math.max(1, ...data.by_category.map((c) => c.count)) : 1;
  const s = data?.stats;

  return (
    <>
      <div className="fl between end">
        <div>
          <h1>Maintenance overview</h1>
          <p className="mu">All blocks at a glance</p>
        </div>
        <input className="w-md" value={q} aria-label="Search requests" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) navigate(`/admin/requests?q=${encodeURIComponent(q.trim())}`); }}
          placeholder="Search ID, room, block, then Enter" />
      </div>

      {error && !data && <ErrorBox message={error} onRetry={reload} />}

      <div className="gr">
        <StatCard label="Total requests" value={s?.total ?? '—'} hint={s && `${s.open} open`} tone="cy" loading={!s} />
        <StatCard label="Needs attention" value={s?.queued ?? '—'} hint="Queued, not yet assigned" tone="rd" loading={!s} />
        <StatCard label="In progress" value={s?.in_progress ?? '—'} hint={s && `${s.escalated_open} escalated`} tone="am" loading={!s} />
        <StatCard label="Completed today" value={s?.completed_today ?? '—'} tone="gr2" loading={!s} />
      </div>

      <div className="row2-1">
        <div className="g">
          <div className="fl between">
            <h2>Recent requests</h2>
            <button type="button" className="btn s xs" onClick={() => navigate('/admin/requests')}>View all</button>
          </div>
          {loading && !data ? <Spinner /> : (
            <div className="tw">
              <table>
                <thead><tr><th>Location</th><th>Issue</th><th>Urgency</th><th>Status</th><th>Technician</th><th>Logged</th></tr></thead>
                <tbody>
                  {data?.recent.map((r) => (
                    <tr key={r.id} data-a tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                      <td><b>{r.block}</b><div className="mu tiny">{r.room_no}</div></td>
                      <td>{r.title}</td>
                      <td><UrgencyBadge urgency={r.urgency} /></td>
                      <td><StatusPill status={r.status} /></td>
                      <td>{r.technician?.name || '—'}</td>
                      <td className="mu sm">{relativeTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="g">
            <h2>Requests by category</h2>
            {!data ? <Spinner /> : data.by_category.map((c) => (
              <div key={c.name} className="cat-bar">
                <div className="top"><span>{c.name}</span><span className="mu">{c.count}</span></div>
                <div className="bar"><i style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="g">
            <h2>Technicians</h2>
            {!data ? <Spinner /> : data.technicians.map((t) => (
              <div key={t.id} className="fl" style={{ marginBottom: 10, flexWrap: 'nowrap' }}>
                <span className={`avatar${t.tier === 'Volunteer' ? ' vol' : ''}`}>{initials(t.name)}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{t.name}</b>
                  <div className="mu tiny">{t.tier}{t.tier === 'Volunteer' ? ` · ${t.week_count}/${t.weekly_cap} this week` : ''} · {t.specialty}</div>
                </div>
                <span className="fl sm nowrap"><span className={`led${t.on_duty ? ' on' : ''}`} />{t.on_duty ? 'On duty' : 'Off duty'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mu tiny">Submitted → Assigned → In progress → Completed. Notifications are sent at each stage.</p>
      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
