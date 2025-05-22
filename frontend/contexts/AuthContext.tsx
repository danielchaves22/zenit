// frontend/contexts/AuthContext.tsx
import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react'
import api from '../lib/api'

interface AuthContextData {
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  userRole: string | null
  userId: number | null
  companyIds: number[]
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]       = useState<string|null>(null)
  const [userRole, setUserRole] = useState<string|null>(null)
  const [userId, setUserId]     = useState<number|null>(null)
  const [companyIds, setCompanyIds] = useState<number[]>([])

  // 1) Carrega token do localStorage só uma vez
  useEffect(() => {
    const t = localStorage.getItem('token')
    setToken(t)
  }, [])

  // 2) Sempre que token muda, decodifica e popula claims
  useEffect(() => {
    if (!token) {
      setUserRole(null)
      setUserId(null)
      setCompanyIds([])
      return
    }
    const payload = decodeJwt(token)
    setUserRole(payload.role  ?? null)
    setUserId(   payload.userId ?? null)
    setCompanyIds(Array.isArray(payload.companyIds) ? payload.companyIds : [])
  }, [token])

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password })
    const t: string = res.data.token

    // grava nos dois lugares: localStorage **e** cookie
    localStorage.setItem('token', t)
    document.cookie = `token=${t}; path=/`

    setToken(t)
  }

  function logout() {
    localStorage.removeItem('token')
    document.cookie = 'token=; Max-Age=0; path=/'
    setToken(null)
    window.location.href = '/login'
  }

  // decodifica JWT puro
  function decodeJwt(token: string): any {
    try {
      const [, payload] = token.split('.')
      const b64 = payload.replace(/-/g,'+').replace(/_/g,'/')
      const json = atob(b64)
        .split('')
        .map(c => '%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
      return JSON.parse(decodeURIComponent(json))
    } catch {
      return {}
    }
  }

  return (
    <AuthContext.Provider
      value={{ token, login, logout, userRole, userId, companyIds }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}