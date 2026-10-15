import { useState } from 'react';
import api, { apiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useAsync from '../../hooks/useAsync';
import ReasonDialog from '../../components/ReasonDialog';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { formatDate } from '../../lib/format';

const ROLE_NAME = { requester: 'Requester', technician: 'Technician', admin: 'Admin' };

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [suspending, setSuspending] = useState(null);
  const { data: users, error, loading, reload } = useAsync(() => api.get('/users').then((r) => r.data.users), []);

  async function toggle(u) {
    if (u.role === me.role && u.id === me.id) { toast.error('You cannot deactivate your own account'); return; }
    try { await api.patch(`/users/${u.role}/${u.id}/status`, { is_active: !u.is_active }); reload(); toast.success(u.is_active ? 'User deactivated' : 'User activated'); }
    catch (err) { toast.error(apiError(err).message); }
  }
  async function reinstate(u) {
    try { await api.post(`/users/requester/${u.id}/reinstate`); toast.success(`${u.name} can submit requests again`); reload(); }
    catch (err) { toast.error(apiError(err).message); }
  }
  async function suspend(reason) {
    try {
      await api.post(`/users/requester/${suspending.id}/suspend`, { reason });
    } catch (err) { throw new Error(apiError(err).message); }
    toast.success(`${suspending.name} can no longer submit requests`);
    setSuspending(null); reload();
  }

  const list = (users || []).filter((u) =>
    (!roleFilter || u.role === roleFilter) &&
    (!q.trim() || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <h1>Users</h1>
      <p className="mu">All accounts. Suspending a requester blocks new submissions but keeps their account and history.</p>
      <div className="g fl">
        <input className="w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" />
        {[['', 'All'], ['requester', 'Requesters'], ['technician', 'Technicians'], ['admin', 'Admins']].map(([v, l]) => (
          <button type="button" key={l} className={`chip${roleFilter === v ? ' sel' : ''}`} onClick={() => setRoleFilter(v)}>{l}</button>
        ))}
      </div>

      {loading && !users ? <Spinner /> : error && !users ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="g tw">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Requests</th><th>Joined</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={`${u.role}-${u.id}`}>
                  <td><b>{u.name}</b></td>
                  <td className="mu">{u.email}</td>
                  <td className="mu">{ROLE_NAME[u.role]}{u.account_type && u.role === 'requester' ? ` · ${u.account_type}` : ''}</td>
                  <td>{u.request_count ?? '—'}</td>
                  <td className="mu sm">{formatDate(u.created_at)}</td>
                  <td>
                    {!u.is_active ? <span className="chip mu">Deactivated</span>
                      : u.suspended_reason ? <span className="chip rd" title={u.suspended_reason}>Suspended</span>
                      : <span className="chip gr2">Active</span>}
                  </td>
                  <td className="right nowrap">
                    <span className="fl" style={{ justifyContent: 'flex-end' }}>
                      {u.role === 'requester' && u.is_active && (u.suspended_reason
                        ? <button type="button" className="btn s xs" onClick={() => reinstate(u)}>Reinstate</button>
                        : <button type="button" className="btn s xs" onClick={() => setSuspending(u)}>Suspend</button>)}
                      <button type="button" className={`btn xs${u.is_active ? ' d' : ' s'}`} onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReasonDialog open={!!suspending} title={`Suspend ${suspending?.name || ''}`} label="Reason" placeholder="e.g. Repeated duplicate or false reports"
        confirmLabel="Suspend" danger onSubmit={suspend} onClose={() => setSuspending(null)} />
    </>
  );
}
