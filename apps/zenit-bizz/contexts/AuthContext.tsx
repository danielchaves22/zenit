import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core';
import { api, clearSession, storeSession } from '@/lib/api';
import { allowedCompanies, Company, User } from '@/lib/types';

interface Auth {
  user: User | null;
  company: Company | null;
  companies: Company[];
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  selectCompany: (id: number) => void;
  reload: () => Promise<void>;
}
const Context = createContext<Auth>({} as Auth);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const accept = useCallback((next: User) => {
    setUser(next);
    const allowed = allowedCompanies(next);
    const saved = Number(localStorage.getItem(SSO_STORAGE_KEYS.companyId));
    const selected = allowed.find((item) => item.id === saved) || (allowed.length === 1 ? allowed[0] : null);
    setCompanyId(selected?.id ?? null);
    if (selected) localStorage.setItem(SSO_STORAGE_KEYS.companyId, String(selected.id));
    else localStorage.removeItem(SSO_STORAGE_KEYS.companyId);
  }, []);
  const logout = useCallback(() => {
    generation.current++;
    clearSession();
    setUser(null);
    setCompanyId(null);
    setError('');
    setLoading(false);
  }, []);
  const reload = useCallback(
    async (quiet = false) => {
      const current = ++generation.current;
      if (!quiet) {
        setLoading(true);
        setError('');
      }
      try {
        if (!localStorage.getItem(SSO_STORAGE_KEYS.token)) {
          setUser(null);
          return;
        }
        const result = await api<{ user: User }>('/auth/me');
        if (current === generation.current) accept(result.user);
      } catch (e) {
        if (current === generation.current && !quiet)
          setError(e instanceof Error ? e.message : 'Não foi possível carregar sua sessão.');
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [accept]
  );
  useEffect(() => {
    void reload();
    const refresh = () => {
      void reload(true);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('bizz:session-expired', logout);
    window.addEventListener('bizz:access-changed', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      generation.current++;
      window.removeEventListener('bizz:session-expired', logout);
      window.removeEventListener('bizz:access-changed', refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [logout, reload]);
  async function login(email: string, password: string) {
    const current = ++generation.current;
    const result = await api<{ token: string; refreshToken: string; user: User }>('/auth/login', {
      method: 'POST',
      anonymous: true,
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    });
    if (current !== generation.current) return;
    storeSession(result.token, result.refreshToken);
    accept(result.user);
    setError('');
  }
  const companies = user ? allowedCompanies(user) : [];
  const company = companies.find((item) => item.id === companyId) || null;
  function selectCompany(id: number) {
    if (!companies.some((item) => item.id === id)) return;
    localStorage.setItem(SSO_STORAGE_KEYS.companyId, String(id));
    setCompanyId(id);
  }
  return (
    <Context.Provider
      value={{ user, company, companies, loading, error, login, logout, selectCompany, reload }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
