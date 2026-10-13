import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { apiError, setUnauthorizedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('cmms_token');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    const token = localStorage.getItem('cmms_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me').then((res) => setUser(res.data.user)).catch(() => logout()).finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async ({ role, identifier, password, remember }) => {
    try {
      const res = await api.post('/auth/login', { role, identifier, password, remember });
      localStorage.setItem('cmms_token', res.data.token);
      setUser(res.data.user);
      return { ok: true, user: res.data.user };
    } catch (err) {
      return { ok: false, ...apiError(err) };
    }
  }, []);

  const register = useCallback(async (payload) => {
    try {
      await api.post('/auth/register', payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, ...apiError(err) };
    }
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh }), [user, loading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
