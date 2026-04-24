// frontend/hooks/useProtectedRoute.ts
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

// Lista de rotas públicas que não precisam de autenticação
const publicRoutes = ['/login'];

export function useProtectedRoute() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    // Só executa o redirecionamento após confirmar que o carregamento inicial terminou
    if (isLoading) return;
    
    // Verificar se é uma rota pública
    const isPublicRoute = publicRoutes.includes(router.pathname);
    
    // Se for uma rota pública e o usuário estiver logado, redirecionar para a home
    if (isPublicRoute && user) {
      router.replace('/');
      return;
    }
    
    // Se não for uma rota pública e o usuário não estiver logado, redirecionar para login
    if (!isPublicRoute && !user) {
      // IMPORTANTE: Evita o loop - verifica se já está sendo redirecionado
      if (router.pathname !== '/login') {
        router.replace({
          pathname: '/login',
          query: { redirect: router.asPath },
        });
      }
      return;
    }
  }, [user, isLoading, router.pathname]); // Dependências reduzidas para evitar re-execuções desnecessárias
  
  return { isLoading, isAuthenticated: !!user };
}