import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/ToastContext';
import { PageLoader } from '@/components/ui/PageLoader';

interface WithRoleProtectionOptions {
  allowedRoles?: string[];
  fallbackPath?: string;
}

export function withRoleProtection<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithRoleProtectionOptions = {}
) {
  const ProtectedComponent = (props: P) => {
    const { user, userRole, isLoading } = useAuth();
    const router = useRouter();
    const { addToast } = useToast();
    const { allowedRoles = [], fallbackPath = '/' } = options;
    
    useEffect(() => {
      if (isLoading) return;
      
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }
      
      if (allowedRoles.length > 0 && (!userRole || !allowedRoles.includes(userRole))) {
        addToast('Você não tem permissão para acessar esta área', 'error');
        router.replace(fallbackPath);
        return;
      }
    }, [user, userRole, isLoading, router]);
    
    if (isLoading) {
      return <PageLoader message="Verificando permissões..." />;
    }
    
    if (!user) return null;
    
    if (allowedRoles.length > 0 && (!userRole || !allowedRoles.includes(userRole))) {
      return null;
    }
    
    return <WrappedComponent {...props} />;
  };
  
  ProtectedComponent.displayName = `withRoleProtection(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return ProtectedComponent;
}