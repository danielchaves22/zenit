import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'
import { clearSessionCookie, clearSessionStorage } from '@/lib/auth-storage'
import { getErrorStatus } from '@/lib/http-error'

interface ErrorWithRequestConfig {
  config?: {
    url?: string
  }
}

function getRequestPath(url: string | undefined): string {
  if (!url) {
    return ''
  }

  try {
    const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    return new URL(url, baseUrl).pathname
  } catch {
    return url
  }
}

function isLoginRequest(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const { config } = error as ErrorWithRequestConfig
  return getRequestPath(config?.url) === '/auth/login'
}

export function isExpiredSessionError(error: unknown): boolean {
  return getErrorStatus(error) === 401 && !isLoginRequest(error)
}

export function clearExpiredSessionAndRedirect(): void {
  clearSessionStorage()
  clearSessionCookie(SSO_STORAGE_KEYS.token)

  if (typeof window === 'undefined' || window.location.pathname === '/login') {
    return
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const loginUrl = new URL('/login', window.location.origin)

  if (currentPath && currentPath !== '/') {
    loginUrl.searchParams.set('redirect', currentPath)
  }

  window.location.replace(loginUrl.toString())
}
