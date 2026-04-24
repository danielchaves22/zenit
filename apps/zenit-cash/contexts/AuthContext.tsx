import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode
} from 'react'
import { useRouter } from 'next/router'
import api from '@/lib/api'
import { useTheme } from '@/contexts/ThemeContext'
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'

interface AppAccess {
  appKey: string
  enabled: boolean
  granted: boolean
  allowed: boolean
}

interface CompanyRole {
  id: number
  name: string
  role: string
  manageFinancialAccounts?: boolean
  manageFinancialCategories?: boolean
}

interface User {
  id: number
  name: string
  email: string
  companies: CompanyRole[]
  appAccessByCompany?: Record<number, AppAccess[]>
  mustChangePassword?: boolean
}

interface AuthContextData {
  token: string | null
  user: User | null
  login: (email: string, password: string) => Promise<User>
  logout: () => void
  isLoading: boolean
  userRole: string | null
  userId: number | null
  companyId: number | null
  userName: string | null
  companyName: string | null
  manageFinancialAccounts: boolean
  manageFinancialCategories: boolean
  refreshToken: () => Promise<boolean>
  mustChangePassword: boolean
  updateMustChangePassword: (value: boolean) => void
  changeCompany: (id: number) => void
  hasCurrentAppAccess: boolean
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)
const APP_KEY = process.env.NEXT_PUBLIC_APP_KEY || 'zenit-cash'

function setSecureCookie(name: string, value: string, maxAge?: number) {
  const domain = window.location.hostname
  const isLocalhost = domain === 'localhost' || domain === '127.0.0.1'

  let cookieString = `${name}=${value}; path=/`
  if (!isLocalhost) {
    cookieString += `; domain=${domain}`
  }
  cookieString += '; samesite=strict'
  if (window.location.protocol === 'https:') {
    cookieString += '; secure'
  }
  if (maxAge !== undefined) {
    cookieString += `; max-age=${maxAge}`
  }
  document.cookie = cookieString
}

