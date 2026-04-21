import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const publicRoutes = ['/login']

const excludedPaths = [
  '/_next',
  '/favicon.ico',
  '/assets',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  const isPublicRoute = publicRoutes.some(route => pathname === route)
  const token = request.cookies.get('zenit_token')?.value

  if (!isPublicRoute && !token) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
}
