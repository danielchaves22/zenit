// frontend/lib/routeProtection.ts - SISTEMA DE PROTEÃ‡ÃƒO DE ROTAS
import { UserRole } from '@/hooks/usePermissions';

export interface RoutePermission {
  path: string;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
  redirectTo?: string;
}

// âœ… CONFIGURAÃ‡ÃƒO DE PERMISSÃ•ES POR ROTA
export const routePermissions: RoutePermission[] = [
  // Rotas de AdministraÃ§Ã£o - Empresas
  {
    path: '/admin/companies',
    allowedRoles: ['ADMIN'],
    redirectTo: '/'
  },
  
  // Rotas de AdministraÃ§Ã£o - UsuÃ¡rios
  {
    path: '/admin/users',
    requiredRole: 'SUPERUSER',
    redirectTo: '/'
  },
  
  // Rotas de AdministraÃ§Ã£o - ConfiguraÃ§Ãµes
  {
    path: '/admin/settings',
    requiredRole: 'SUPERUSER',
    redirectTo: '/'
  },
  
  // Rotas Financeiras removidas
  
  // Ãrea administrativa geral
  {
    path: '/admin/*',
    requiredRole: 'SUPERUSER', // Fallback para Ã¡rea admin
    redirectTo: '/'
  }
];

// âœ… FUNÃ‡ÃƒO PARA VERIFICAR PERMISSÃƒO DE ROTA
export function checkRoutePermission(
  path: string, 
  userRole: UserRole | null
): { hasAccess: boolean; redirectTo?: string } {
  
  if (!userRole) {
    return { hasAccess: false, redirectTo: '/login' };
  }

  // Buscar configuraÃ§Ã£o especÃ­fica para a rota
  const routeConfig = routePermissions.find(config => {
    if (config.path.endsWith('*')) {
      const basePath = config.path.slice(0, -1);
      return path.startsWith(basePath);
    }
    return config.path === path;
  });

  // Se nÃ£o hÃ¡ configuraÃ§Ã£o especÃ­fica, permitir acesso
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

  // Verificar roles especÃ­ficos permitidos
  if (routeConfig.allowedRoles) {
    const hasAccess = routeConfig.allowedRoles.includes(userRole);
    return { 
      hasAccess, 
      redirectTo: hasAccess ? undefined : (routeConfig.redirectTo || '/') 
    };
  }

  // Verificar role mÃ­nimo necessÃ¡rio
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

// âœ… FUNÃ‡ÃƒO PARA OBTER ROTAS PERMITIDAS PARA UM USUÃRIO
export function getAllowedRoutes(userRole: UserRole | null): string[] {
  if (!userRole) return [];
  
  const allowedRoutes: string[] = [];
  
  // Rotas bÃ¡sicas sempre permitidas
  allowedRoutes.push('/', '/profile');
  
  // Rotas administrativas baseadas no role
  if (userRole === 'SUPERUSER' || userRole === 'ADMIN') {
    allowedRoutes.push('/admin/users', '/admin/settings');
  }
  
  if (userRole === 'ADMIN') {
    allowedRoutes.push('/admin/companies');
  }
  
  return allowedRoutes;
}

// âœ… VERIFICAR SE UMA ROTA Ã‰ PÃšBLICA
export function isPublicRoute(path: string): boolean {
  const publicRoutes = ['/login', '/register', '/forgot-password'];
  return publicRoutes.includes(path);
}

// âœ… OBTER INFORMAÃ‡Ã•ES DE PERMISSÃƒO PARA DEBUG
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


