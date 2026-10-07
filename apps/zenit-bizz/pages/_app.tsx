import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/AuthGate';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Zenit Bizz</title>
        <meta
          name="description"
          content="Clientes e fornecedores organizados para o dia a dia do seu negócio."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#F97316" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
      </Head>
      <AuthProvider>
        <AuthGate>
          <Component {...pageProps} />
        </AuthGate>
      </AuthProvider>
    </>
  );
}
