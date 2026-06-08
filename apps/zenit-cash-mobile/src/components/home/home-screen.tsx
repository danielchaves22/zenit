import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

export function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const companyId = useAuthStore((state) => state.companyId);

  const company = user?.companies.find((item) => item.id === companyId) || null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Zenit Cash</Text>
        <Text style={styles.heroTitle}>{company ? company.name : 'Zenit Cash'}</Text>
        <Text style={styles.heroSubtitle}>
          {user ? `Ola, ${user.name}.` : 'Bem-vindo.'}
        </Text>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Registrar uma nova movimentacao</Text>
        <Text style={styles.sectionDescription}>
          Abra o chat, descreva a transacao e confirme antes de gravar.
        </Text>
        <Pressable onPress={() => router.push('/assistant')} style={styles.primaryAction}>
          <Text style={styles.primaryActionLabel}>Novo lancamento</Text>
          <Text style={styles.primaryActionHint}>Despesa, receita ou transferencia</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4efe7',
    flexGrow: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 20
  },
  hero: {
    backgroundColor: '#16222f',
    borderRadius: 30,
    gap: 10,
    padding: 24
  },
  heroEyebrow: {
    color: '#9ee8d7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: '#f7f8fa',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36
  },
  heroSubtitle: {
    color: '#c9d2de',
    fontSize: 15,
    lineHeight: 22
  },
  actionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    gap: 14,
    padding: 20
  },
  sectionTitle: {
    color: '#111418',
    fontSize: 20,
    fontWeight: '700'
  },
  sectionDescription: {
    color: '#57636f',
    fontSize: 15,
    lineHeight: 22
  },
  primaryAction: {
    backgroundColor: '#111418',
    borderRadius: 20,
    gap: 6,
    padding: 18
  },
  primaryActionLabel: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700'
  },
  primaryActionHint: {
    color: '#b8c1cb',
    fontSize: 14
  }
});
