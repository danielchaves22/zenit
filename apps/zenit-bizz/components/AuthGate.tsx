import { FormEvent, ReactNode, useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Brand } from './Brand';

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, company, companies, loading, error, login, logout, selectCompany, reload } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage('');
    setBusy(true);
    try {
      if (user?.mustChangePassword) {
        if (newPassword !== confirmation) {
          setMessage('As novas senhas precisam ser iguais.');
          return;
        }
        await api('/auth/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: password, newPassword })
        });
        setPassword('');
        setNewPassword('');
        setConfirmation('');
        await reload();
      } else {
        await login(email, password);
        setPassword('');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="loading-screen" role="status">
        <Brand />
        <p>Preparando seu espaço…</p>
      </div>
    );
  if (user && company && !user.mustChangePassword && !error) return <>{children}</>;
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">SEU NEGÓCIO, BEM CUIDADO</span>
          <h1>
            Mais espaço para
            <br />o que faz
            <br />
            <em>seu negócio crescer.</em>
          </h1>
          <p>
            Clientes e fornecedores organizados.
            <br />
            Um começo simples para o dia a dia da sua empresa.
          </p>
        </div>
        <span className="auth-footer">Parte do ecossistema Zenit</span>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand">
            <Brand />
          </div>
          {error ? (
            <>
              <h1>Vamos tentar novamente?</h1>
              <p role="alert" className="form-error">
                {error}
              </p>
              <button className="button primary" onClick={() => void reload()}>
                Tentar novamente
              </button>
              <button className="button quiet" onClick={logout}>
                Voltar ao login
              </button>
            </>
          ) : !user || user.mustChangePassword ? (
            <>
              <span className="eyebrow">ZENIT BIZZ</span>
              <h1>{user ? 'Defina sua nova senha' : 'Bem-vindo ao seu negócio'}</h1>
              <p className="subtle">
                {user
                  ? 'Para concluir seu primeiro acesso, escolha uma senha pessoal.'
                  : 'Entre com sua conta do ecossistema Zenit.'}
              </p>
              <form onSubmit={submit} className="stack">
                {!user && (
                  <label>
                    E-mail
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@empresa.com.br"
                    />
                  </label>
                )}
                <label>
                  {user ? 'Senha atual' : 'Senha'}
                  <span className="password-field">
                    <input
                      type={show ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {user && (
                  <>
                    <label>
                      Nova senha
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={72}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <small>Pelo menos 8 caracteres.</small>
                    </label>
                    <label>
                      Confirme a nova senha
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {message && (
                  <p className="form-error" role="alert">
                    {message}
                  </p>
                )}
                <button className="button primary full" disabled={busy}>
                  {busy ? 'Aguarde…' : user ? 'Salvar nova senha' : 'Entrar no Bizz'}
                  <ArrowRight size={18} />
                </button>
              </form>
              {user ? (
                <button className="button quiet" onClick={logout}>
                  Sair
                </button>
              ) : (
                <p className="login-help">Seu acesso é liberado pelo responsável da empresa.</p>
              )}
            </>
          ) : companies.length === 0 ? (
            <>
              <Building2 className="empty-icon" />
              <h1>Acesso ainda não liberado</h1>
              <p className="subtle">
                Peça ao responsável para habilitar o Zenit Bizz na empresa e conceder acesso ao seu usuário.
              </p>
              <button className="button primary" onClick={() => void reload()}>
                Verificar acesso
              </button>
              <button className="button quiet" onClick={logout}>
                <LogOut size={16} /> Sair
              </button>
            </>
          ) : (
            <>
              <span className="eyebrow">SEU ESPAÇO DE TRABALHO</span>
              <h1>Qual empresa vamos cuidar?</h1>
              <p className="subtle">Escolha onde deseja trabalhar agora.</p>
              <div className="company-options">
                {companies.map((item) => (
                  <button className="company-option" key={item.id} onClick={() => selectCompany(item.id)}>
                    <Building2 size={22} />
                    <span>{item.name}</span>
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
              <button className="button quiet" onClick={logout}>
                Sair
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
