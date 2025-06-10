// frontend/components/ui/AccessGuard.tsx - COMPONENTE DE PROTEÇÃO DE ACESSO
import React from 'react';
import { useRouter } from 'next/router';
import { usePermissions, UserRole } from '@/hooks/usePermissions';
import { Card } from './Card';
import { Button } from './Button';
import { Shield, ArrowLeft, AlertTriangle } from 'lucide-react';

interface AccessGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  deniedRoles?: UserRole[];
  requiredPermission?: 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES';
  fallback?: React.ReactNode;
  redirectTo?: string;
  showFallback?: boolean;
}

export function AccessGuard({
  children,
  requiredRole,
  allowedRoles,
  deniedRoles,
  fallback,
  redirectTo = '/',
  showFallback = true
}: AccessGuardProps) {
  const { hasPermission, getRoleLabel, hasAppPermission, currentRole } = usePermissions();
  const router = useRouter();

  const hasAccess = hasPermission({
    requiredRole,
    allowedRoles,
    deniedRoles
  });

  const permissionOk = requiredPermission ? hasAppPermission(requiredPermission) : true;

  // Se tem acesso, renderizar normalmente
  if (hasAccess && permissionOk) {
    return <>{children}</>;
  }

  // Se tem fallback customizado, usar ele
  if (fallback) {
    return <>{fallback}</>;
  }

  // Se não deve mostrar fallback, redirecionar
  if (!showFallback) {
    router.replace(redirectTo);
    return null;
  }

  // Renderizar tela de acesso negado
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center">
        <div className="p-8">
          <div className="mb-6">
            <div className="bg-red-900/20 border border-red-600 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
              <Shield size={32} className="text-red-400" />
            </div>
          </div>
          
          <h2 className="text-xl font-semibold text-white mb-3">
            Acesso Negado
          </h2>
          
          <div className="space-y-3 mb-6">
            <p className="text-gray-400">
              Você não possui permissões suficientes para acessar esta funcionalidade.
            </p>
            
            <div className="bg-[#1e2126] border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-yellow-400" />
                <span className="text-sm font-medium text-yellow-400">Informações de Acesso</span>
              </div>
              <div className="space-y-1 text-sm text-gray-300">
                <p>
                  <span className="text-gray-400">Seu perfil atual:</span>{' '}
                  <span className="font-medium text-white">{getRoleLabel()}</span>
                </p>
                {requiredRole && (
                  <p>
                    <span className="text-gray-400">Perfil mínimo necessário:</span>{' '}
                    <span className="font-medium text-accent">
                      {requiredRole === 'ADMIN' ? 'Administrador' : 
                       requiredRole === 'SUPERUSER' ? 'Superusuário' : 'Usuário'}
                    </span>
                  </p>
                )}
                {allowedRoles && allowedRoles.length > 0 && (
                  <p>
                    <span className="text-gray-400">Perfis permitidos:</span>{' '}
                    <span className="font-medium text-accent">
                      {allowedRoles.map(role => 
                        role === 'ADMIN' ? 'Administrador' : 
                        role === 'SUPERUSER' ? 'Superusuário' : 'Usuário'
                      ).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button 
              variant="accent" 
              onClick={() => router.push(redirectTo)}
              className="w-full flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Voltar ao Dashboard
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => router.back()}
              className="w-full"
            >
              Voltar à Página Anterior
            </Button>
          </div>
          
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </div>
              <div className="text-sm text-blue-200">
                <p className="font-medium mb-1">Precisa de mais acesso?</p>
                <p>Entre em contato com o administrador do sistema para solicitar as permissões necessárias.</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ✅ HOOK PARA USAR O ACCESS GUARD COMO HOOK
export function useAccessGuard(
  requiredRole?: UserRole,
  allowedRoles?: UserRole[],
  deniedRoles?: UserRole[],
  requiredPermission?: 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES'
) {
  const { hasPermission, hasAppPermission } = usePermissions();
  
  const hasAccess = hasPermission({
    requiredRole,
    allowedRoles,
    deniedRoles
  });

  const permissionOk = requiredPermission ? hasAppPermission(requiredPermission) : true;
  
  return {
    hasAccess: hasAccess && permissionOk,
    AccessDenied: () => (
      <AccessGuard
        requiredRole={requiredRole}
        allowedRoles={allowedRoles}
        deniedRoles={deniedRoles}
      >
        <div></div>
      </AccessGuard>
    )
  };
}

// ✅ COMPONENTE DE PROTEÇÃO ESPECÍFICA PARA PÁGINAS
interface PageGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  requiredPermission?: 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES';
  redirectTo?: string;
}

export function PageGuard({
  children,
  requiredRole,
  allowedRoles,
  requiredPermission,
  redirectTo = '/'
}: PageGuardProps) {
  const { hasPermission, hasAppPermission } = usePermissions();
  const router = useRouter();
  
  const hasAccess = hasPermission({
    requiredRole,
    allowedRoles
  });
  const permissionOk = requiredPermission ? hasAppPermission(requiredPermission) : true;
  
  // Se não tem acesso, redirecionar imediatamente
  React.useEffect(() => {
    if (!(hasAccess && permissionOk)) {
      router.replace(redirectTo);
    }
  }, [hasAccess, router, redirectTo]);
  
  // Se não tem acesso, não renderizar nada (evita flash de conteúdo)
  if (!(hasAccess && permissionOk)) {
    return null;
  }
  
  return <>{children}</>;
}