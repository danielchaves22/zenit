// frontend/contexts/AuthContext.tsx - VERSÃO CORRIGIDA URGENTE
import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react'
import { useRouter } from 'next/router'
import api from '@/lib/api'

interface CompanyRole {
  id: number;
  name: string;
  role: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  companies: (CompanyRole & { manageFinancialAccounts?: boolean; manageFinancialCategories?: boolean })[];
  mustChangePassword?: boolean;
}

interface AuthContextData {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  isLoading: boolean;
  userRole: string | null;
  userId: number | null;
  companyId: number | null;
  userName: string | null;
  companyName: string | null;
  manageFinancialAccounts: boolean;
  manageFinancialCategories: boolean;
  refreshToken: () => Promise<boolean>;
  mustChangePassword: boolean;
  updateMustChangePassword: (value: boolean) => void;
  changeCompany: (id: number) => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

// Função auxiliar para configurar cookies de forma segura
function setSecureCookie(name: string, value: string, maxAge?: number) {
  const domain = window.location.hostname;
  const isLocalhost = domain === 'localhost' || domain === '127.0.0.1';
  
  let cookieString = `${name}=${value}; path=/`;
  
  // Só adicionar domínio se não for localhost
  if (!isLocalhost) {
    cookieString += `; domain=${domain}`;
  }
  
  // Adicionar configurações de segurança
  cookieString += `; samesite=strict`;
  
  // Só usar secure em HTTPS
  if (window.location.protocol === 'https:') {
    cookieString += `; secure`;
  }
  
  // Adicionar expiração se fornecida
  if (maxAge !== undefined) {
    cookieString += `; max-age=${maxAge}`;
  }
  
  document.cookie = cookieString;
}

// Função auxiliar para remover cookies de forma segura
function removeSecureCookie(name: string) {
  const domain = window.location.hostname;
  const isLocalhost = domain === 'localhost' || domain === '127.0.0.1';
  
  // Tentar remover com diferentes configurações para garantir limpeza
  const cookieConfigs = [
    `${name}=; max-age=0; path=/`,
    `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`,
  ];
  
  // Só adicionar domínio se não for localhost
  if (!isLocalhost) {
    cookieConfigs.push(
      `${name}=; max-age=0; path=/; domain=${domain}`,
      `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`,
      `${name}=; max-age=0; path=/; domain=.${domain}`,
    );
  }
  
  cookieConfigs.forEach(config => {
    document.cookie = config;
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  // Carregar estado inicial
  useEffect(() => {
    initializeAuth();
  }, []);

  async function initializeAuth() {
    setIsLoading(true);
    
    try {
      // APENAS buscar do localStorage - não mexer com cookies de outros sites
      const storedToken = localStorage.getItem('zenit_token'); // Prefixo específico
      const storedMustChange = localStorage.getItem('zenit_must_change_password');

      if (storedMustChange) {
        setMustChangePassword(storedMustChange === 'true');
      }

      if (storedToken) {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });

        setToken(storedToken);
        setUser({ ...response.data.user, mustChangePassword: storedMustChange === 'true' });

        const storedCompanyId = localStorage.getItem('zenit_company_id');
        const initialCompanyId = storedCompanyId
          ? Number(storedCompanyId)
          : response.data.user.companies?.[0]?.id || null;
        setCompanyId(initialCompanyId);
        if (!storedCompanyId && initialCompanyId !== null) {
          localStorage.setItem('zenit_company_id', String(initialCompanyId));
        }
      }
    } catch (error) {
      console.error('Erro ao inicializar autenticação:', error);
      // Token inválido - limpar APENAS nossos dados
      safeCleanup();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<User> {
    console.log('🔐 [AUTH] Starting login process...');
    console.log('🔐 [AUTH] Email:', email);
    
    try {
      console.log('🔐 [AUTH] Making API call to /auth/login');
      const res = await api.post('/auth/login', { 
        email: email.toLowerCase().trim(), 
        password 
      });
      
      const { token: newToken, user: userData, refreshToken: newRefreshToken } = res.data;

      // Armazenar tokens com prefixos específicos da aplicação
      localStorage.setItem('zenit_token', newToken);
      localStorage.setItem('zenit_refresh_token', newRefreshToken);
      
      // Cookie com configuração MUITO específica e segura
      setSecureCookie('zenit_token', newToken, 60 * 60 * 24 * 7); // 7 dias

      console.log(userData);

      localStorage.setItem('zenit_must_change_password', String(userData.mustChangePassword));
      setMustChangePassword(userData.mustChangePassword);

      setToken(newToken);
      setUser(userData);
      if (userData.companies && userData.companies.length > 0) {
        const firstCompany = userData.companies[0];
        setCompanyId(firstCompany.id);
        localStorage.setItem('zenit_company_id', firstCompany.id.toString());
      }

      return userData;
      
    } catch (error: any) {
      console.error('🔐 [AUTH] Login failed:', error);
      console.error('🔐 [AUTH] Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      });
      
      if (error.response?.status === 429) {
        throw new Error('Muitas tentativas de login. Tente novamente em alguns minutos.');
      }
      
      if (error.response?.status === 423) {
        throw new Error('Conta temporariamente bloqueada. Contate o suporte.');
      }
      
      throw new Error(error.response?.data?.error || 'Erro ao fazer login');
    }
  }

  async function refreshToken(): Promise<boolean> {
    try {
      const storedRefreshToken = localStorage.getItem('zenit_refresh_token');
      
      if (!storedRefreshToken) {
        return false;
      }

      const response = await api.post('/auth/refresh', {
        refreshToken: storedRefreshToken
      });

      const { token: newToken } = response.data;
      
      localStorage.setItem('zenit_token', newToken);
      setSecureCookie('zenit_token', newToken, 60 * 60 * 24 * 7); // 7 dias
      
      setToken(newToken);
      
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      safeCleanup();
      return false;
    }
  }

  // Função de limpeza SEGURA - apenas nossos dados
  function safeCleanup() {
    // Limpar APENAS dados da nossa aplicação
    localStorage.removeItem('zenit_token');
    localStorage.removeItem('zenit_refresh_token');
    localStorage.removeItem('zenit_must_change_password');
    localStorage.removeItem('zenit_company_id');
    
    // Remover APENAS nosso cookie específico
    removeSecureCookie('zenit_token');
    
    setToken(null);
    setUser(null);
    setCompanyId(null);
  }

  function logout() {
    safeCleanup();
    
    console.log('User logged out', { timestamp: new Date().toISOString() });
    
    // Redirecionar após cleanup
    window.location.href = '/login';
  }

  useEffect(() => {
    if (!isLoading && user?.mustChangePassword && router.pathname !== '/first-access') {
      router.replace('/first-access');
    }
  }, [isLoading, user, router.pathname]);

  function updateMustChangePassword(value: boolean) {
    setMustChangePassword(value);
    localStorage.setItem('zenit_must_change_password', String(value));
    if (user) {
      setUser({ ...user, mustChangePassword: value });
    }
  }

  function changeCompany(id: number) {
    setCompanyId(id);
    localStorage.setItem('zenit_company_id', String(id));
  }

  // Auto-refresh com verificação menos agressiva
  useEffect(() => {
    if (!token) return;

    const checkTokenValidity = async () => {
      try {
        await api.get('/auth/validate');
      } catch (error: any) {
        if (error.response?.status === 401) {
          const refreshed = await refreshToken();
          if (!refreshed) {
            logout();
          }
        }
      }
    };

    // Verificar a cada 10 minutos (menos agressivo)
    const interval = setInterval(checkTokenValidity, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        refreshToken,
        isLoading,
        userRole: user && companyId ? user.companies.find(c => c.id === companyId)?.role || null : null,
        userId: user?.id || null,
        companyId,
        userName: user?.name || null,
        companyName: user && companyId ? user.companies.find(c => c.id === companyId)?.name || null : null,
        manageFinancialAccounts: user && companyId ?
          user.companies.find(c => c.id === companyId)?.manageFinancialAccounts || false
          : false,
        manageFinancialCategories: user && companyId ?
          user.companies.find(c => c.id === companyId)?.manageFinancialCategories || false
          : false,
        mustChangePassword,
        updateMustChangePassword,
        changeCompany
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}