import { useState } from 'react';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import useDebounced from '../../hooks/useDebounced';
import { formatDuration } from '../../lib/format';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import RequestList from '../../components/RequestList';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

export default function Completed() {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(async () => {
    const params = { scope: 'completed' };
    if (dq.trim()) params.q = dq.trim();
    const [r, s] = await Promise.all([api.get('/requests', { params }), api.get('/dashboard/technician')]);
    return { items: r.data.requests, stats: s.data.stats };
  }, [dq]);
  const stats = data?.stats;
  const diff = stats ? stats.completed_week - stats.completed_last_week : 0;

  return (
    <>
      <h1>Completed work orders</h1>
      <p className="mu">Review your completed maintenance history.</p>
      <div className="gr">
        <StatCard label="Completed this week" value={stats?.completed_week ?? '—'} hint={stats && diff >= 0 ? `+${diff} vs last week` : undefined} tone="gr2" loading={!stats} />
        <StatCard label="Average completion" value={stats?.avg_minutes ? formatDuration(stats.avg_minutes) : '—'} tone="cy" loading={!stats} />
        <StatCard label="Satisfaction" value={stats?.avg_rating ? `${stats.avg_rating} / 5` : '—'} hint={stats && `From ${stats.rating_count} ratings`} tone="am" loading={!stats} />
      </div>
      <div className="g"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search completed work orders" aria-label="Search completed work orders" /></div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : data.items.length === 0 ? (
        <EmptyState title="Nothing completed yet" subtitle="Finished work orders will show up here." />
      ) : (
        <RequestList rows={data.items} show={['code', 'location', 'completed', 'duration', 'rating']} onOpen={(r) => setOpenId(r.id)} />
      )}
      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} />}
      </Modal>
    </>
  );
}
