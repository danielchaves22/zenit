import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

const loginSchema = z.object({
  email: z.email('Informe um email valido'),
  password: z.string().min(1, 'Informe a senha')
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      await login(values.email, values.password);
      const nextStatus = useAuthStore.getState().status;
      router.replace(nextStatus === 'needs_company' ? '/company-select' : '/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha no login');
    }
  });

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Zenit Cash Mobile</Text>
      <Text style={styles.title}>Entre para operar o caixa do dia</Text>
      <Text style={styles.subtitle}>
        O mobile desta V1 foca em visao rapida e lancamento por assistente.
      </Text>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="voce@empresa.com"
              placeholderTextColor="#8a8f98"
              style={styles.input}
              value={value}
            />
            {errors.email ? <Text style={styles.error}>{errors.email.message}</Text> : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Senha</Text>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Sua senha"
              placeholderTextColor="#8a8f98"
              style={styles.input}
              value={value}
            />
            {errors.password ? <Text style={styles.error}>{errors.password.message}</Text> : null}
          </View>
        )}
      />

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable onPress={onSubmit} style={styles.submitButton}>
        {isSubmitting ? (
          <ActivityIndicator color="#101318" />
        ) : (
          <Text style={styles.submitLabel}>Entrar</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c222c',
    borderRadius: 28,
    gap: 16,
    padding: 24
  },
  eyebrow: {
    color: '#8fd6b5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    color: '#f7f8fa',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#c2cad5',
    fontSize: 15,
    lineHeight: 22
  },
  fieldGroup: {
    gap: 8
  },
  label: {
    color: '#f7f8fa',
    fontSize: 14,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#101318',
    borderColor: '#323846',
    borderRadius: 18,
    borderWidth: 1,
    color: '#f7f8fa',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  error: {
    color: '#ff8576',
    fontSize: 13
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#8fd6b5',
    borderRadius: 18,
    paddingVertical: 16
  },
  submitLabel: {
    color: '#101318',
    fontSize: 16,
    fontWeight: '700'
  }
});
