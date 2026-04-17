// frontend/middleware.ts - VERSAO CORRIGIDA
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rotas que nao precisam de autenticacao
const publicRoutes = ['/login', '/privacy', '/terms']

// Arquivos estaticos e API routes que nao devem passar pelo middleware
const excludedPaths = [
  '/_next', 
  '/favicon.ico', 
  '/assets',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Ignora arquivos estaticos e APIs especificas
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // Verifica se e uma rota publica
  const isPublicRoute = publicRoutes.some(route => pathname === route)
  
  // CORRECAO: Buscar APENAS nosso cookie especifico
  const token = request.cookies.get('zenit_token')?.value
  
  // Rota protegida e sem autenticacao
  if (!isPublicRoute && !token) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }
  
  // Rota de login com autenticacao
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
