import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core'

export interface StorageLike {
  getItem(key: string): string | null
}

export function buildSessionHeaders(
  storage: StorageLike | null,
  appKey: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-App-Key': appKey
  }

  const token = storage?.getItem(SSO_STORAGE_KEYS.token)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const companyId = storage?.getItem(SSO_STORAGE_KEYS.companyId)
  if (companyId) {
    headers['X-Company-Id'] = companyId
  }

  return headers
}
