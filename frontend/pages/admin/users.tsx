// frontend/pages/admin/users.tsx - VERSÃO COM PERMISSÕES DE CONTAS
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Skeleton } from '@/components/ui/Skeleton'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useConfirmation } from '@/hooks/useConfirmation'
import { useToast } from '@/components/ui/ToastContext'
import { usePermissions } from '@/hooks/usePermissions'
import AccountPermissionsManager from '@/components/admin/AccountPermissionsManager'
import { Plus, Users, Edit2, Trash2, AlertCircle, Building2, Shield } from 'lucide-react'
import api from '@/lib/api'

interface User {
  id: number
  name: string
  email: string
  role: string
  manageFinancialAccounts?: boolean
  manageFinancialCategories?: boolean
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
  const { canManageUsers, isAdmin } = usePermissions();
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    newRole: 'USER',
    companyId: '',
    manageFinancialAccounts: false,
    manageFinancialCategories: false
  });

  // ✅ ESTADOS PARA PERMISSÕES DE CONTAS
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [grantAllAccess, setGrantAllAccess] = useState(false);

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
      setCompaniesError(null);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setCompaniesError('Sem permissão para listar empresas.');
        console.warn('Usuário sem permissão para acessar empresas');
      } else {
        console.error('Erro ao carregar empresas:', err);
        setCompaniesError('Erro ao carregar lista de empresas');
      }
    }
  }

  function openNewForm() {
    if (companies.length === 0 && !companiesError) {
      addToast('Carregando lista de empresas...', 'error');
      return;
    }
    
    if (companiesError) {
      addToast('Não é possível criar usuários sem acesso à lista de empresas', 'error');
      return;
    }

    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      newRole: 'USER',
      companyId: companies.length > 0 ? companies[0].id.toString() : '',
      manageFinancialAccounts: false,
      manageFinancialCategories: false
    });
    // ✅ RESETAR PERMISSÕES
    setSelectedAccountIds([]);
    setGrantAllAccess(false);
    setShowForm(true);
  }

  function openEditForm(user: User) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      newRole: user.role,
      companyId: user.companies[0]?.company.id.toString() || '',
      manageFinancialAccounts: user.manageFinancialAccounts || false,
      manageFinancialCategories: user.manageFinancialCategories || false
    });
    // ✅ PERMISSÕES SERÃO CARREGADAS PELO COMPONENTE AccountPermissionsManager
    setSelectedAccountIds([]);
    setGrantAllAccess(false);
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
      companyId: '',
      manageFinancialAccounts: false,
      manageFinancialCategories: false
    });
    // ✅ LIMPAR PERMISSÕES
    setSelectedAccountIds([]);
    setGrantAllAccess(false);
  }

  // ✅ HANDLER PARA MUDANÇAS NAS PERMISSÕES
  const handlePermissionsChange = (accountIds: number[], grantAll: boolean) => {
    setSelectedAccountIds(accountIds);
    setGrantAllAccess(grantAll);
  };

  // ✅ FUNÇÃO PARA CONFIRMAR SALVAMENTO SEM PERMISSÕES
  const confirmSaveWithoutPermissions = (): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmation.confirm(
        {
          title: 'Usuário sem Permissões de Acesso',
          message: `O usuário "${formData.name}" será criado sem acesso a nenhuma conta financeira. Ele não conseguirá visualizar dashboard, transações ou relatórios até que permissões sejam concedidas. Deseja continuar?`,
          confirmText: 'Criar Mesmo Assim',
          cancelText: 'Voltar e Configurar',
          type: 'warning'
        },
        () => resolve(true),
        () => resolve(false)
      );
    });
  };

  async function handleSubmit() {
    if (!formData.name.trim() || !formData.email.trim()) {
      addToast('Nome e email são obrigatórios', 'error');
      return;
    }

    if (!editingUser) {
      if (!formData.password) {
        addToast('Senha é obrigatória para novos usuários', 'error');
        return;
      }
      
      if (!formData.companyId && companies.length > 0) {
        addToast('Selecione uma empresa para o usuário', 'error');
        return;
      }
      
      if (companies.length === 0) {
        addToast('Não é possível criar usuários sem empresas disponíveis', 'error');
        return;
      }

      // ✅ CONFIRMAR SE É USER SEM PERMISSÕES
      if (formData.newRole === 'USER' && selectedAccountIds.length === 0) {
        const shouldContinue = await confirmSaveWithoutPermissions();
        if (!shouldContinue) return;
      }
    }

    setFormLoading(true);

    try {
      if (editingUser) {
        // ✅ EDIÇÃO - apenas dados básicos, permissões são gerenciadas separadamente
        const { password, ...updateDataWithoutPassword } = formData;
        const updateData = formData.password
          ? { ...formData, companyId: formData.companyId ? Number(formData.companyId) : null }
          : { ...updateDataWithoutPassword, companyId: formData.companyId ? Number(formData.companyId) : null };

        updateData.manageFinancialAccounts = formData.manageFinancialAccounts;
        updateData.manageFinancialCategories = formData.manageFinancialCategories;

        await api.put(`/users/${editingUser.id}`, updateData);
        
        // ✅ ATUALIZAR PERMISSÕES SE FOR USER
        if (formData.newRole === 'USER') {
          if (grantAllAccess) {
            await api.post(`/users/${editingUser.id}/account-access/grant-all`);
          } else {
            await api.post(`/users/${editingUser.id}/account-access/bulk-update`, {
              accountIds: selectedAccountIds
            });
          }
        }
        
        addToast('Usuário atualizado com sucesso', 'success');
      } else {
        // ✅ CRIAÇÃO COM PERMISSÕES
        const payload: any = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          newRole: formData.newRole,
          companyId: Number(formData.companyId),
          manageFinancialAccounts: formData.manageFinancialAccounts,
          manageFinancialCategories: formData.manageFinancialCategories,
        };

        // ✅ ADICIONAR PERMISSÕES APENAS PARA USER
        if (formData.newRole === 'USER') {
          payload.accountPermissions = {
            grantAllAccess,
            specificAccountIds: grantAllAccess ? [] : selectedAccountIds
          };
        }

        await api.post('/users', payload);
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
          
          if (editingUser?.id === user.id) {
            closeForm();
          }
          
          fetchUsers();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir usuário', 'error');
          throw err;
        }
      }
    );
  }

  // ✅ VERIFICAR SE DEVE MOSTRAR SEÇÃO DE PERMISSÕES
  const shouldShowPermissions = () => {
    return formData.newRole === 'USER';
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Usuários' }
      ]} />

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



        {/* ✅ FORMULÁRIO EXPANDIDO COM PERMISSÕES */}
        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-white">
                {editingUser ? `Editando: ${editingUser.name}` : 'Novo Usuário'}
              </h3>
              
              {/* Dados Básicos */}
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
                    className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-[#2563eb]"
                    disabled={formLoading}
                  >
                    <option value="USER">Usuário</option>
                    <option value="SUPERUSER">Superusuário</option>
                    {isAdmin() && <option value="ADMIN">Administrador</option>}
                  </select>
                </div>
              </div>

              {/* Campo de Empresa */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Empresa {!editingUser && '*'}
                </label>
                {companies.length > 0 ? (
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                    className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-[#2563eb]"
                    required={!editingUser}
                    disabled={formLoading}
                  >
                    <option value="">-- Selecione uma empresa --</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-400 rounded-lg">
                    {companiesError || 'Nenhuma empresa disponível'}
                  </div>
                )}
              </div>

              {/* Permissões de Funcionalidades */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={formData.manageFinancialAccounts}
                    onChange={(e) => setFormData({...formData, manageFinancialAccounts: e.target.checked})}
                  />
                  Gerenciar Contas Financeiras
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={formData.manageFinancialCategories}
                    onChange={(e) => setFormData({...formData, manageFinancialCategories: e.target.checked})}
                  />
                  Gerenciar Categorias Financeiras
                </label>
              </div>

              {/* ✅ SEÇÃO DE PERMISSÕES DE CONTAS (apenas para USER) */}
              {shouldShowPermissions() && (
                <div className="border-t border-gray-700 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={18} className="text-accent" />
                    <h4 className="text-md font-medium text-white">Permissões de Acesso Financeiro</h4>
                  </div>
                  
                  <AccountPermissionsManager
                    userId={editingUser?.id || null}
                    selectedAccountIds={selectedAccountIds}
                    onPermissionsChange={handlePermissionsChange}
                    disabled={formLoading}
                    showCurrentPermissions={!!editingUser}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-700">
                <Button 
                  variant="accent" 
                  onClick={handleSubmit}
                  disabled={formLoading || (!editingUser && companies.length === 0)}
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

        {/* Lista de Usuários - mantida igual */}
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
              {!companiesError && (
                <Button 
                  variant="accent" 
                  onClick={openNewForm}
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