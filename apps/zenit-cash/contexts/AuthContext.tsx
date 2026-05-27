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
import {
  clearSessionCookie,
  clearSessionStorage,
  persistSession,
  readStoredCompanyId,
  readStoredMustChangePassword,
  readStoredRefreshToken,
  readStoredToken,
  setSessionCookie,
  storeCompanyId,
  storeMustChangePassword,
  storeThemePreference
} from '@/lib/auth-storage'
import { hasAppAccess, pickAccessibleCompanyId } from '@/lib/auth-access'
import { getErrorStatus } from '@/lib/http-error'

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
  isCompanyOwner?: boolean
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
  isCompanyOwner: boolean
  manageFinancialAccounts: boolean
  manageFinancialCategories: boolean
  refreshToken: () => Promise<boolean>
  mustChangePassword: boolean
  updateMustChangePassword: (value: boolean) => void
  changeCompany: (id: number) => void
  hasCurrentAppAccess: boolean
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)

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
      const storedToken = readStoredToken()
      const storedMustChange = readStoredMustChangePassword()

      setMustChangePassword(storedMustChange)

      if (storedToken) {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        })

        const userData = {
          ...response.data.user,
          mustChangePassword: storedMustChange
        } as User

        setToken(storedToken)
        setUser(userData)

        if (response.data.preferences?.colorScheme) {
          changeTheme(response.data.preferences.colorScheme)
          storeThemePreference(response.data.preferences.colorScheme)
        }

        const parsedStoredCompany = readStoredCompanyId()
        const accessibleCompany = pickAccessibleCompanyId(userData)
        const selectedCompanyId =
          parsedStoredCompany && hasAppAccess(userData, parsedStoredCompany)
            ? parsedStoredCompany
            : accessibleCompany

        setCompanyId(selectedCompanyId)
        if (selectedCompanyId !== null) {
          storeCompanyId(selectedCompanyId)
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

    persistSession({
      token: newToken,
      refreshToken: newRefreshToken,
      mustChangePassword: userData.mustChangePassword
    })
    setSessionCookie(SSO_STORAGE_KEYS.token, newToken, 60 * 60 * 24 * 7)
    setMustChangePassword(userData.mustChangePassword)

    setToken(newToken)
    setUser(userData)

    if (preferences?.colorScheme) {
      changeTheme(preferences.colorScheme)
      storeThemePreference(preferences.colorScheme)
    }

    const nextCompanyId = pickAccessibleCompanyId(userData)
    setCompanyId(nextCompanyId)
    if (nextCompanyId !== null) {
      storeCompanyId(nextCompanyId)
    }

    return userData
  }

  async function refreshToken(): Promise<boolean> {
    try {
      const storedRefreshToken = readStoredRefreshToken()
      if (!storedRefreshToken) {
        return false
      }

      const response = await api.post('/auth/refresh', {
        refreshToken: storedRefreshToken
      })

      const { token: newToken } = response.data

      persistSession({
        token: newToken,
        refreshToken: storedRefreshToken,
        mustChangePassword
      })
      setSessionCookie(SSO_STORAGE_KEYS.token, newToken, 60 * 60 * 24 * 7)
      setToken(newToken)

      return true
    } catch (_error) {
      safeCleanup()
      return false
    }
  }

  function safeCleanup() {
    clearSessionStorage()
    clearSessionCookie(SSO_STORAGE_KEYS.token)

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
    storeMustChangePassword(value)
    if (user) {
      setUser({ ...user, mustChangePassword: value })
    }
  }

  function changeCompany(id: number) {
    setCompanyId(id)
    storeCompanyId(id)
  }

  useEffect(() => {
    if (!token) return

    const checkTokenValidity = async () => {
      try {
        await api.get('/auth/validate')
      } catch (error) {
        if (getErrorStatus(error) === 401) {
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
        isCompanyOwner:
          user && companyId
            ? user.companies.find(c => c.id === companyId)?.isCompanyOwner || false
            : false,
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
