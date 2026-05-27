import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function readStorageItem(key: string): string | null {
  try {
    return getBrowserStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorageItem(key: string, value: string): void {
  getBrowserStorage()?.setItem(key, value)
}

function removeStorageItem(key: string): void {
  getBrowserStorage()?.removeItem(key)
}

function getCookieDomain(): { domain: string; isLocalhost: boolean } | null {
  if (typeof window === 'undefined') {
    return null
  }

  const domain = window.location.hostname
  return {
    domain,
    isLocalhost: domain === 'localhost' || domain === '127.0.0.1'
  }
}

export function readStoredToken(): string | null {
  return readStorageItem(SSO_STORAGE_KEYS.token)
}

export function readStoredRefreshToken(): string | null {
  return readStorageItem(SSO_STORAGE_KEYS.refreshToken)
}

export function readStoredCompanyId(): number | null {
  const storedCompanyId = readStorageItem(SSO_STORAGE_KEYS.companyId)
  if (!storedCompanyId) {
    return null
  }

  const parsedCompanyId = Number(storedCompanyId)
  return Number.isFinite(parsedCompanyId) ? parsedCompanyId : null
}

export function readStoredMustChangePassword(): boolean {
  return readStorageItem(SSO_STORAGE_KEYS.mustChangePassword) === 'true'
}

export function storeMustChangePassword(value: boolean): void {
  writeStorageItem(SSO_STORAGE_KEYS.mustChangePassword, String(value))
}

export function storeCompanyId(companyId: number): void {
  writeStorageItem(SSO_STORAGE_KEYS.companyId, String(companyId))
}

export function storeThemePreference(themeKey: string): void {
  writeStorageItem('selected-theme', themeKey)
}

export function setSessionCookie(name: string, value: string, maxAge?: number): void {
  const location = getCookieDomain()
  if (!location) {
    return
  }

  let cookieString = `${name}=${value}; path=/`
  if (!location.isLocalhost) {
    cookieString += `; domain=${location.domain}`
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

export function clearSessionCookie(name: string): void {
  const location = getCookieDomain()
  if (!location) {
    return
  }

  const cookieConfigs = [
    `${name}=; max-age=0; path=/`,
    `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  ]

  if (!location.isLocalhost) {
    cookieConfigs.push(
      `${name}=; max-age=0; path=/; domain=${location.domain}`,
      `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.domain}`,
      `${name}=; max-age=0; path=/; domain=.${location.domain}`
    )
  }

  cookieConfigs.forEach((config) => {
    document.cookie = config
  })
}

export function persistSession(params: {
  token: string
  refreshToken: string
  mustChangePassword: boolean
  companyId?: number | null
}): void {
  writeStorageItem(SSO_STORAGE_KEYS.token, params.token)
  writeStorageItem(SSO_STORAGE_KEYS.refreshToken, params.refreshToken)
  storeMustChangePassword(params.mustChangePassword)

  if (params.companyId !== null && params.companyId !== undefined) {
    storeCompanyId(params.companyId)
  } else {
    removeStorageItem(SSO_STORAGE_KEYS.companyId)
  }
}

export function clearSessionStorage(): void {
  removeStorageItem(SSO_STORAGE_KEYS.token)
  removeStorageItem(SSO_STORAGE_KEYS.refreshToken)
  removeStorageItem(SSO_STORAGE_KEYS.mustChangePassword)
  removeStorageItem(SSO_STORAGE_KEYS.companyId)
}
