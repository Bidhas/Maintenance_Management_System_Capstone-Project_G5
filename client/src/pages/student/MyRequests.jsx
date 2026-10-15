import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import useAsync from '../../hooks/useAsync';
import useDebounced from '../../hooks/useDebounced';
import usePolling from '../../hooks/usePolling';
import { STATUSES } from '../../lib/ui';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import ClockBanner from '../../components/ClockBanner';
import RequestList from '../../components/RequestList';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

export default function MyRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const dq = useDebounced(q);

  const { data, error, loading, reload } = useAsync(async () => {
    const params = {};
    if (dq.trim()) params.q = dq.trim();
    if (status) params.status = status;
    const [r, s] = await Promise.all([api.get('/requests', { params }), api.get('/dashboard/requester')]);
    return { requests: r.data.requests, duty: r.data.duty, stats: s.data.stats };
  }, [dq, status]);
  usePolling(reload, 20000);

  const stats = data?.stats;
  return (
    <>
      <div className="fl between">
        <div>
          <h1>My requests</h1>
          <p className="mu">Track and manage your maintenance requests.</p>
        </div>
        <button type="button" className="btn" disabled={!!user?.suspended_reason} onClick={() => navigate('/requests/new')}>New request</button>
      </div>

      {user?.suspended_reason && (
        <div className="g warn">
          <b>Your account is suspended from submitting new requests</b>
          <div className="mu sm">Reason: {user.suspended_reason}. Existing requests work as normal. Contact the estate office to be reinstated.</div>
        </div>
      )}
      <ClockBanner duty={data?.duty} />

      <div className="gr">
        <StatCard label="Open requests" value={stats?.open ?? '—'} hint={stats && `${stats.awaiting} awaiting review`} tone="am" loading={!stats} />
        <StatCard label="In progress" value={stats?.in_progress ?? '—'} hint="Technicians assigned" tone="cy" loading={!stats} />
        <StatCard label="Completed" value={stats?.completed ?? '—'} hint="All time" tone="gr2" loading={!stats} />
      </div>

      <div className="g">
        <div className="filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your requests" aria-label="Search your requests" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : data.requests.length === 0 ? (
        <EmptyState title="No requests yet" subtitle="Submit your first maintenance request to see it here." action={<button type="button" onClick={() => navigate('/requests/new')} className="btn">New request</button>} />
      ) : (
        <RequestList rows={data.requests} show={['code', 'location', 'created', 'urgency', 'status']} onOpen={(r) => setOpenId(r.id)} />
      )}

      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
