import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/AuthGate';
import { NavigationProvider } from '@/contexts/NavigationContext';
import '@/styles/globals.css';
import '@zenit/product-attributes/src/styles.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Zenit Bizz</title>
        <meta
          name="description"
          content="Zenit Bizz — gestão comercial e operacional."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#F97316" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
      </Head>
      <AuthProvider>
        <AuthGate>
          <NavigationProvider>
            <Component {...pageProps} />
          </NavigationProvider>
        </AuthGate>
      </AuthProvider>
    </>
  );
}
