import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import useAsync from '../hooks/useAsync';
import Spinner from '../components/Spinner';
import ErrorBox from '../components/ErrorBox';
import EmptyState from '../components/EmptyState';
import { relativeTime } from '../lib/format';

const TYPE_CLASS = { Request: 'cy', Update: 'am', Completed: 'gr2' };

export default function Notifications() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const { data: items, error, loading, reload } = useAsync(() => api.get('/notifications').then((r) => r.data.notifications), []);

  const unread = items?.filter((n) => !n.is_read).length ?? 0;
  const visible = items ? (tab === 'unread' ? items.filter((n) => !n.is_read) : items) : [];

  async function readAll() { await api.post('/notifications/read-all'); reload(); }
  async function openItem(n) {
    if (!n.is_read) await api.post(`/notifications/${n.id}/read`);
    if (n.request_id) navigate(`/requests/${n.request_id}`); else reload();
  }

  return (
    <>
      <h1>Notifications</h1>
      <p className="mu">Updates about your maintenance requests.</p>
      <div className="fl between tabs">
        <div className="fl">
          <button type="button" className={`chip${tab === 'all' ? ' sel' : ''}`} onClick={() => setTab('all')}>All</button>
          <button type="button" className={`chip${tab === 'unread' ? ' sel' : ''}`} onClick={() => setTab('unread')}>Unread{unread > 0 ? ` (${unread})` : ''}</button>
        </div>
        {unread > 0 && <button type="button" className="btn s xs" onClick={readAll}>Mark all as read</button>}
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : visible.length === 0 ? <EmptyState title="Nothing here" subtitle="You are all caught up." /> : (
        <div className="g">
          {visible.map((n) => (
            <div key={n.id} className="nrow" role="button" tabIndex={0} onClick={() => openItem(n)} onKeyDown={(e) => { if (e.key === 'Enter') openItem(n); }}>
              <div className="tx">
                <b>{n.title}{!n.is_read && <span className="dot">new</span>}</b>
                <small className="mu">{n.message}</small>
              </div>
              <div className="when">
                <small className="mu">{relativeTime(n.timestamp)}</small>
                <div><span className={`chip ${TYPE_CLASS[n.type] || 'mu'}`}>{n.type}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
