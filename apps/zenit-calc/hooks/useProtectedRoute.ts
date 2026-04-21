import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

const publicRoutes = ['/login'];

export function useProtectedRoute() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = publicRoutes.includes(router.pathname);

    if (router.pathname === '/login' && user) {
      router.replace('/');
      return;
    }

    if (!isPublicRoute && !user) {
      if (router.pathname !== '/login') {
        router.replace({
          pathname: '/login',
          query: { redirect: router.asPath },
        });
      }
    }
  }, [user, isLoading, router.pathname, router.asPath, router]);

  return { isLoading, isAuthenticated: !!user };
}
