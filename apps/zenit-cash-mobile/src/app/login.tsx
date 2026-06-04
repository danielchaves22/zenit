import { StyleSheet, View } from 'react-native';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginRoute() {
  return (
    <View style={styles.screen}>
      <LoginForm />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#111827',
    flex: 1,
    justifyContent: 'center',
    padding: 20
  }
});
