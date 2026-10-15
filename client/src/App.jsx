import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Shell from './components/Shell';

import StudentNewRequest from './pages/student/NewRequest';
import StudentMyRequests from './pages/student/MyRequests';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import RequestDetail from './pages/RequestDetail';

import AdminOverview from './pages/admin/Overview';
import AdminRequests from './pages/admin/Requests';
import AdminTechnicians from './pages/admin/Technicians';
import AdminSettings from './pages/admin/Settings';
import AdminUsers from './pages/admin/Users';
import Landing from './pages/Landing';
import { dashboardPath } from './lib/paths';

function Splash() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex items-center gap-2 text-mu text-sm">
        <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-brand animate-spin" />
        Loading CMMS…
      </div>
    </div>
  );
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={dashboardPath(user)} replace />;
  return children;
}

function RoleAwareFallback() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return <Navigate to={user ? dashboardPath(user) : '/'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Shell />}>
        {/* Temporary: this role's home page arrives in a later sprint, so send them to Profile for now */}
        <Route path="/tech/work-orders" element={<Protected roles={['technician']}><Navigate to="/profile" replace /></Protected>} />

        {/* Student / Staff / Faculty (requester) */}
        <Route path="/requests/new" element={<Protected roles={['requester']}><StudentNewRequest /></Protected>} />
        <Route path="/requests/mine" element={<Protected roles={['requester']}><StudentMyRequests /></Protected>} />

        {/* Shared detail + notifications + profile */}
        <Route path="/requests/:id" element={<Protected roles={['requester', 'technician', 'admin']}><RequestDetail /></Protected>} />
        <Route path="/notifications" element={<Protected roles={['requester', 'technician', 'admin']}><Notifications /></Protected>} />
        <Route path="/profile" element={<Protected roles={['requester', 'technician', 'admin']}><Profile /></Protected>} />

        {/* Admin */}
        <Route path="/admin/overview" element={<Protected roles={['admin']}><AdminOverview /></Protected>} />
        <Route path="/admin/requests" element={<Protected roles={['admin']}><AdminRequests /></Protected>} />
        <Route path="/admin/technicians" element={<Protected roles={['admin']}><AdminTechnicians /></Protected>} />
        <Route path="/admin/settings" element={<Protected roles={['admin']}><AdminSettings /></Protected>} />
        <Route path="/admin/users" element={<Protected roles={['admin']}><AdminUsers /></Protected>} />
      </Route>

      <Route path="*" element={<RoleAwareFallback />} />
    </Routes>
  );
}
