import { StyleSheet, Text, View } from 'react-native';

export function AboutScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Zenit Cash Mobile</Text>
        <Text style={styles.title}>Lancamentos rapidos, com contexto e confirmacao.</Text>
        <Text style={styles.subtitle}>
          Use o app para registrar despesas, receitas e transferencias com mais agilidade no dia a dia.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>O que voce encontra aqui</Text>
        <Text style={styles.cardBody}>
          Novo lancamento com assistente, confirmacao antes de gravar e troca de empresa dentro do proprio app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4efe7',
    flex: 1,
    gap: 16,
    padding: 20
  },
  hero: {
    backgroundColor: '#16222f',
    borderRadius: 30,
    gap: 10,
    padding: 24
  },
  eyebrow: {
    color: '#9ee8d7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    color: '#f7f8fa',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34
  },
  subtitle: {
    color: '#c9d2de',
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    gap: 10,
    padding: 20
  },
  cardTitle: {
    color: '#15212d',
    fontSize: 18,
    fontWeight: '700'
  },
  cardBody: {
    color: '#55606c',
    fontSize: 15,
    lineHeight: 22
  }
});