function removeSecureCookie(name: string) {
  const domain = window.location.hostname
  const isLocalhost = domain === 'localhost' || domain === '127.0.0.1'

  const cookieConfigs = [
    `${name}=; max-age=0; path=/`,
    `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  ]

  if (!isLocalhost) {
    cookieConfigs.push(
      `${name}=; max-age=0; path=/; domain=${domain}`,
      `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`,
      `${name}=; max-age=0; path=/; domain=.${domain}`
    )
  }

  cookieConfigs.forEach(config => {
    document.cookie = config
  })
}

function hasAppAccess(user: User | null, currentCompanyId: number | null): boolean {
  if (!user || !currentCompanyId) return false
  const appAccess = user.appAccessByCompany?.[currentCompanyId] || []
  return appAccess.some(entry => entry.appKey === APP_KEY && entry.allowed)
}

function pickAccessibleCompanyId(user: User): number | null {
  for (const company of user.companies) {
    const access = user.appAccessByCompany?.[company.id] || []
    if (access.some(entry => entry.appKey === APP_KEY && entry.allowed)) {
      return company.id
    }
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { changeTheme } = useTheme()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false)

  useEffect(() => {
    void initializeAuth()
  }, [])

  async function initializeAuth() {
    setIsLoading(true)

    try {
      const storedToken = localStorage.getItem(SSO_STORAGE_KEYS.token)
      const storedMustChange = localStorage.getItem(SSO_STORAGE_KEYS.mustChangePassword)

      if (storedMustChange) {
        setMustChangePassword(storedMustChange === 'true')
      }

      if (storedToken) {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        })

        const userData = {
          ...response.data.user,
          mustChangePassword: storedMustChange === 'true'
        } as User

        setToken(storedToken)
        setUser(userData)

        if (response.data.preferences?.colorScheme) {
          changeTheme(response.data.preferences.colorScheme)
          localStorage.setItem('selected-theme', response.data.preferences.colorScheme)
        }

        const storedCompanyId = localStorage.getItem(SSO_STORAGE_KEYS.companyId)
        const parsedStoredCompany = storedCompanyId ? Number(storedCompanyId) : null
        const accessibleCompany = pickAccessibleCompanyId(userData)
        const selectedCompanyId =
          parsedStoredCompany && hasAppAccess(userData, parsedStoredCompany)
            ? parsedStoredCompany
            : accessibleCompany

        setCompanyId(selectedCompanyId)
        if (selectedCompanyId !== null) {
          localStorage.setItem(SSO_STORAGE_KEYS.companyId, String(selectedCompanyId))
        }
      }
    } catch (error) {
      safeCleanup()
    } finally {
      setIsLoading(false)
    }
  }

  async function login(email: string, password: string): Promise<User> {
    const response = await api.post('/auth/login', {
      email: email.toLowerCase().trim(),
      password
    })

    const { token: newToken, user: userData, refreshToken: newRefreshToken, preferences } = response.data

    localStorage.setItem(SSO_STORAGE_KEYS.token, newToken)
    localStorage.setItem(SSO_STORAGE_KEYS.refreshToken, newRefreshToken)
    setSecureCookie(SSO_STORAGE_KEYS.token, newToken, 60 * 60 * 24 * 7)

    localStorage.setItem(SSO_STORAGE_KEYS.mustChangePassword, String(userData.mustChangePassword))
    setMustChangePassword(userData.mustChangePassword)

    setToken(newToken)
    setUser(userData)

    if (preferences?.colorScheme) {
      changeTheme(preferences.colorScheme)
      localStorage.setItem('selected-theme', preferences.colorScheme)
    }

    const nextCompanyId = pickAccessibleCompanyId(userData)
    setCompanyId(nextCompanyId)
    if (nextCompanyId !== null) {
      localStorage.setItem(SSO_STORAGE_KEYS.companyId, nextCompanyId.toString())
    }

    return userData
  }

  async function refreshToken(): Promise<boolean> {
    try {
      const storedRefreshToken = localStorage.getItem(SSO_STORAGE_KEYS.refreshToken)
      if (!storedRefreshToken) {
        return false
      }

      const response = await api.post('/auth/refresh', {
        refreshToken: storedRefreshToken
      })

      const { token: newToken } = response.data

      localStorage.setItem(SSO_STORAGE_KEYS.token, newToken)
      setSecureCookie(SSO_STORAGE_KEYS.token, newToken, 60 * 60 * 24 * 7)
      setToken(newToken)

      return true
    } catch (_error) {
      safeCleanup()
      return false
    }
  }

  function safeCleanup() {
    localStorage.removeItem(SSO_STORAGE_KEYS.token)
    localStorage.removeItem(SSO_STORAGE_KEYS.refreshToken)
    localStorage.removeItem(SSO_STORAGE_KEYS.mustChangePassword)
    localStorage.removeItem(SSO_STORAGE_KEYS.companyId)

    removeSecureCookie(SSO_STORAGE_KEYS.token)

    setToken(null)
    setUser(null)
    setCompanyId(null)
  }

  function logout() {
    safeCleanup()
    window.location.href = '/login'
  }

  useEffect(() => {
    if (!isLoading && user?.mustChangePassword && router.pathname !== '/first-access') {
      router.replace('/first-access')
    }
  }, [isLoading, router, router.pathname, user])

  function updateMustChangePassword(value: boolean) {
    setMustChangePassword(value)
    localStorage.setItem(SSO_STORAGE_KEYS.mustChangePassword, String(value))
    if (user) {
      setUser({ ...user, mustChangePassword: value })
    }
  }

  function changeCompany(id: number) {
    setCompanyId(id)
    localStorage.setItem(SSO_STORAGE_KEYS.companyId, String(id))
  }

  useEffect(() => {
    if (!token) return

    const checkTokenValidity = async () => {
      try {
        await api.get('/auth/validate')
      } catch (error: any) {
        if (error.response?.status === 401) {
          const refreshed = await refreshToken()
          if (!refreshed) {
            logout()
          }
        }
      }
    }

    const interval = setInterval(checkTokenValidity, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [token])

  const hasCurrentAppAccess = useMemo(() => hasAppAccess(user, companyId), [user, companyId])

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
        manageFinancialAccounts:
          user && companyId
            ? user.companies.find(c => c.id === companyId)?.manageFinancialAccounts || false
            : false,
        manageFinancialCategories:
          user && companyId
            ? user.companies.find(c => c.id === companyId)?.manageFinancialCategories || false
            : false,
        mustChangePassword,
        updateMustChangePassword,
        changeCompany,
        hasCurrentAppAccess
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
