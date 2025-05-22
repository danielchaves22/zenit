// frontend/contexts/AuthContext.tsx
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
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega token do localStorage
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) {
      setToken(t);
      // Não buscar perfil imediatamente, deixar o JWT payload fazer isso
      decodeTokenAndSetUser(t);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Decodifica JWT e extrai informações básicas
  function decodeTokenAndSetUser(authToken: string) {
    try {
      const payload = decodeJwt(authToken);
      
      // Criar objeto user básico do token
      if (payload.userId) {
        setUser({
          id: payload.userId,
          name: payload.userName || 'Usuário',
          email: payload.userEmail || '',
          role: payload.role || 'USER',
          company: payload.companyId ? {
            id: payload.companyId,
            name: payload.companyName || 'Empresa'
          } : undefined
        });
      }
    } catch (error) {
      console.error('Erro ao decodificar token:', error);
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  // Decodifica JWT puro
  function decodeJwt(token: string): any {
    try {
      const [, payload] = token.split('.');
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(b64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('');
      return JSON.parse(decodeURIComponent(json));
    } catch {
      return {};
    }
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: userData } = res.data;

    // Armazena token
    localStorage.setItem('token', newToken);
    document.cookie = `token=${newToken}; path=/`;

    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('token');
    document.cookie = 'token=; Max-Age=0; path=/';
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider
      value={{ 
        token, 
        user, 
        login, 
        logout, 
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
  return useContext(AuthContext);
}