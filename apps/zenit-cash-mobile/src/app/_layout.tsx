import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/app-providers';
import { useAuthStore } from '@/store/auth-store';

function LayoutGate() {
  const segments = useSegments();
  const status = useAuthStore((state) => state.status);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const currentPath = `/${segments.join('/')}`;

    if (status === 'signed_out' && currentPath !== '/login') {
      router.replace('/login');
      return;
    }

    if (status === 'needs_company' && currentPath !== '/company-select') {
      router.replace('/company-select');
      return;
    }

    if (status === 'signed_in' && (currentPath === '/login' || currentPath === '/company-select')) {
      router.replace('/');
    }
  }, [isInitialized, segments, status]);

  if (!isInitialized) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#8fd6b5" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <LayoutGate />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#111827',
    flex: 1,
    justifyContent: 'center'
  }
});
