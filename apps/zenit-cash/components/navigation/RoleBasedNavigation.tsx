import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface RoleBasedItemProps {
  children: React.ReactNode;
  allowedRoles: string[];
  fallback?: React.ReactNode;
}

export function RoleBasedItem({ children, allowedRoles, fallback = null }: RoleBasedItemProps) {
  const { userRole } = useAuth();
  
  if (!userRole || !allowedRoles.includes(userRole)) {
    return fallback;
  }
  
  return <>{children}</>;
}

export function usePermissions() {
  const { userRole } = useAuth();
  
  return {
    canManageCompanies: userRole === 'ADMIN',
    canManageUsers: userRole === 'SUPERUSER' || userRole === 'ADMIN',
    canAccessFinancial: ['USER', 'SUPERUSER', 'ADMIN'].includes(userRole || ''),
    isAdmin: userRole === 'ADMIN',
    isSuperUser: userRole === 'SUPERUSER',
    isUser: userRole === 'USER'
  };
}