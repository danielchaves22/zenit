import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppMenuButton } from '@/components/ui/app-menu-button';
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
      <StatusBar style={status === 'signed_out' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#f4efe7' },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#f4efe7' },
          headerTintColor: '#16222f',
          headerTitleStyle: {
            color: '#16222f',
            fontSize: 18,
            fontWeight: '700'
          }
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="index"
          options={{
            title: 'Zenit Cash',
            headerBackVisible: false,
            headerRight: () => <AppMenuButton />
          }}
        />
        <Stack.Screen
          name="assistant"
          options={{
            title: 'Novo lancamento',
            headerRight: () => <AppMenuButton />
          }}
        />
        <Stack.Screen
          name="company-select"
          options={{
            title: 'Trocar empresa',
            headerBackVisible: status === 'signed_in'
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: 'Sobre',
            headerRight: () => <AppMenuButton />
          }}
        />
      </Stack>
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
