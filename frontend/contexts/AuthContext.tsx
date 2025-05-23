// frontend/contexts/AuthContext.tsx - VERSÃO SEGURA
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

// ⚠️ NUNCA decodifique JWTs no frontend para dados sensíveis!
// JWTs são visíveis no browser - apenas para dados não-sensíveis

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
      const storedToken = localStorage.getItem('token');
      
      if (storedToken) {
        // ✅ SEGURO: Buscar dados do usuário do backend
        // Em vez de decodificar JWT no frontend
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        
        setToken(storedToken);
        setUser(response.data.user);
      }
    } catch (error) {
      console.error('Erro ao inicializar autenticação:', error);
      // Token inválido - limpar estado
      localStorage.removeItem('token');
      document.cookie = 'token=; Max-Age=0; path=/';
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

      // Armazenar tokens de forma segura
      localStorage.setItem('token', newToken);
      localStorage.setItem('refreshToken', newRefreshToken);
      
      // Cookie httpOnly seria melhor, mas Next.js middleware não consegue ler
      document.cookie = `token=${newToken}; path=/; secure; samesite=strict`;

      setToken(newToken);
      setUser(userData);

      // Log de segurança (sem dados sensíveis)
      console.log('Login successful', { userId: userData.id, timestamp: new Date().toISOString() });
      
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      
      // Rate limiting ou outros erros específicos
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
      const storedRefreshToken = localStorage.getItem('refreshToken');
      
      if (!storedRefreshToken) {
        return false;
      }

      const response = await api.post('/auth/refresh', {
        refreshToken: storedRefreshToken
      });

      const { token: newToken } = response.data;
      
      localStorage.setItem('token', newToken);
      document.cookie = `token=${newToken}; path=/; secure; samesite=strict`;
      
      setToken(newToken);
      
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // Refresh falhou - fazer logout
      logout();
      return false;
    }
  }

  function logout() {
    // Limpar TODOS os vestígios
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    document.cookie = 'token=; Max-Age=0; path=/';
    
    setToken(null);
    setUser(null);
    
    // Log de segurança
    console.log('User logged out', { timestamp: new Date().toISOString() });
    
    // Redirecionar após cleanup
    window.location.href = '/login';
  }

  // Auto-refresh token antes de expirar
  useEffect(() => {
    if (!token) return;

    // ✅ SEGURO: Verificar expiração via API, não decodificando JWT
    const checkTokenValidity = async () => {
      try {
        await api.get('/auth/validate');
      } catch (error: any) {
        if (error.response?.status === 401) {
          // Token expirado - tentar refresh
          const refreshed = await refreshToken();
          if (!refreshed) {
            logout();
          }
        }
      }
    };

    // Verificar a cada 5 minutos
    const interval = setInterval(checkTokenValidity, 5 * 60 * 1000);
    
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