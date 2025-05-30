// frontend/contexts/AuthContext.tsx - VERSÃO CORRIGIDA URGENTE
import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react'
import api from '@/lib/api'

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  company?: {
    id: number;
    name: string;
  };
}

interface AuthContextData {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  userRole: string | null;
  userId: number | null;
  companyId: number | null;
  userName: string | null;
  companyName: string | null;
  refreshToken: () => Promise<boolean>;
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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar estado inicial
  useEffect(() => {
    initializeAuth();
  }, []);

  async function initializeAuth() {
    setIsLoading(true);
    
    try {
      // APENAS buscar do localStorage - não mexer com cookies de outros sites
      const storedToken = localStorage.getItem('zenit_token'); // Prefixo específico
      
      if (storedToken) {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        
        setToken(storedToken);
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Erro ao inicializar autenticação:', error);
      // Token inválido - limpar APENAS nossos dados
      safeCleanup();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    try {
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

      setToken(newToken);
      setUser(userData);

      console.log('Login successful', { userId: userData.id, timestamp: new Date().toISOString() });
      
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      
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
    
    // Remover APENAS nosso cookie específico
    removeSecureCookie('zenit_token');
    
    setToken(null);
    setUser(null);
  }

  function logout() {
    safeCleanup();
    
    console.log('User logged out', { timestamp: new Date().toISOString() });
    
    // Redirecionar após cleanup
    window.location.href = '/login';
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
        userRole: user?.role || null,
        userId: user?.id || null,
        companyId: user?.company?.id || null,
        userName: user?.name || null,
        companyName: user?.company?.name || null
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