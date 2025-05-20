import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/ui/Layout'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastContext'

interface User {
  id: string
  name: string
  email: string
  role: string
  companies: string[]
}

interface Company {
  id: string
  name: string
}

export default function UsersPage() {
  const { token, userRole } = useAuth();
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('USER');
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    fetchUsers();
    if (userRole === 'ADMIN') fetchCompanies();
  }, [token, userRole]);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao carregar usuários');
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCompanies(await res.json());
    } catch {
      // ignore
    }
  }

  async function handleCreateUser() {
    if (!name.trim() || !email.trim() || !password || !companyId) {
      addToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          companyId: Number(companyId),
        }),
      });
      if (!res.ok) throw new Error('Falha ao criar usuário');
      setName('');
      setEmail('');
      setPassword('');
      setRole('USER');
      setCompanyId('');
      setCreating(false);
      fetchUsers();
      addToast('Usuário criado com sucesso', 'success');
    } catch (err: any) {
      addToast(err.message || 'Erro inesperado', 'error');
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-heading font-bold mb-6">Usuários</h1>

      {userRole === 'ADMIN' && (
        <div>
          <Button variant="primary" onClick={() => setCreating((p) => !p)}>
            {creating ? 'Cancelar' : 'Novo Usuário'}
          </Button>
          {creating && (
            <Card className="mt-4 space-y-4">
              <Input
                id="user-name"
                label="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                id="user-email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                id="user-password"
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" htmlFor="user-role">
                  Perfil
                </label>
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" htmlFor="user-company">
                  Empresa
                </label>
                <select
                  id="user-company"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
                >
                  <option value="">-- Selecione --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="accent" onClick={handleCreateUser}>
                Salvar
              </Button>
            </Card>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 mt-6">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
        </div>
      ) : error ? (
        <p className="text-center text-danger">{error}</p>
      ) : (
        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-neutral">
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Perfil</th>
                  <th className="text-left p-2">Empresas</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.companies.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Layout>
  );
}
