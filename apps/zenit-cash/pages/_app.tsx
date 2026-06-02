// frontend/pages/_app.tsx - COM THEME PROVIDER
import '@/styles/globals.css'
import { AppProps } from 'next/app'
import Head from 'next/head'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext' // ✅ NOVO IMPORT
import { ToastProvider } from '@/components/ui/ToastContext'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageTransition } from '@/components/ui/PageTransition'
import { BUILD_INFO } from '@/lib/buildInfo';

function AppContent({ Component, pageProps }: AppProps) {
  console.log('🏗️ [APP] Build info loaded:', BUILD_INFO);
  const { isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider> {/* ✅ WRAPPER PRINCIPAL PARA TEMAS */}
      <Head>
        <title>Zenit Cash</title>
        <meta name="application-name" content="Zenit Cash" />
        <meta
          name="description"
          content="Zenit Cash, plataforma de gestao financeira."
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>
      <AuthProvider>
        <ToastProvider>
          <PageTransition />
          <AppContent {...props} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
