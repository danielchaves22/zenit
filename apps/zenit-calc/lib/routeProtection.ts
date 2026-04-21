import { UserRole } from '@/hooks/usePermissions';

export interface RoutePermission {
  path: string;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
  redirectTo?: string;
}

export const routePermissions: RoutePermission[] = [
  {
    path: '/admin/users',
    requiredRole: 'SUPERUSER',
    redirectTo: '/'
  },
  {
    path: '/admin/settings',
    requiredRole: 'SUPERUSER',
    redirectTo: '/'
  },
  {
    path: '/admin/*',
    requiredRole: 'SUPERUSER',
    redirectTo: '/'
  }
];

export function checkRoutePermission(
  path: string,
  userRole: UserRole | null
): { hasAccess: boolean; redirectTo?: string } {
  if (!userRole) {
    return { hasAccess: false, redirectTo: '/login' };
  }

  const routeConfig = routePermissions.find(config => {
    if (config.path.endsWith('*')) {
      const basePath = config.path.slice(0, -1);
      return path.startsWith(basePath);
    }
    return config.path === path;
  });

  if (!routeConfig) {
    return { hasAccess: true };
  }

  const roleHierarchy: Record<UserRole, number> = {
    ADMIN: 3,
    SUPERUSER: 2,
    USER: 1
  };

  const userLevel = roleHierarchy[userRole] || 0;

  if (routeConfig.deniedRoles?.includes(userRole)) {
    return {
      hasAccess: false,
      redirectTo: routeConfig.redirectTo || '/'
    };
  }

  if (routeConfig.allowedRoles) {
    const hasAccess = routeConfig.allowedRoles.includes(userRole);
    return {
      hasAccess,
      redirectTo: hasAccess ? undefined : (routeConfig.redirectTo || '/')
    };
  }

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

export function getAllowedRoutes(userRole: UserRole | null): string[] {
  if (!userRole) return [];

  const allowedRoutes: string[] = [];
  allowedRoutes.push('/', '/profile');

  if (userRole === 'SUPERUSER' || userRole === 'ADMIN') {
    allowedRoutes.push('/admin/users', '/admin/settings');
  }

  return allowedRoutes;
}

export function isPublicRoute(path: string): boolean {
  const publicRoutes = ['/login'];
  return publicRoutes.includes(path);
}

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
