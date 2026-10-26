import { useState } from 'react';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import useDebounced from '../../hooks/useDebounced';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { formatDateTime } from '../../lib/format';

export default function Audit() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(async () => {
    const params = {};
    if (dq.trim()) params.q = dq.trim();
    if (action) params.action = action;
    return (await api.get('/audit', { params })).data;
  }, [dq, action]);

  return (
    <>
      <h1>Audit log</h1>
      <p className="mu">A read-only record of administrative and status-changing actions.</p>
      <div className="g">
        <div className="filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor or details" aria-label="Search" />
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
            <option value="">All actions</option>
            {(data?.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : data.logs.length === 0 ? <EmptyState title="No matching log entries" /> : (
        <div className="g tw">
          <table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l.id}>
                  <td className="mu sm nowrap">{formatDateTime(l.created_at)}</td>
                  <td>{l.actor_name || '—'} <span className="mu tiny">({l.actor_role})</span></td>
                  <td><span className="chip cy">{l.action}</span></td>
                  <td>{l.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
