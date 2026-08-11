import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'

const publicRoutes = ['/login']

export function useProtectedRoute() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const isPublicRoute = publicRoutes.includes(router.pathname)
  const isAuthenticated = Boolean(user)
  const shouldRedirectToLogin = !isLoading && !isPublicRoute && !isAuthenticated
  const shouldRedirectToHome = !isLoading && isPublicRoute && isAuthenticated

  useEffect(() => {
    if (isLoading) return

    if (shouldRedirectToHome) {
      void router.replace('/')
      return
    }

    if (shouldRedirectToLogin && router.pathname !== '/login') {
      void router.replace({
        pathname: '/login',
        query: { redirect: router.asPath }
      })
    }
  }, [
    isLoading,
    router,
    router.asPath,
    router.pathname,
    shouldRedirectToHome,
    shouldRedirectToLogin
  ])

  const canRender = useMemo(
    () => !shouldRedirectToLogin && !shouldRedirectToHome,
    [shouldRedirectToHome, shouldRedirectToLogin]
  )

  return {
    isLoading,
    isAuthenticated,
    isPublicRoute,
    canRender
  }
}
