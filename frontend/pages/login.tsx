import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { redirect } = router.query as { redirect?: string };

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      console.log(router.query.redirect)
      await login(email, password);
      const target = redirect && redirect !== '/' ? redirect : '/';
      router.replace(target);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral">
      <Card className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="/assets/logo.png" alt="Logo" className="h-16" />
        </div>

        <h1 className="text-2xl font-heading text-center mb-6">Login</h1>

        <form onSubmit={handleSubmit}>
          <Input
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input
            id="password"
            label="Senha"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>

          {error && (
            <p className="mt-4 text-center text-danger">{error}</p>
          )}
        </form>
      </Card>
    </div>
  );
}
