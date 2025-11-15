import axios from 'axios';
import { clearToken, getToken } from './auth';
const API_BASE = import.meta.env.VITE_API_URL ?? '';
export const api = axios.create({
    baseURL: `${API_BASE}/api`,
});
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
api.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401) {
        clearToken();
    }
    return Promise.reject(error);
});
