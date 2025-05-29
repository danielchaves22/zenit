// frontend/pages/admin/users.tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PageLoader } from '../../components/ui/PageLoader'
import { useToast } from '../../components/ui/ToastContext'
import { Plus, Edit2, Trash2, User } from 'lucide-react'
import api from '../../lib/api'

interface User {
  id: number
  name: string
  email: string
  role: string
  companies: {
    company: {
      id: number
      name: string
      code: number
    }
  }[]
}

interface Company {
  id: number
  name: string
}

export default function AdminUsersPage() {
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
  const [newRole, setNewRole] = useState('USER');
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    fetchUsers();
    if (userRole === 'ADMIN') fetchCompanies();
  }, [token, userRole]);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  }

  async function handleCreateUser() {
    if (!name.trim() || !email.trim() || !password || !companyId) {
      addToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }
    try {
      await api.post('/users', {
        name,
        email,
        password,
        newRole,
        companyId: Number(companyId),
      });
      
      setName('');
      setEmail('');
      setPassword('');
      setNewRole('USER');
      setCompanyId('');
      setCreating(false);
      fetchUsers();
      addToast('Usuário criado com sucesso', 'success');
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao criar usuário', 'error');
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Gestão de Usuários">
        <PageLoader message="Carregando usuários..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Gestão de Usuários">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Administração' },
        { label: 'Usuários' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Gestão de Usuários</h1>
        {userRole === 'ADMIN' && (
          <Button 
            variant="accent" 
            onClick={() => setCreating(!creating)}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            {creating ? 'Cancelar' : 'Novo Usuário'}
          </Button>
        )}
      </div>

      {/* Formulário de criação */}
      {creating && userRole === 'ADMIN' && (
        <Card className="mb-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white mb-4">Novo Usuário</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="user-name"
                label="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                id="user-email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="user-password"
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="user-role">
                  Perfil
                </label>
                <select
                  id="user-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  required
                >
                  <option value="USER">Usuário</option>
                  <option value="SUPERUSER">Superusuário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="user-company">
                Empresa
              </label>
              <select
                id="user-company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                required
              >
                <option value="">-- Selecione uma empresa --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setCreating(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                variant="accent" 
                onClick={handleCreateUser}
                className="flex-1"
              >
                Criar Usuário
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de usuários */}
      <Card>
        {error ? (
          <div className="text-center py-10">
            <p className="text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={fetchUsers}>
              Tentar Novamente
            </Button>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-10">
            <User size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhum usuário encontrado</p>
            {userRole === 'ADMIN' && (
              <Button 
                variant="accent" 
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Criar Primeiro Usuário
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Perfil</th>
                  <th className="px-4 py-3 text-left">Empresa</th>
                  {userRole === 'ADMIN' && (
                    <th className="px-4 py-3 text-center">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-[#f59e0b] rounded-full p-2">
                          <User size={16} className="text-white" />
                        </div>
                        <span className="font-medium text-white">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN' ? 'bg-red-900 text-red-300' :
                        user.role === 'SUPERUSER' ? 'bg-blue-900 text-blue-300' :
                        'bg-green-900 text-green-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {user.companies.map(uc => uc.company.name).join(', ')}
                    </td>
                    {userRole === 'ADMIN' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-center">
                          <button
                            className="p-1 text-gray-300 hover:text-white"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}