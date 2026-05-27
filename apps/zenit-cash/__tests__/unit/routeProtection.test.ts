import { describe, expect, it } from 'vitest'
import {
  checkRoutePermission,
  getAllowedRoutes,
  isPublicRoute
} from '@/lib/routeProtection'

describe('route protection helpers', () => {
  it('redirects anonymous users to login', () => {
    expect(checkRoutePermission('/financial/dashboard', null)).toEqual({
      hasAccess: false,
      redirectTo: '/login'
    })
  })

  it('enforces minimum role hierarchy for admin routes', () => {
    expect(checkRoutePermission('/admin/settings', 'USER')).toEqual({
      hasAccess: false,
      redirectTo: '/'
    })

    expect(checkRoutePermission('/admin/settings', 'SUPERUSER')).toEqual({
      hasAccess: true,
      redirectTo: undefined
    })
  })

  it('lists the expected baseline routes for a regular user', () => {
    const routes = getAllowedRoutes('USER')

    expect(routes).toContain('/financial/dashboard')
    expect(routes).not.toContain('/admin/settings')
  })

  it('detects public routes', () => {
    expect(isPublicRoute('/login')).toBe(true)
    expect(isPublicRoute('/financial/dashboard')).toBe(false)
  })
})
