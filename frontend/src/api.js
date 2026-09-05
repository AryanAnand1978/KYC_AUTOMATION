import axios from 'axios';

// Single source of truth for the API base URL (previously duplicated across the
// three public pages). In production set VITE_API_URL to the backend origin.
export const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:5000/api';

// LocalStorage key holding the shared admin token entered on the login screen.
export const ADMIN_TOKEN_KEY = 'kyc_admin_token';

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || '';
export const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
export const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

// Public client — used by the applicant-facing upload / verify / result flow.
export const api = axios.create({ baseURL: API_BASE_URL });

// Admin client — every request carries the shared admin key as a Bearer token.
export const adminApi = axios.create({ baseURL: `${API_BASE_URL}/admin` });

adminApi.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
