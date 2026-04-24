export const APP_KEYS = ['zenit-cash', 'zenit-calc', 'zenit-admin'] as const

export type AppKey = (typeof APP_KEYS)[number]

export interface CompanyAppEntitlement {
  companyId: number
  appKey: AppKey
  enabled: boolean
}

export interface UserAppGrant {
  userId: number
  companyId: number
  appKey: AppKey
  granted: boolean
}

export interface EffectiveAppAccess {
  userId: number
  companyId: number
  appKey: AppKey
  allowed: boolean
}

export function isAppKey(value: string): value is AppKey {
  return APP_KEYS.includes(value as AppKey)
}

export function computeEffectiveAppAccess(
  userId: number,
  companyId: number,
  entitlements: CompanyAppEntitlement[],
  grants: UserAppGrant[]
): EffectiveAppAccess[] {
  return APP_KEYS.map(appKey => {
    const enabled = entitlements.some(
      entitlement => entitlement.companyId === companyId && entitlement.appKey === appKey && entitlement.enabled
    )
    const granted = grants.some(
      grant => grant.userId === userId && grant.companyId === companyId && grant.appKey === appKey && grant.granted
    )

    return {
      userId,
      companyId,
      appKey,
      allowed: enabled && granted
    }
  })
}

export function toGrantedAppKeys(grants: UserAppGrant[], companyId: number): AppKey[] {
  return APP_KEYS.filter(appKey =>
    grants.some(grant => grant.companyId === companyId && grant.appKey === appKey && grant.granted)
  )
}
