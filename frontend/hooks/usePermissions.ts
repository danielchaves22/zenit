// frontend/hooks/usePermissions.ts - HOOK PARA VERIFICAÇÃO DE PERMISSÕES
import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'ADMIN' | 'SUPERUSER' | 'USER';

interface PermissionConfig {
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
}

export function usePermissions() {
  const { userRole } = useAuth();

  // ✅ HIERARQUIA DE ROLES
  const roleHierarchy: Record<UserRole, number> = {
    'ADMIN': 3,
    'SUPERUSER': 2,
    'USER': 1
  };

  // ✅ VERIFICAR SE TEM PERMISSÃO BASEADO EM ROLE MÍNIMO
  const hasRole = (requiredRole: UserRole): boolean => {
    if (!userRole) return false;
    
    const userLevel = roleHierarchy[userRole as UserRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  };

  // ✅ VERIFICAR PERMISSÕES COMPLEXAS
  const hasPermission = (config: PermissionConfig): boolean => {
    if (!userRole) return false;

    const currentRole = userRole as UserRole;

    // Se tem roles negados, verificar se o usuário não está na lista
    if (config.deniedRoles?.includes(currentRole)) {
      return false;
    }

    // Se tem roles específicos permitidos, verificar se o usuário está na lista
    if (config.allowedRoles) {
      return config.allowedRoles.includes(currentRole);
    }

    // Se tem role mínimo necessário, verificar hierarquia
    if (config.requiredRole) {
      return hasRole(config.requiredRole);
    }

    // Se não tem restrições, é permitido para todos
    return true;
  };

  // ✅ VERIFICAÇÕES ESPECÍFICAS PARA FUNCIONALIDADES DO SISTEMA
  const canManageCompanies = (): boolean => {
    return hasRole('ADMIN');
  };

  const canManageUsers = (): boolean => {
    return hasRole('SUPERUSER');
  };

  const canAccessSettings = (): boolean => {
    return hasRole('SUPERUSER');
  };

  const canAccessFinancialReports = (): boolean => {
    return hasRole('USER'); // Todos podem ver relatórios financeiros
  };

  const canCreateTransactions = (): boolean => {
    return hasRole('USER'); // Todos podem criar transações
  };

  const canManageFinancialAccounts = (): boolean => {
    return hasRole('USER'); // Todos podem gerenciar contas financeiras
  };

  const canManageCategories = (): boolean => {
    return hasRole('USER'); // Todos podem gerenciar categorias
  };

  // ✅ VERIFICAR SE É ADMIN
  const isAdmin = (): boolean => {
    return userRole === 'ADMIN';
  };

  // ✅ VERIFICAR SE É SUPERUSER OU ACIMA
  const isSuperUserOrAbove = (): boolean => {
    return hasRole('SUPERUSER');
  };

  // ✅ VERIFICAR SE É USER COMUM
  const isRegularUser = (): boolean => {
    return userRole === 'USER';
  };

  // ✅ OBTER NÍVEL NUMÉRICO DO ROLE
  const getRoleLevel = (): number => {
    return roleHierarchy[userRole as UserRole] || 0;
  };

  // ✅ OBTER LABEL AMIGÁVEL DO ROLE
  const getRoleLabel = (): string => {
    const labels: Record<UserRole, string> = {
      'ADMIN': 'Administrador',
      'SUPERUSER': 'Superusuário',
      'USER': 'Usuário'
    };
    
    return labels[userRole as UserRole] || 'Desconhecido';
  };

  return {
    // Verificações básicas
    hasRole,
    hasPermission,
    
    // Verificações específicas
    canManageCompanies,
    canManageUsers,
    canAccessSettings,
    canAccessFinancialReports,
    canCreateTransactions,
    canManageFinancialAccounts,
    canManageCategories,
    
    // Verificações de tipo de usuário
    isAdmin,
    isSuperUserOrAbove,
    isRegularUser,
    
    // Utilitários
    getRoleLevel,
    getRoleLabel,
    
    // Estado atual
    currentRole: userRole as UserRole,
    isAuthenticated: !!userRole
  };
}