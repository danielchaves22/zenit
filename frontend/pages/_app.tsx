// frontend/pages/_app.tsx - COM THEME PROVIDER
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext' // ✅ NOVO IMPORT
import { ToastProvider } from '@/components/ui/ToastContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageTransition } from '@/components/ui/PageTransition'

function AppContent({ Component, pageProps }: AppProps) {
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider> {/* ✅ WRAPPER PRINCIPAL PARA TEMAS */}
      <AuthProvider>
        <ToastProvider>
          <PageTransition />
          <AppContent {...props} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}