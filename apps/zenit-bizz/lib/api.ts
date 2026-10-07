import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}
let sessionGeneration = 0;
let refreshing: { generation: number; promise: Promise<boolean> } | null = null;
export function storeSession(token: string, refreshToken: string) {
  sessionGeneration++;
  localStorage.setItem(SSO_STORAGE_KEYS.token, token);
  localStorage.setItem(SSO_STORAGE_KEYS.refreshToken, refreshToken);
}
export function clearSession() {
  sessionGeneration++;
  Object.values(SSO_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
async function refreshSession() {
  const generation = sessionGeneration;
  if (refreshing?.generation === generation) return refreshing.promise;
  const promise = (async () => {
    const refreshToken = localStorage.getItem(SSO_STORAGE_KEYS.refreshToken);
    if (!refreshToken) return false;
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': 'zenit-bizz' },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (generation !== sessionGeneration || !data.token) return false;
    localStorage.setItem(SSO_STORAGE_KEYS.token, data.token);
    return true;
  })().finally(() => {
    if (refreshing?.promise === promise) refreshing = null;
  });
  refreshing = { generation, promise };
  return promise;
}
export async function api<T>(
  path: string,
  options: RequestInit & { companyId?: number; anonymous?: boolean } = {}
): Promise<T> {
  const { companyId, anonymous, ...request } = options;
  const generation = sessionGeneration;
  const assertCurrentSession = () => {
    if (!anonymous && generation !== sessionGeneration)
      throw new ApiError(401, 'A sessão mudou. Entre novamente se necessário.');
  };
  const token = localStorage.getItem(SSO_STORAGE_KEYS.token);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-App-Key': 'zenit-bizz',
    ...(!anonymous && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(companyId ? { 'X-Company-Id': String(companyId) } : {})
  };
  const execute = () => fetch(`/api${path}`, { ...request, headers });
  let response = await execute();
  assertCurrentSession();
  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshSession();
    assertCurrentSession();
    if (refreshed) {
      headers.Authorization = `Bearer ${localStorage.getItem(SSO_STORAGE_KEYS.token)}`;
      response = await execute();
      assertCurrentSession();
    }
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event('bizz:session-expired'));
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403 && !anonymous) window.dispatchEvent(new Event('bizz:access-changed'));
    const message =
      data.details?.[0]?.message || (typeof data.error === 'string' ? data.error : data.error?.message);
    throw new ApiError(response.status, message || 'Não foi possível concluir. Tente novamente.', data.code);
  }
  return data as T;
}
