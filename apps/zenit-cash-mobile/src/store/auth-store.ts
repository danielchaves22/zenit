import { create } from 'zustand';
import { APP_KEY } from '@/constants/app';
import { API_URL } from '@/constants/app';
import { clearPersistedSession, persistCompanyId, persistSession, readStoredCompanyId, readStoredRefreshToken, readStoredToken } from '@/lib/auth-session';
import { AuthUser, LoginResponse } from '@/lib/auth-types';
import { getAccessibleCompanies, pickInitialCompanyId } from '@/lib/auth-access';

type AuthStatus = 'bootstrapping' | 'signed_out' | 'needs_company' | 'signed_in';

type AuthStoreState = {
  status: AuthStatus;
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  companyId: number | null;
  isInitialized: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  selectCompany: (companyId: number) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
};

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    throw new Error(parsed?.error || 'Falha na requisicao');
  }

  return parsed as T;
}

async function fetchCurrentUser(token: string): Promise<{ user: AuthUser }> {
  return requestJson('/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-App-Key': APP_KEY
    }
  });
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  status: 'bootstrapping',
  token: null,
  refreshToken: null,
  user: null,
  companyId: null,
  isInitialized: false,
  bootstrap: async () => {
    try {
      const [token, refreshToken, storedCompanyId] = await Promise.all([
        readStoredToken(),
        readStoredRefreshToken(),
        readStoredCompanyId()
      ]);

      if (!token || !refreshToken) {
        set({
          status: 'signed_out',
          token: null,
          refreshToken: null,
          user: null,
          companyId: null,
          isInitialized: true
        });
        return;
      }

      set({ token, refreshToken });

      let currentToken = token;
      try {
        const me = await fetchCurrentUser(currentToken);
        const companyId = pickInitialCompanyId(me.user, storedCompanyId);

        if (!companyId) {
          set({
            status: 'needs_company',
            token: currentToken,
            refreshToken,
            user: me.user,
            companyId: null,
            isInitialized: true
          });
          return;
        }

        await persistSession({ token: currentToken, refreshToken, companyId });
        set({
          status: 'signed_in',
          token: currentToken,
          refreshToken,
          user: me.user,
          companyId,
          isInitialized: true
        });
        return;
      } catch {
        const refreshed = await get().refreshAccessToken();
        if (!refreshed) {
          await get().logout();
          return;
        }

        currentToken = refreshed;
        const me = await fetchCurrentUser(currentToken);
        const companyId = pickInitialCompanyId(me.user, storedCompanyId);

        if (!companyId) {
          set({
            status: 'needs_company',
            token: currentToken,
            refreshToken,
            user: me.user,
            companyId: null,
            isInitialized: true
          });
          return;
        }

        await persistSession({ token: currentToken, refreshToken, companyId });
        set({
          status: 'signed_in',
          token: currentToken,
          refreshToken,
          user: me.user,
          companyId,
          isInitialized: true
        });
      }
    } catch {
      await get().logout();
    }
  },
  login: async (email: string, password: string) => {
    const response = await requestJson<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': APP_KEY
      },
      body: JSON.stringify({ email, password })
    });

    const accessibleCompanies = getAccessibleCompanies(response.user);
    const companyId =
      accessibleCompanies.length === 1
        ? accessibleCompanies[0].id
        : pickInitialCompanyId(response.user, null);

    await persistSession({
      token: response.token,
      refreshToken: response.refreshToken,
      companyId
    });

    set({
      token: response.token,
      refreshToken: response.refreshToken,
      user: response.user,
      companyId: companyId ?? null,
      status: companyId ? 'signed_in' : 'needs_company',
      isInitialized: true
    });
  },
  selectCompany: async (companyId: number) => {
    const user = get().user;
    if (!user) {
      throw new Error('Usuario nao autenticado');
    }

    const companies = getAccessibleCompanies(user);
    if (!companies.some((company) => company.id === companyId)) {
      throw new Error('Empresa nao acessivel para este usuario');
    }

    await persistCompanyId(companyId);
    set({
      companyId,
      status: 'signed_in'
    });
  },
  refreshAccessToken: async () => {
    const refreshToken = get().refreshToken;
    const companyId = get().companyId;
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await requestJson<{ token: string }>('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Key': APP_KEY
        },
        body: JSON.stringify({ refreshToken })
      });

      await persistSession({
        token: response.token,
        refreshToken,
        companyId
      });

      set({
        token: response.token
      });

      return response.token;
    } catch {
      return null;
    }
  },
  logout: async () => {
    await clearPersistedSession();
    set({
      status: 'signed_out',
      token: null,
      refreshToken: null,
      user: null,
      companyId: null,
      isInitialized: true
    });
  }
}));
