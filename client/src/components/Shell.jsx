import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { initials } from '../lib/format';

const NAV = {
  requester: [
    { to: '/profile', label: 'Profile', icon: '👤' },
  ],
  technician: [
    { to: '/profile', label: 'Profile', icon: '👤' },
  ],
  admin: [
  ],
};

const ROLE_TAG = {
  requester: (u) => u.account_type,
  technician: (u) => (u.tier === 'Volunteer' ? 'Volunteer Tech' : 'Main Tech'),
  admin: (u) => u.designation || 'Admin',
};
const ROLE_SUB = { requester: (u) => u.hostel_room || '—', technician: (u) => u.specialty || 'General', admin: () => '' };

function DutyPill({ user, onToggled }) {
  const [busy, setBusy] = useState(false);
  if (user.role !== 'technician') return null;
  const cycle = { auto: 'on', on: 'off', off: 'auto' };
  const label = { auto: user.on_duty ? 'On duty (auto)' : 'Off duty (auto)', on: 'On duty (forced)', off: 'Off duty (forced)' };
  const dot = user.duty_mode === 'off' ? 'bg-bad' : user.on_duty ? 'bg-good' : 'bg-amber';

  async function toggle() {
    setBusy(true);
    try {
      await api.patch('/auth/duty', { duty_override: cycle[user.duty_mode] });
      onToggled();
    } finally { setBusy(false); }
  }

  return (
    <button onClick={toggle} disabled={busy} title="Click to cycle: auto → forced on → forced off" className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 border border-white/10">
      <span className={`h-2 w-2 rounded-full ${dot} shrink-0`} />
      <span className="truncate">{label[user.duty_mode] || 'Auto'}</span>
      {user.tier === 'Volunteer' && <span className="ml-auto text-[10px] text-white/40 shrink-0">{user.week_count}/{user.weekly_cap} wk</span>}
    </button>
  );
}

export default function Shell() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    let stop = false;
    const poll = () => api.get('/notifications/unread-count').then((r) => !stop && setUnread(r.data.unread)).catch(() => {});
    poll();
    const id = setInterval(poll, 20000);
    return () => { stop = true; clearInterval(id); };
  }, [user]);

  if (!user) return <Outlet />;

  const items = NAV[user.role] || [];

  return (
    <div className="min-h-screen flex">
      <aside className="g w-64 shrink-0 m-3 mr-0 rounded-3xl flex flex-col" style={{ maxHeight: 'calc(100vh - 1.5rem)' }}>
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-white/10">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-full shrink-0" />
          <div className="leading-tight min-w-0">
            <div className="font-extrabold text-sm lg">CMMS</div>
            <div className="text-[10px] tracking-wide text-white/45 truncate">College of Science &amp; Technology</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ac/15 text-tx' : 'text-white/55 hover:text-tx hover:bg-white/5'
                }`
              }
              style={({ isActive }) => (isActive ? { background: 'color-mix(in srgb, var(--ac) 15%, transparent)', color: 'var(--ac)' } : undefined)}
            >
              <span className="text-[15px] leading-none">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.label === 'Notifications' && unread > 0 && (
                <span className="bg-amber text-[#2b1800] text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center shrink-0">{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-2">
          <DutyPill user={user} onToggled={refresh} />
        </div>

        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="mx-3 mb-2 text-left rounded-lg px-3 py-2 text-xs text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          Sign out
        </button>

        <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-amber text-[#2b1800] font-bold text-sm flex items-center justify-center shrink-0">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user.name}</div>
            <div className="text-[11px] text-white/45 truncate">
              {ROLE_TAG[user.role](user)}{ROLE_SUB[user.role](user) ? ` · ${ROLE_SUB[user.role](user)}` : ''}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
