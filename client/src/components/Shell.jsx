import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../lib/paths';
import { ROLE_LABEL } from '../lib/ui';
import NotificationBell from './NotificationBell';
import '../styles/cm.css';

const NAV = {
  requester: [
    { to: '/requests/mine', label: 'My requests' },
    { to: '/requests/new', label: 'New request' },
  ],
  technician: [
  ],
  admin: [
    { to: '/admin/overview', label: 'Overview' },
    { to: '/admin/requests', label: 'Requests' },
    { to: '/admin/technicians', label: 'Technicians' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/settings', label: 'Settings' },
  ],
};

function readTheme() { try { return localStorage.getItem('cmms_theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signedIn = !!user;

  // light / dark switch lives on <html> only while signed in, so Landing/Login/Register never change
  useEffect(() => {
    if (!signedIn) return undefined;
    const root = document.documentElement;
    root.dataset.theme = readTheme();
    return () => { delete root.dataset.theme; };
  }, [signedIn]);

  // calm the animated background once inside the workspace
  useEffect(() => {
    if (!signedIn) return undefined;
    const root = document.documentElement;
    root.classList.add('calm');
    const vid = document.getElementById('vid');
    vid?.pause?.();
    return () => { root.classList.remove('calm'); vid?.play?.()?.catch?.(() => {}); };
  }, [signedIn]);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cmms_theme', next); } catch { /* ignore */ }
  }

  if (!user) return <Outlet />;
  const items = NAV[user.role] || [];

  return (
    <div className="cm">
      <header className="g">
        <Link to={dashboardPath(user)} className="brand">
          <img src="/logo.png" alt="" />
          <span>CampusCare<small>College of Science &amp; Technology</small></span>
        </Link>
        <nav className="navlinks" aria-label="Main">
          {items.map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'on' : '')}>{i.label}</NavLink>)}
        </nav>
        <span className="sp" />
        <button type="button" className="btn s xs" onClick={toggleTheme}>Light / dark</button>
        <NotificationBell />
        <Link to="/profile" className="who">
          <b>{user.name}</b>
          <small>{ROLE_LABEL[user.role](user)}</small>
        </Link>
        <button type="button" className="btn s xs" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
      </header>
      <main key={pathname} className="page rv"><Outlet /></main>
    </div>
  );
}
