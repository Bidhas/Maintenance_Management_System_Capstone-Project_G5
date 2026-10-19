import { useState } from 'react';
import api, { apiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import useAsync from '../../hooks/useAsync';
import useDebounced from '../../hooks/useDebounced';
import usePolling from '../../hooks/usePolling';
import { todayLabel } from '../../lib/ui';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import ClockBanner from '../../components/ClockBanner';
import RequestList from '../../components/RequestList';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

export default function WorkOrders() {
  const toast = useToast();
  const { user } = useAuth();
  const isVol = user?.tier === 'Volunteer';
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const dq = useDebounced(q);

  const { data, error, loading, reload } = useAsync(async () => {
    const params = dq.trim() ? { q: dq.trim() } : {};
    const [m, p, s] = await Promise.all([
      api.get('/requests', { params }),
      api.get('/requests', { params: { scope: 'pool' } }),
      api.get('/dashboard/technician'),
    ]);
    return { mine: m.data.requests, pool: p.data.requests, stats: s.data.stats, duty: m.data.duty };
  }, [dq]);
  usePolling(reload, 20000);

  async function claim(id) {
    setBusyId(id);
    try { await api.post(`/requests/${id}/claim`); toast.success('Work order claimed'); }
    catch (err) { toast.error(apiError(err).message); }
    finally { setBusyId(null); reload(); }
  }
  async function start(id) {
    setBusyId(id);
    try { await api.post(`/requests/${id}/start`); toast.success('Work started'); }
    catch (err) { toast.error(apiError(err).message); }
    finally { setBusyId(null); reload(); }
  }

  const stats = data?.stats;
  return (
    <>
      <div className="fl between end">
        <div>
          <h1>My jobs</h1>
          <p className="mu">{todayLabel()}</p>
        </div>
        <input className="w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my work orders" aria-label="Search my work orders" />
      </div>

      <ClockBanner duty={data?.duty} />

      <div className="g fl">
        <span className={`chip ${isVol ? 'vi' : 'cy'}`}>{isVol ? 'Volunteer' : 'Main technician'}</span>
        <span className="fl sm"><span className={`led${user?.on_duty ? ' on' : ''}`} />{user?.on_duty ? 'On duty now' : 'Off duty'}{user?.duty_mode && user.duty_mode !== 'auto' ? ` (manual: ${user.duty_mode})` : ''}</span>
        {isVol && <span className="mu sm">Weekly jobs: <b>{user?.week_count ?? 0} / {user?.weekly_cap ?? 3}</b></span>}
        <span className="mu tiny" style={{ marginLeft: 'auto' }}>Change duty mode on your Profile page</span>
      </div>

      <div className="gr">
        <StatCard label="Assigned today" value={stats?.assigned_today ?? '—'} tone="vi" loading={!stats} />
        <StatCard label="In progress" value={stats?.in_progress ?? '—'} tone="cy" loading={!stats} />
        <StatCard label="Completed this week" value={stats?.completed_week ?? '—'} tone="gr2" loading={!stats} />
      </div>

      <h2>Assigned to me</h2>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : data.mine.length === 0 ? (
        <EmptyState title="Nothing assigned right now" subtitle="New jobs are assigned to you automatically while you are on duty." />
      ) : (
        <>
          <RequestList rows={data.mine} show={['code', 'location', 'created', 'urgency', 'status']} onOpen={(r) => setOpenId(r.id)} />
          <div className="fl">
            {data.mine.filter((r) => r.status === 'Assigned').map((r) => (
              <button type="button" key={r.id} className="btn s xs" disabled={busyId === r.id} onClick={() => start(r.id)}>Start {r.code}</button>
            ))}
          </div>
        </>
      )}

      {data?.pool.length > 0 && (
        <>
          <h2 className="mt">Queued jobs you can pick up</h2>
          <div className="g tw">
            <table>
              <thead><tr><th>Request</th><th>Location</th><th>Category</th><th>Priority</th><th /></tr></thead>
              <tbody>
                {data.pool.map((r) => (
                  <tr key={r.id} data-a tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                    <td><b>{r.code}</b><div className="mu tiny">{r.title}</div></td>
                    <td>{r.location}</td>
                    <td>{r.category_name}</td>
                    <td><span className={`chip ${r.urgency === 'High' ? 'rd' : r.urgency === 'Medium' ? 'am' : 'gr2'}`}>{r.urgency === 'High' ? 'Urgent' : r.urgency}</span></td>
                    <td className="right"><button type="button" className="btn xs" disabled={busyId === r.id} onClick={(e) => { e.stopPropagation(); claim(r.id); }}>{busyId === r.id ? 'Claiming…' : 'Claim'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mu tiny">Marking a work order complete notifies the requester and admin automatically.</p>

      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
