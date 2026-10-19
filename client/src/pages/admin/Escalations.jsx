import { useState } from 'react';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import EmptyState from '../../components/EmptyState';
import StatusPill from '../../components/StatusPill';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';
import { formatDateTime } from '../../lib/format';

export default function Escalations() {
  const [openId, setOpenId] = useState(null);
  const { data: rows, error, loading, reload } = useAsync(() => api.get('/escalations').then((r) => r.data.escalations), []);
  return (
    <>
      <h1>Escalations</h1>
      <p className="mu">Jobs a Volunteer Technician handed up to a Main Technician, and why.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : rows.length === 0 ? (
        <EmptyState title="No escalations yet" subtitle="When a volunteer escalates a job, it will appear here." />
      ) : (
        <div className="g tw">
          <table>
            <thead><tr><th>When</th><th>Work order</th><th>From</th><th>Now with</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} data-a tabIndex={0} onClick={() => setOpenId(e.request_id)} onKeyDown={(ev) => { if (ev.key === 'Enter') setOpenId(e.request_id); }}>
                  <td className="mu sm nowrap">{formatDateTime(e.created_at)}</td>
                  <td><b>{e.code} · {e.title}</b><div className="mu tiny">{e.block} · {e.room_no}</div></td>
                  <td>{e.from_name || '—'}</td>
                  <td>{e.to_name || <span className="mu">Awaiting a Main Technician</span>}</td>
                  <td><b>{e.reason}</b>{e.note && <div className="mu tiny">{e.note}</div>}</td>
                  <td><StatusPill status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
