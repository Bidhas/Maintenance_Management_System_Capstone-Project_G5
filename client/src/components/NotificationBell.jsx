import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import usePolling from '../hooks/usePolling';
import { relativeTime } from '../lib/format';

/** Bell in the top bar: unread badge, quick list, jump to the request. Works for every role. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications');
      setItems(r.data.notifications.slice(0, 8));
      setUnread(r.data.unread);
    } catch { /* the bell is optional; stay quiet */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 20000);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    if (!n.is_read) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); load(); }
    if (n.request_id) navigate(`/requests/${n.request_id}`);
  }
  async function readAll() { await api.post('/notifications/read-all'); load(); }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="btn s xs icon-btn" onClick={() => { setOpen((o) => !o); load(); }} aria-label="Notifications" aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="dot">{unread}</span>}
      </button>
      {open && (
        <div className="g panel">
          <div className="fl between">
            <b>Notifications</b>
            {unread > 0 && <button type="button" className="link-btn sm" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <div className="nt mu">Nothing yet.</div>}
          {items.map((n) => (
            <div key={n.id} className={`nt${n.is_read ? '' : ' new'}`}>
              <a href={n.request_id ? `/requests/${n.request_id}` : '#'} onClick={(e) => { e.preventDefault(); openItem(n); }}>
                <b>{n.title}</b>
                <span className="mu">{n.message}</span>
                <small className="mu">{relativeTime(n.timestamp)}</small>
              </a>
            </div>
          ))}
          <div className="nt"><Link to="/notifications" onClick={() => setOpen(false)}>See all notifications</Link></div>
        </div>
      )}
    </div>
  );
}
