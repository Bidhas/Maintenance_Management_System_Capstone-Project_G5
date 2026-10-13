import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cmms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

/** Pulls a friendly message + field errors out of any API error. */
export function apiError(err) {
  const data = err?.response?.data;
  return { message: data?.error || 'Something went wrong. Please try again.', fields: data?.fields || {} };
}

export default api;
