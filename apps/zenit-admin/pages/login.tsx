import { useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { redirect } = router.query as { redirect?: string };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      const target = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      router.replace(user.mustChangePassword ? '/first-access' : target);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="admin-auth-page">
      <div className="admin-login">
        <div className="admin-login-brand">
          <Image
            src="/assets/images/logo_principal.png"
            alt="Zenit Admin"
            width={2000}
            height={768}
            priority
          />
        </div>
        <div className="admin-login-form">
          <h1>Acessar a plataforma</h1>
          <p>Acesso exclusivo aos administradores do Zenit.</p>
          <form onSubmit={handleSubmit}>
            <Input
              label="E-mail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
            />
            <div className="relative">
              <Input
                id="password"
                label="Senha"
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="admin-icon-button absolute right-1 bottom-0.5"
                aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p role="alert" className="mb-4 text-sm text-tone-red">
                {error}
              </p>
            )}
            <Button type="submit" variant="accent" className="w-full mt-2" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
