// frontend/pages/_app.tsx
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/ToastContext'

function AuthGuard({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const router = useRouter()
  const publicPaths = ['/login']
  const path = router.pathname

  console.log('[AuthGuard]', { path, token })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1) Rota pública? libera sem verificar token
    if (publicPaths.includes(path)) {
      setLoading(false)
      return
    }

    // 2) Rota protegida e sem token? redireciona para /login
    if (!token) {
      router.replace({
        pathname: '/login',
        query: { redirect: path },
      })
      return
    }

    // 3) Rota protegida e token presente? libera
    setLoading(false)
  }, [token, path, router])

  if (loading) {
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Carregando…</p>
  }

  return <>{children}</>
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGuard>
          <Component {...pageProps} />
        </AuthGuard>
      </ToastProvider>
    </AuthProvider>
  )
}
