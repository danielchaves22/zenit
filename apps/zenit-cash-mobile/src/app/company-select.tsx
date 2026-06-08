import { StyleSheet, View } from 'react-native';
import { CompanySelector } from '@/components/company/company-selector';

export default function CompanySelectRoute() {
  return (
    <View style={styles.screen}>
      <CompanySelector />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f2e8db',
    flex: 1,
    padding: 20
  }
});
