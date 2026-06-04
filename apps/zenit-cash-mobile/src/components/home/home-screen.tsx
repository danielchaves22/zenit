import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

export function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const companyId = useAuthStore((state) => state.companyId);
  const logout = useAuthStore((state) => state.logout);

  const company = user?.companies.find((item) => item.id === companyId) || null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Operador</Text>
        <Text style={styles.heroTitle}>Visao curta, acao imediata</Text>
        <Text style={styles.heroSubtitle}>
          {company ? `${company.name}` : 'Selecione uma empresa'}{'\n'}
          {user ? `Sessao de ${user.name}` : ''}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricCardMint]}>
          <Text style={styles.metricLabel}>Foco da V1</Text>
          <Text style={styles.metricValue}>Lancamento</Text>
          <Text style={styles.metricHint}>Chat do Operador com confirmacao humana.</Text>
        </View>

        <View style={[styles.metricCard, styles.metricCardSand]}>
          <Text style={styles.metricLabel}>Escopo</Text>
          <Text style={styles.metricValue}>Texto + SSE</Text>
          <Text style={styles.metricHint}>Sem voz e sem push proativo neste incremento.</Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Acoes rapidas</Text>
        <View style={styles.quickActions}>
          <Pressable onPress={() => router.push('/assistant')} style={styles.primaryAction}>
            <Text style={styles.primaryActionLabel}>Novo lancamento</Text>
            <Text style={styles.primaryActionHint}>Abra o chat e descreva a transacao.</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/company-select')} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionLabel}>Trocar empresa</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              await logout();
              router.replace('/login');
            }}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionLabel}>Sair</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4efe7',
    gap: 16,
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
    fontWeight: '700'
  },
  heroSubtitle: {
    color: '#c9d2de',
    fontSize: 15,
    lineHeight: 22
  },
  metricsRow: {
    gap: 16
  },
  metricCard: {
    borderRadius: 24,
    gap: 8,
    padding: 20
  },
  metricCardMint: {
    backgroundColor: '#d8f4ec'
  },
  metricCardSand: {
    backgroundColor: '#fce8c8'
  },
  metricLabel: {
    color: '#4e5b62',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  metricValue: {
    color: '#111418',
    fontSize: 24,
    fontWeight: '700'
  },
  metricHint: {
    color: '#49545d',
    fontSize: 14,
    lineHeight: 21
  },
  actionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    gap: 16,
    padding: 20
  },
  sectionTitle: {
    color: '#111418',
    fontSize: 20,
    fontWeight: '700'
  },
  quickActions: {
    gap: 12
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
  },
  secondaryAction: {
    backgroundColor: '#f2f5f7',
    borderRadius: 18,
    padding: 16
  },
  secondaryActionLabel: {
    color: '#111418',
    fontSize: 15,
    fontWeight: '600'
  }
});
