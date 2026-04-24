export type UserRole = 'ADMIN' | 'SUPERUSER' | 'USER'

export interface CompanyRef {
  id: number
  code: number
}

const EQUINOX_COMPANY_CODE = 0

export function allowedRolesForCompany(currentRole: UserRole | null, company: CompanyRef): UserRole[] {
  if (currentRole === 'ADMIN') {
    const roles: UserRole[] = ['SUPERUSER', 'USER']
    if (company.code === EQUINOX_COMPANY_CODE) {
      roles.unshift('ADMIN')
    }
    return roles
  }

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
