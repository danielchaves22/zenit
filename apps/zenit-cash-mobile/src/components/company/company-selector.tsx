import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getAccessibleCompanies } from '@/lib/auth-access';
import { useAuthStore } from '@/store/auth-store';

export function CompanySelector() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const selectCompany = useAuthStore((state) => state.selectCompany);

  if (!user) {
    return null;
  }

  const companies = getAccessibleCompanies(user);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Escolha a empresa</Text>
      <Text style={styles.subtitle}>Selecione a empresa que voce quer usar agora.</Text>

      <View style={styles.list}>
        {companies.map((company) => (
          <Pressable
            key={company.id}
            onPress={async () => {
              await selectCompany(company.id);
              router.replace('/');
            }}
            style={styles.companyButton}
          >
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyMeta}>{company.role}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff7ed',
    borderRadius: 28,
    gap: 16,
    padding: 24
  },
  title: {
    color: '#161719',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#525660',
    fontSize: 15,
    lineHeight: 22
  },
  list: {
    gap: 12
  },
  companyButton: {
    backgroundColor: '#ffffff',
    borderColor: '#f0d6b9',
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 18
  },
  companyName: {
    color: '#161719',
    fontSize: 17,
    fontWeight: '700'
  },
  companyMeta: {
    color: '#7a6e61',
    fontSize: 13,
    textTransform: 'uppercase'
  }
});
