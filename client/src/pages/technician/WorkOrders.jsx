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
import StatusPill from '../../components/StatusPill';
import UrgencyBadge from '../../components/UrgencyBadge';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { relativeTime } from '../../lib/format';

/**
 * Technician home. Two parts:
 *   1. "Assigned to me"  — jobs this technician owns (start / complete from here)
 *   2. "Job board"       — EVERY request on campus, same table style as the admin Requests page.
 *                           Open ones have a Claim button; if the technician can't claim right now
 *                           (off duty, weekly cap, wrong-gender hostel…) the button is disabled and says why.
 */
export default function WorkOrders() {
  const toast = useToast();
  const { user } = useAuth();
  const isVol = user?.tier === 'Volunteer';
  const [q, setQ] = useState('');
  const [view, setView] = useState('open'); // 'open' = unassigned & waiting, 'all' = every request
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const dq = useDebounced(q);

  const { data, error, loading, reload } = useAsync(async () => {
    const [m, a, s] = await Promise.all([
      api.get('/requests'),
      api.get('/requests', { params: { scope: 'all', ...(dq.trim() ? { q: dq.trim() } : {}) } }),
      api.get('/dashboard/technician'),
    ]);
    return { mine: m.data.requests, board: a.data.requests, stats: s.data.stats, duty: a.data.duty, mode: a.data.assignment_mode };
  }, [dq]);
  usePolling(reload, 15000); // the board is shared, so refresh often

  async function act(path, id, ok) {
    setBusyId(id);
    try { await api.post(`/requests/${id}/${path}`); toast.success(ok); }
    catch (err) { toast.error(apiError(err).message); }
    finally { setBusyId(null); reload(); }
  }

  const stats = data?.stats;
  const board = (data?.board || []).filter((r) => (view === 'open' ? r.status === 'Pending' && !r.technician : true));
  return (
    <>
      <div className="fl between end">
        <div>
          <h1>My jobs</h1>
          <p className="mu">{todayLabel()}</p>
        </div>
        <input className="w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the job board" aria-label="Search the job board" />
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
        <EmptyState title="Nothing assigned to you" subtitle="Pick a job from the board below while you are on duty." />
      ) : (
        <>
          <RequestList rows={data.mine} show={['code', 'location', 'created', 'urgency', 'status']} onOpen={(r) => setOpenId(r.id)} />
          <div className="fl">
            {data.mine.filter((r) => r.status === 'Assigned').map((r) => (
              <button type="button" key={r.id} className="btn s xs" disabled={busyId === r.id} onClick={() => act('start', r.id, 'Work started')}>Start {r.code}</button>
            ))}
          </div>
        </>
      )}

      <div className="fl between end mt">
        <h2 style={{ margin: 0 }}>Job board</h2>
        <div className="fl tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'open'} className={`chip${view === 'open' ? ' sel' : ''}`} onClick={() => setView('open')}>Waiting for a technician</button>
          <button type="button" role="tab" aria-selected={view === 'all'} className={`chip${view === 'all' ? ' sel' : ''}`} onClick={() => setView('all')}>All requests</button>
        </div>
      </div>
      <p className="mu sm">Every submitted request is listed here. Open the ones you want, and press <b>Claim</b> to take the job (only while you are on duty).</p>

      {data && board.length === 0 ? (
        <EmptyState title={view === 'open' ? 'No requests are waiting' : 'No requests match'} subtitle="New requests appear here as soon as they are submitted." />
      ) : data && (
        <div className="g tw">
          <table>
            <thead><tr><th>Request</th><th>Location</th><th>Category</th><th>Priority</th><th>Status</th><th>Technician</th><th>Logged</th><th /></tr></thead>
            <tbody>
              {board.map((r) => {
                const claimable = r.status === 'Pending' && !r.technician;
                return (
                  <tr key={r.id} data-a tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                    <td><b>{r.code}</b><div className="mu tiny">{r.title}</div></td>
                    <td>{r.location}</td>
                    <td>{r.category_name}</td>
                    <td><UrgencyBadge urgency={r.urgency} /></td>
                    <td><StatusPill status={r.status} />{r.escalated && <span className="chip vi" style={{ marginLeft: 6 }}>Escalated</span>}</td>
                    <td>{r.technician?.name || <span className="mu">Unassigned</span>}</td>
                    <td className="mu sm nowrap">{relativeTime(r.created_at)}</td>
                    <td className="right">
                      {claimable && (
                        <>
                          <button type="button" className="btn xs" disabled={!r.can_claim || busyId === r.id} title={r.claim_blocked_reason || ''}
                            onClick={(e) => { e.stopPropagation(); act('claim', r.id, 'Job accepted'); }}>{busyId === r.id ? 'Claiming…' : 'Claim'}</button>
                          {!r.can_claim && r.claim_blocked_reason && <div className="mu tiny" style={{ maxWidth: 220 }}>{r.claim_blocked_reason}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mu tiny">Accepting a job notifies the admin. Marking it complete notifies the requester and the admin.</p>

      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
