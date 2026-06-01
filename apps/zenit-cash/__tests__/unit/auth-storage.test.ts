import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'
import {
  clearSessionCookie,
  clearSessionStorage,
  persistSession,
  readStoredHomeBalancesVisibility,
  readStoredHomeScreenPreference,
  readStoredCompanyId,
  readStoredMustChangePassword,
  readStoredRefreshToken,
  readStoredToken,
  setSessionCookie,
  storeHomeBalancesVisibility,
  storeHomeScreenPreference,
  storeCompanyId,
  storeMustChangePassword
} from '@/lib/auth-storage'

describe('auth storage helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = ''
  })

  it('persists and reads the current session', () => {
    persistSession({
      token: 'access-token',
      refreshToken: 'refresh-token',
      mustChangePassword: true,
      companyId: 9
    })

    expect(readStoredToken()).toBe('access-token')
    expect(readStoredRefreshToken()).toBe('refresh-token')
    expect(readStoredMustChangePassword()).toBe(true)
    expect(readStoredCompanyId()).toBe(9)
  })

  it('clears stored session state', () => {
    persistSession({
      token: 'access-token',
      refreshToken: 'refresh-token',
      mustChangePassword: true,
      companyId: 9
    })

    clearSessionStorage()

    expect(readStoredToken()).toBeNull()
    expect(readStoredRefreshToken()).toBeNull()
    expect(readStoredMustChangePassword()).toBe(false)
    expect(readStoredCompanyId()).toBeNull()
  })

  it('stores company and password reset flags independently', () => {
    storeCompanyId(15)
    storeMustChangePassword(true)

    expect(localStorage.getItem(SSO_STORAGE_KEYS.companyId)).toBe('15')
    expect(localStorage.getItem(SSO_STORAGE_KEYS.mustChangePassword)).toBe('true')
  })

  it('stores the preferred home screen and normalizes invalid values', () => {
    storeHomeScreenPreference('accounts-overview')
    expect(readStoredHomeScreenPreference()).toBe('accounts-overview')

    localStorage.setItem('home-screen-preference', 'unexpected')
    expect(readStoredHomeScreenPreference()).toBeNull()
  })

  it('stores the visibility of values on the financial home view', () => {
    expect(readStoredHomeBalancesVisibility()).toBe(true)

    storeHomeBalancesVisibility(false)
    expect(readStoredHomeBalancesVisibility()).toBe(false)

    storeHomeBalancesVisibility(true)
    expect(readStoredHomeBalancesVisibility()).toBe(true)
  })

  it('writes and clears the session cookie', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      hostname: 'localhost',
      protocol: 'http:'
    })

    setSessionCookie('zenit_sso_token', 'token-value', 60)
    expect(document.cookie).toContain('zenit_sso_token=token-value')

    clearSessionCookie('zenit_sso_token')
    expect(document.cookie).not.toContain('zenit_sso_token=token-value')
  })
})
