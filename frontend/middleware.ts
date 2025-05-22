// frontend/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rotas que não precisam de autenticação
const publicRoutes = ['/login']

// Arquivos estáticos e API routes que não devem passar pelo middleware
const excludedPaths = [
  '/_next', 
  '/favicon.ico', 
  '/assets',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Ignora arquivos estáticos e APIs específicas
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // Verifica se é uma rota pública
  const isPublicRoute = publicRoutes.some(route => pathname === route)
  
  // Se cookie de token existe
  const token = request.cookies.get('token')?.value
  
  // Rota protegida e sem autenticação
  if (!isPublicRoute && !token) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }
  
  // Rota de login com autenticação
  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  
  return NextResponse.next()
}

// Configura quais caminhos acionam o middleware
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
}