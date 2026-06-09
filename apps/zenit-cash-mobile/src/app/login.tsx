import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginRoute() {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LoginForm />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#111827',
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  }
});
