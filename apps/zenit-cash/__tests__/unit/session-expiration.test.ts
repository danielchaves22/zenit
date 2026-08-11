import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'
import {
  clearExpiredSessionAndRedirect,
  isExpiredSessionError
} from '@/lib/session-expiration'
import {
  persistSession,
  readStoredCompanyId,
  readStoredRefreshToken,
  readStoredToken,
  setSessionCookie
} from '@/lib/auth-storage'

describe('session expiration handling', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects unauthorized API errors except login failures', () => {
    expect(
      isExpiredSessionError({
        response: { status: 401 },
        config: { url: '/financial/accounts' }
      })
    ).toBe(true)

    expect(
      isExpiredSessionError({
        response: { status: 401 },
        config: { url: '/auth/login' }
      })
    ).toBe(false)

    expect(
      isExpiredSessionError({
        response: { status: 403 },
        config: { url: '/financial/accounts' }
      })
    ).toBe(false)
  })

  it('clears stored session data and redirects to login with the current route', () => {
    const replace = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      hash: '',
      hostname: 'localhost',
      origin: 'http://localhost',
      pathname: '/financial/dashboard',
      protocol: 'http:',
      replace,
      search: '?month=2026-08'
    })

    persistSession({
      token: 'access-token',
      refreshToken: 'refresh-token',
      mustChangePassword: false,
      companyId: 42
    })
    setSessionCookie(SSO_STORAGE_KEYS.token, 'access-token', 60)

    clearExpiredSessionAndRedirect()

    expect(readStoredToken()).toBeNull()
    expect(readStoredRefreshToken()).toBeNull()
    expect(readStoredCompanyId()).toBeNull()
    expect(document.cookie).not.toContain(`${SSO_STORAGE_KEYS.token}=access-token`)
    expect(replace).toHaveBeenCalledWith(
      'http://localhost/login?redirect=%2Ffinancial%2Fdashboard%3Fmonth%3D2026-08'
    )
  })
})
