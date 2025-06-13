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
import { Plus, Users, Edit2, Trash2, AlertCircle, Building2, Shield, Save, X } from 'lucide-react'
import api from '@/lib/api'

const checkboxClasses = 'w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent'

interface User {
  id: number
  name: string
  email: string
  companies: {
    company: {
      id: number
      name: string
      code: number
    }
    role: string
    manageFinancialAccounts?: boolean
    manageFinancialCategories?: boolean
  }[]
}

interface Company {
  id: number
  name: string
}

export default function UsersPage() {
  const confirmation = useConfirmation();
  const { userRole, companyId, companyName } = useAuth();
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
    newRole: 'USER'
  });
  const [companyConfigs, setCompanyConfigs] = useState<Array<{ companyId: number; role: string; manageFinancialAccounts: boolean; manageFinancialCategories: boolean }>>([]);

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
      let list: Company[] = response.data;
      if (!isAdmin() && userRole === 'SUPERUSER') {
        list = response.data.filter((c: Company) => c.id === companyId);
      }
      setCompanies(list);
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
      newRole: 'USER'
    });
    setCompanyConfigs(companies.length === 1 ? [{ companyId: companies[0].id, role: 'USER', manageFinancialAccounts: false, manageFinancialCategories: false }] : []);
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
      newRole: user.companies[0]?.role || 'USER'
    });
    setCompanyConfigs(user.companies.map(c => ({
      companyId: c.company.id,
      role: c.role,
      manageFinancialAccounts: (c as any).manageFinancialAccounts || false,
      manageFinancialCategories: (c as any).manageFinancialCategories || false
    })));
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
      newRole: 'USER'
    });
    setCompanyConfigs([]);
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
      
      if (companies.length === 0) {
        addToast('Não é possível criar usuários sem empresas disponíveis', 'error');
        return;
      }

      if (isAdmin() && companyConfigs.length === 0) {
        addToast('Selecione ao menos uma empresa', 'error');
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
        // ✅ EDIÇÃO - empresa não pode ser alterada
        const updateData: Partial<typeof formData> = { ...formData };
        if (!updateData.password) {
          delete updateData.password;
        }

        if (isAdmin() && companyConfigs.length === 0) {
          addToast('Selecione ao menos uma empresa', 'error');
          setFormLoading(false);
          return;
        }
        const payload = { ...updateData, companies: companyConfigs };
        await api.put(`/users/${editingUser.id}`, payload);
        
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
        if (isAdmin() && companyConfigs.length === 0) {
          addToast('Selecione ao menos uma empresa', 'error');
          setFormLoading(false);
          return;
        }

        const payload: any = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          newRole: formData.newRole,
          companies: companyConfigs,
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
          {showForm ? (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={formLoading}
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                variant="accent"
                onClick={handleSubmit}
                disabled={formLoading || (!editingUser && companies.length === 0)}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {formLoading
                  ? 'Salvando...'
                  : editingUser
                    ? 'Salvar Alterações'
                    : 'Criar Usuário'}
              </Button>
            </div>
          ) : (
            <Button
              variant="accent"
              onClick={openNewForm}
              className="flex items-center gap-2"
              disabled={formLoading}
            >
              <Plus size={16} />
              Novo Usuário
            </Button>
          )}
        </div>



        {/* ✅ FORMULÁRIO EXPANDIDO COM PERMISSÕES */}
        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-white">
                {editingUser ? `Editando: ${editingUser.name}` : 'Novo Usuário'}
              </h3>
              
              {/* Dados Básicos */}
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Nome"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  disabled={formLoading}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                  disabled={formLoading}
                />
                <Input
                  label={editingUser ? "Nova Senha (deixe em branco para manter)" : "Senha"}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required={!editingUser}
                  disabled={formLoading}
                  placeholder={editingUser ? "Deixe em branco para não alterar" : ""}
                />
              </div>

              {/* Empresas */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Empresas
                </label>
                <div className="bg-[#1e2126] border border-gray-700 rounded-lg p-4 space-y-2">
                  {companies.map((comp) => {
                    const cfg = companyConfigs.find(c => c.companyId === comp.id);
                    const single = companies.length === 1;
                    return (
                      <div key={comp.id} className="p-3 border border-gray-700 rounded-lg bg-[#1e2126]">
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={!!cfg}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCompanyConfigs([...companyConfigs, { companyId: comp.id, role: 'USER', manageFinancialAccounts: false, manageFinancialCategories: false }]);
                              } else {
                                setCompanyConfigs(companyConfigs.filter(c => c.companyId !== comp.id));
                              }
                            }}
                            disabled={formLoading || single}
                            className={checkboxClasses}
                          />
                          <span className="flex-1 text-sm text-white">{comp.name}</span>
                          {cfg && (
                            <select
                              value={cfg.role}
                              onChange={(e) => setCompanyConfigs(companyConfigs.map(c => c.companyId === comp.id ? { ...c, role: e.target.value } : c))}
                              className="px-2 py-1 bg-[#1e2126] border border-gray-700 text-white rounded"
                              disabled={formLoading}
                            >
                              <option value="USER">Usuário</option>
                              <option value="SUPERUSER">Superusuário</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                          )}
                        </label>
                        {cfg && (
                          <div className="ml-6 mt-2 space-y-2">
                            <label className="flex items-center gap-2 text-sm text-gray-300">
                              <input
                                type="checkbox"
                                className={checkboxClasses}
                                checked={cfg.manageFinancialAccounts}
                                onChange={(e) => setCompanyConfigs(companyConfigs.map(c => c.companyId === comp.id ? { ...c, manageFinancialAccounts: e.target.checked } : c))}
                              />
                              Gerenciar Contas Financeiras
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-300">
                              <input
                                type="checkbox"
                                className={checkboxClasses}
                                checked={cfg.manageFinancialCategories}
                                onChange={(e) => setCompanyConfigs(companyConfigs.map(c => c.companyId === comp.id ? { ...c, manageFinancialCategories: e.target.checked } : c))}
                              />
                              Gerenciar Categorias Financeiras
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>


              {/* ✅ SEÇÃO DE PERMISSÕES DE CONTAS (apenas para USER) */}
              {shouldShowPermissions() && (
                <div className="border-t border-gray-700 pt-6">
                  <div className="bg-[#1e2126] border border-gray-700 rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2">
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
                </div>
              )}

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={formLoading}
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                variant="accent"
                onClick={handleSubmit}
                disabled={formLoading || (!editingUser && companies.length === 0)}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {formLoading
                  ? 'Salvando...'
                  : editingUser
                    ? 'Salvar Alterações'
                    : 'Criar Usuário'
                }
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
                          {canManageUsers() && (
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
                          user.companies[0]?.role === 'ADMIN' ? 'bg-red-600 text-white' :
                          user.companies[0]?.role === 'SUPERUSER' ? 'bg-blue-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}>
                          {user.companies[0]?.role === 'ADMIN' ? 'Administrador' :
                           user.companies[0]?.role === 'SUPERUSER' ? 'Superusuário' : 'Usuário'}
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