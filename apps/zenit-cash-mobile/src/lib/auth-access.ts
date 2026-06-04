import { APP_KEY } from '@/constants/app';
import { AuthCompany, AuthUser } from './auth-types';

export function isCompanyAccessible(user: AuthUser, companyId: number, appKey = APP_KEY) {
  const entries = user.appAccessByCompany?.[companyId] || [];
  return entries.some((entry) => entry.appKey === appKey && entry.allowed);
}

export function getAccessibleCompanies(user: AuthUser, appKey = APP_KEY): AuthCompany[] {
  return user.companies.filter((company) => isCompanyAccessible(user, company.id, appKey));
}

export function pickInitialCompanyId(user: AuthUser, preferredCompanyId: number | null): number | null {
  if (preferredCompanyId && isCompanyAccessible(user, preferredCompanyId)) {
    return preferredCompanyId;
  }

  const defaultCompany = user.companies.find(
    (company) => company.isDefault && isCompanyAccessible(user, company.id)
  );
  if (defaultCompany) {
    return defaultCompany.id;
  }

  return getAccessibleCompanies(user)[0]?.id ?? null;
}
