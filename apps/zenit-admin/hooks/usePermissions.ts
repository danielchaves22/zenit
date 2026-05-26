import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'ADMIN' | 'SUPERUSER' | 'USER';

interface PermissionConfig {
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
}

export function usePermissions() {
  const {
    userRole,
    isCompanyOwner,
    manageFinancialAccounts,
    manageFinancialCategories
  } = useAuth();

  const roleHierarchy: Record<UserRole, number> = {
    ADMIN: 3,
    SUPERUSER: 2,
    USER: 1
  };

  const hasRole = (requiredRole: UserRole): boolean => {
    if (!userRole) return false;

    const userLevel = roleHierarchy[userRole as UserRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  };

  const hasPermission = (config: PermissionConfig): boolean => {
    if (!userRole) return false;

    const currentRole = userRole as UserRole;

    if (config.deniedRoles?.includes(currentRole)) {
      return false;
    }

    if (config.allowedRoles) {
      return config.allowedRoles.includes(currentRole);
    }

    if (config.requiredRole) {
      return hasRole(config.requiredRole);
    }

    return true;
  };

  const hasAppPermission = (
    perm: 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES'
  ): boolean => {
    if (hasRole('ADMIN') || hasRole('SUPERUSER')) return true;
    if (perm === 'FINANCIAL_ACCOUNTS') return manageFinancialAccounts || false;
    if (perm === 'FINANCIAL_CATEGORIES') return manageFinancialCategories || false;
    return false;
  };

  const canManageCompanies = (): boolean => {
    return hasRole('ADMIN');
  };

  const canManageUsers = (): boolean => {
    return hasRole('SUPERUSER');
  };

  const canAccessSettings = (): boolean => {
    return hasRole('SUPERUSER');
  };

  const canManageCompanyOwnership = (): boolean => {
    return isAdmin() || isCompanyOwner;
  };

  const canResetFinancialHistory = (): boolean => {
    return isAdmin() || isCompanyOwner;
  };

  const canAccessFinancialReports = (): boolean => {
    return hasRole('USER');
  };

  const canCreateTransactions = (): boolean => {
    return hasRole('USER');
  };

  const canManageFinancialAccounts = (): boolean => {
    if (hasRole('ADMIN') || hasRole('SUPERUSER')) return true;
    return manageFinancialAccounts || false;
  };

  const canManageCategories = (): boolean => {
    if (hasRole('ADMIN') || hasRole('SUPERUSER')) return true;
    return manageFinancialCategories || false;
  };

  const isAdmin = (): boolean => {
    return userRole === 'ADMIN';
  };

  const isSuperUserOrAbove = (): boolean => {
    return hasRole('SUPERUSER');
  };

  const isRegularUser = (): boolean => {
    return userRole === 'USER';
  };

  const getRoleLevel = (): number => {
    return roleHierarchy[userRole as UserRole] || 0;
  };

  const getRoleLabel = (): string => {
    const labels: Record<UserRole, string> = {
      ADMIN: 'Administrador',
      SUPERUSER: 'Superusuario',
      USER: 'Usuario'
    };

    return labels[userRole as UserRole] || 'Desconhecido';
  };

  return {
    hasRole,
    hasPermission,
    canManageCompanies,
    canManageUsers,
    canAccessSettings,
    canManageCompanyOwnership,
    canResetFinancialHistory,
    canAccessFinancialReports,
    canCreateTransactions,
    canManageFinancialAccounts,
    canManageCategories,
    hasAppPermission,
    isAdmin,
    isSuperUserOrAbove,
    isRegularUser,
    getRoleLevel,
    getRoleLabel,
    currentRole: userRole as UserRole,
    isCompanyOwner,
    isAuthenticated: !!userRole
  };
}
