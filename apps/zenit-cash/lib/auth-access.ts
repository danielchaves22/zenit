const APP_KEY = process.env.NEXT_PUBLIC_APP_KEY || 'zenit-cash'

export interface AppAccessEntry {
  appKey: string
  allowed: boolean
}

export interface CompanyAccess {
  id: number
}

export interface UserWithAppAccess {
  companies: CompanyAccess[]
  appAccessByCompany?: Record<number, AppAccessEntry[]>
}

export function hasAppAccess(
  user: UserWithAppAccess | null,
  currentCompanyId: number | null,
  appKey: string = APP_KEY
): boolean {
  if (!user || !currentCompanyId) {
    return false
  }

  const appAccess = user.appAccessByCompany?.[currentCompanyId] || []
  return appAccess.some((entry) => entry.appKey === appKey && entry.allowed)
}

export function pickAccessibleCompanyId(
  user: UserWithAppAccess,
  appKey: string = APP_KEY
): number | null {
  for (const company of user.companies) {
    const access = user.appAccessByCompany?.[company.id] || []
    if (access.some((entry) => entry.appKey === appKey && entry.allowed)) {
      return company.id
    }
  }

  return null
}
