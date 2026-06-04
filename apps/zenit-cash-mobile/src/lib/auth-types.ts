export type AppAccessEntry = {
  appKey: string;
  allowed: boolean;
};

export type AuthCompany = {
  id: number;
  name: string;
  role: string;
  isDefault: boolean;
  isCompanyOwner: boolean;
  manageFinancialAccounts: boolean;
  manageFinancialCategories: boolean;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  mustChangePassword: boolean;
  companies: AuthCompany[];
  appAccessByCompany: Record<number, AppAccessEntry[]>;
};

export type LoginResponse = {
  token: string;
  refreshToken: string;
  user: AuthUser;
  preferences?: {
    colorScheme: string | null;
  };
  message?: string;
};
