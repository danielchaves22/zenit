// frontend/pages/admin/users.tsx - COM PROTEÇÃO DE ACESSO
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Skeleton } from '@/components/ui/Skeleton'
import { AccessGuard } from '@/components/ui/AccessGuard' // ✅ NOVO IMPORT
import { useToast } from '@/components/ui/ToastContext'
import { usePermissions } from '@/hooks/usePermissions' // ✅ NOVO IMPORT
import { Plus, Users, Edit2, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';

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

export default function UsersPage() {
  const confirmation = useConfirmation();
  const { userRole } = useAuth();
  const { canManageUsers, isAdmin } = usePermissions(); // ✅ USAR HOOK DE PERMISSÕES
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    newRole: 'USER',
    companyId: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar usuários';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data);
    } catch (err) {
      console.error('Erro ao carregar empresas:', err);
    }
  }

  function openNewForm() {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      newRole: 'USER',
      companyId: companies.length > 0 ? companies[0].id.toString() : ''
    });
    setShowForm(true);
  }

  function openEditForm(user: User) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '', // Always empty for editing
      newRole: user.role,
      companyId: user.companies[0]?.company.id.toString() || ''
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      newRole: 'USER',
      companyId: ''
    });
  }

  async function handleSubmit() {
    if (!formData.name.trim() || !formData.email.trim() || !formData.companyId) {
      addToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    if (!editingUser && !formData.password) {
      addToast('Senha é obrigatória para novos usuários', 'error');
      return;
    }

    setFormLoading(true);

    try {
      if (editingUser) {
        // Editing existing user
        const { password, ...updateDataWithoutPassword } = formData;
        const updateData = formData.password 
          ? { ...formData, companyId: Number(formData.companyId) }
          : { ...updateDataWithoutPassword, companyId: Number(formData.companyId) };

        await api.put(`/users/${editingUser.id}`, updateData);
        addToast('Usuário atualizado com sucesso', 'success');
      } else {
        // Creating new user
        await api.post('/users', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          newRole: formData.newRole,
          companyId: Number(formData.companyId),
        });
        addToast('Usuário criado com sucesso', 'success');
      }

      closeForm();
      fetchUsers();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar usuário', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(user: User) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir o usuário "${user.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/users/${user.id}`);
          addToast('Usuário excluído com sucesso', 'success');
          
          // If we were editing this user, close the form
          if (editingUser?.id === user.id) {
            closeForm();
          }
          
          fetchUsers();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir usuário', 'error');
          throw err; // Re-throw to keep modal open on error
        }
      }
    );
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Usuários' }
      ]} />

      {/* ✅ PROTEÇÃO DE ACESSO - APENAS SUPERUSER E ADMIN */}
      <AccessGuard requiredRole="SUPERUSER">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Usuários</h1>
          <Button 
            variant="accent" 
            onClick={() => showForm ? closeForm() : openNewForm()}
            className="flex items-center gap-2"
            disabled={formLoading}
          >
            <Plus size={16} />
            {showForm ? 'Cancelar' : 'Novo Usuário'}
          </Button>
        </div>

        {/* Inline form */}
        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">
                {editingUser ? `Editando: ${editingUser.name}` : 'Novo Usuário'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nome"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  disabled={formLoading}
                />
                
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                  disabled={formLoading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={editingUser ? "Nova Senha (deixe em branco para manter)" : "Senha"}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required={!editingUser}
                  disabled={formLoading}
                  placeholder={editingUser ? "Deixe em branco para não alterar" : ""}
                />

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Perfil
                  </label>
                  <select
                    value={formData.newRole}
                    onChange={(e) => setFormData({...formData, newRole: e.target.value})}
                    className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                    disabled={formLoading}
                  >
                    <option value="USER">Usuário</option>
                    <option value="SUPERUSER">Superusuário</option>
                    {/* ✅ APENAS ADMIN PODE CRIAR OUTROS ADMINS */}
                    {isAdmin() && <option value="ADMIN">Administrador</option>}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Empresa
                </label>
                <select
                  value={formData.companyId}
                  onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  required
                  disabled={formLoading}
                >
                  <option value="">-- Selecione uma empresa --</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="accent" 
                  onClick={handleSubmit}
                  disabled={formLoading}
                >
                  {formLoading 
                    ? 'Salvando...' 
                    : editingUser 
                      ? 'Salvar Alterações' 
                      : 'Criar Usuário'
                  }
                </Button>
                <Button 
                  variant="outline" 
                  onClick={closeForm}
                  disabled={formLoading}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={fetchUsers}>
                Tentar Novamente
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10">
              <Users size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhum usuário encontrado</p>
              <Button 
                variant="accent" 
                onClick={openNewForm}
                className="inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Criar Primeiro Usuário
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Perfil</th>
                    <th className="px-4 py-3 text-left">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr 
                      key={user.id} 
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                        editingUser?.id === user.id 
                          ? 'bg-[#2563eb]/10 border-[#2563eb]/30' 
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEditForm(user)}
                            className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
                            title="Editar"
                            disabled={formLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          {/* ✅ APENAS ADMIN PODE EXCLUIR USUÁRIOS */}
                          {isAdmin() && (
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                              title="Excluir"
                              disabled={formLoading}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-gray-300">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'ADMIN' ? 'bg-red-600 text-white' :
                          user.role === 'SUPERUSER' ? 'bg-blue-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}>
                          {user.role === 'ADMIN' ? 'Administrador' :
                           user.role === 'SUPERUSER' ? 'Superusuário' : 'Usuário'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {user.companies.map(uc => uc.company.name).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <ConfirmationModal
          isOpen={confirmation.isOpen}
          onClose={confirmation.handleClose}
          onConfirm={confirmation.handleConfirm}
          title={confirmation.options.title}
          message={confirmation.options.message}
          confirmText={confirmation.options.confirmText}
          cancelText={confirmation.options.cancelText}
          type={confirmation.options.type}
          loading={confirmation.loading}
        />
      </AccessGuard>
    </DashboardLayout>
  );
}