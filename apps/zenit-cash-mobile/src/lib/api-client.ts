import axios, { AxiosHeaders } from 'axios';
import { API_URL, APP_KEY } from '@/constants/app';
import { useAuthStore } from '@/store/auth-store';

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use(async (config) => {
  const state = useAuthStore.getState();
  const headers =
    config.headers instanceof AxiosHeaders
      ? config.headers
      : new AxiosHeaders(config.headers);
  headers.set('X-App-Key', APP_KEY);

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  if (state.companyId) {
    headers.set('X-Company-Id', String(state.companyId));
  }

  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;
      const refreshedToken = await useAuthStore.getState().refreshAccessToken();
      if (refreshedToken) {
        const retryHeaders =
          originalRequest.headers instanceof AxiosHeaders
            ? originalRequest.headers
            : new AxiosHeaders(originalRequest.headers);
        retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
        originalRequest.headers = retryHeaders;
        return api(originalRequest);
      }
    }

    throw error;
  }
);

export default api;
