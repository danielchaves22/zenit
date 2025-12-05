// frontend/lib/routeProtection.ts - SISTEMA DE PROTEÇÃO DE ROTAS
import { UserRole } from '@/hooks/usePermissions';

export interface RoutePermission {
  path: string;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
  redirectTo?: string;
}

// ✅ CONFIGURAÇÃO DE PERMISSÕES POR ROTA
export const routePermissions: RoutePermission[] = [
  // Rotas de Administração - Empresas (app dedicada)
  {
    path: '/admin/companies',
    allowedRoles: ['ADMIN'],
    redirectTo: '/'
  },

  // Área administrativa geral - força admin em qualquer rota /admin
  {
    path: '/admin/*',
    requiredRole: 'ADMIN',
    redirectTo: '/'
  }
];

// ✅ FUNÇÃO PARA VERIFICAR PERMISSÃO DE ROTA
export function checkRoutePermission(
  path: string, 
  userRole: UserRole | null
): { hasAccess: boolean; redirectTo?: string } {
  
  if (!userRole) {
    return { hasAccess: false, redirectTo: '/login' };
  }

  // Buscar configuração específica para a rota
  const routeConfig = routePermissions.find(config => {
    if (config.path.endsWith('*')) {
      const basePath = config.path.slice(0, -1);
      return path.startsWith(basePath);
    }
    return config.path === path;
  });

  // Se não há configuração específica, permitir acesso
  if (!routeConfig) {
    return { hasAccess: true };
  }

  const roleHierarchy: Record<UserRole, number> = {
    'ADMIN': 3,
    'SUPERUSER': 2,
    'USER': 1
  };

  const userLevel = roleHierarchy[userRole] || 0;

  // Verificar roles negados
  if (routeConfig.deniedRoles?.includes(userRole)) {
    return { 
      hasAccess: false, 
      redirectTo: routeConfig.redirectTo || '/' 
    };
  }

  // Verificar roles específicos permitidos
  if (routeConfig.allowedRoles) {
    const hasAccess = routeConfig.allowedRoles.includes(userRole);
    return { 
      hasAccess, 
      redirectTo: hasAccess ? undefined : (routeConfig.redirectTo || '/') 
    };
  }

  // Verificar role mínimo necessário
  if (routeConfig.requiredRole) {
    const requiredLevel = roleHierarchy[routeConfig.requiredRole] || 0;
    const hasAccess = userLevel >= requiredLevel;
    return { 
      hasAccess, 
      redirectTo: hasAccess ? undefined : (routeConfig.redirectTo || '/') 
    };
  }

  return { hasAccess: true };
}

// ✅ FUNÇÃO PARA OBTER ROTAS PERMITIDAS PARA UM USUÁRIO
export function getAllowedRoutes(userRole: UserRole | null): string[] {
  if (!userRole) return [];
  
  const allowedRoutes: string[] = [];
  
  // Rotas básicas sempre permitidas
  allowedRoutes.push('/', '/profile');
  
  // Rotas financeiras para todos
  allowedRoutes.push(
    '/financial/dashboard',
    '/financial/accounts', 
    '/financial/transactions',
    '/financial/categories',
    '/financial/reports/*'
  );
  
  // Rotas administrativas baseadas no role
  if (userRole === 'ADMIN') {
    allowedRoutes.push('/admin/companies');
  }
  
  return allowedRoutes;
}

// ✅ VERIFICAR SE UMA ROTA É PÚBLICA
export function isPublicRoute(path: string): boolean {
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  return publicRoutes.includes(path);
}

// ✅ OBTER INFORMAÇÕES DE PERMISSÃO PARA DEBUG
export function getRoutePermissionInfo(path: string, userRole: UserRole | null) {
  const permission = checkRoutePermission(path, userRole);
  const allowedRoutes = getAllowedRoutes(userRole);
  const isPublic = isPublicRoute(path);
  
  return {
    path,
    userRole,
    isPublic,
    hasAccess: permission.hasAccess,
    redirectTo: permission.redirectTo,
    allowedRoutes,
    timestamp: new Date().toISOString()
  };
}