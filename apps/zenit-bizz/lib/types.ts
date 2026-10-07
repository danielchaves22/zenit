export interface Company {
  id: number;
  name: string;
  role: string;
  isDefault: boolean;
}
export interface AppAccess {
  appKey: string;
  enabled: boolean;
  granted: boolean;
  allowed: boolean;
}
export interface User {
  id: number;
  name: string;
  email: string;
  mustChangePassword: boolean;
  companies: Company[];
  appAccessByCompany: Record<string, AppAccess[]>;
}
export interface Contact {
  id: string;
  name: string;
  personType: 'PERSON' | 'BUSINESS';
  isCustomer: boolean;
  isSupplier: boolean;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ContactList {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
}
export function allowedCompanies(user: User) {
  return user.companies.filter((company) =>
    user.appAccessByCompany?.[company.id]?.some((access) => access.appKey === 'zenit-bizz' && access.allowed)
  );
}
