export type UserRole = 'ADMIN' | 'SUPERUSER' | 'USER'

export interface CompanyRef {
  id: number
  code: number
}

export function allowedRolesForCompany(currentRole: UserRole | null, _company: CompanyRef): UserRole[] {
  if (currentRole === 'ADMIN') return ['SUPERUSER', 'USER']

  if (currentRole === 'SUPERUSER') {
    return ['SUPERUSER', 'USER']
  }

  return ['USER']
}

export function defaultRoleForCompany(currentRole: UserRole | null, company: CompanyRef): UserRole {
  const allowedRoles = allowedRolesForCompany(currentRole, company)
  return allowedRoles[0] || 'USER'
}

export function normalizeUserRole(role: string | null | undefined): UserRole {
  if (role === 'ADMIN' || role === 'SUPERUSER' || role === 'USER') {
    return role
  }
  return 'USER'
}
