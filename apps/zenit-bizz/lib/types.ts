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
  phones?: string[];
  emails?: string[];
  addresses?: ContactAddress[];
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  cityIbgeCode?: string | null;
  location?: BrazilLocation | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface BrazilLocation {
  stateCode: string | null;
  cityCode: string | null;
}
export interface ContactAddress {
  id?: string;
  label: string | null;
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: BrazilLocation | null;
}
export interface GeographyState {
  id: number;
  code: string;
  name: string;
}
export interface GeographyCity {
  code: string;
  name: string;
  stateCode: string;
}
export interface ContactList {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
}
export function allowedCompanies(user: User) {
  return user.companies.filter((company) =>
    user.appAccessByCompany?.[company.id]?.some(
      (access) => access.appKey === 'zenit-bizz' && access.allowed
    )
  );
}
