import React, { useEffect, useState } from 'react'
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
import { Plus, Users as UsersIcon, Edit2, Trash2, Save, X } from 'lucide-react'
import api from '@/lib/api'

type Role = 'USER' | 'SUPERUSER' | 'ADMIN'

interface Company {
  id: number
  name: string
  code: number
}

interface UserCompany {
  company: Company
  role: Role
}

interface User {
  id: number
  name: string
  email: string
  companies: UserCompany[]
}

export default function UsersPage() {
  const confirmation = useConfirmation()
  const { userRole } = useAuth()
  const { isAdmin } = usePermissions()
  const { addToast } = useToast()

  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companiesError, setCompaniesError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', newRole: 'USER' as Role })
  const [companyConfigs, setCompanyConfigs] = useState<Array<{ companyId: number; role: Role }>>([])

  useEffect(() => {
    fetchUsers()
    fetchCompanies()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/users')
      setUsers(response.data)
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar Usuários'
      setError(errorMsg)
      addToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchCompanies() {
    try {
      const response = await api.get('/companies')
      setCompanies(response.data)
      setCompaniesError(null)
    } catch (err: any) {
      if (err.response?.status === 403) {
        setCompaniesError('Sem permissão para listar empresas.')
      } else {
        setCompaniesError('Erro ao carregar lista de empresas')
      }
    }
  }

  function allowedRolesByCurrentUser(): Role[] {
    if (userRole === 'ADMIN') return ['ADMIN', 'SUPERUSER', 'USER']
    if (userRole === 'SUPERUSER') return ['SUPERUSER', 'USER']
    return ['USER']
  }

  function openNewForm() {
    if (companiesError) {
      addToast('Não é possível criar Usuários sem acesso à  lista de empresas', 'error')
      return
    }
    setEditingUser(null)
    setFormData({ name: '', email: '', password: '', newRole: (userRole === 'ADMIN' ? 'SUPERUSER' : 'USER') })
    setCompanyConfigs([])
    setShowForm(true)
  }

  function openEditForm(user: User) {
    setEditingUser(user)
    setFormData({ name: user.name, email: user.email, password: '', newRole: user.companies[0]?.role || 'USER' })
    setCompanyConfigs(user.companies.map(uc => ({ companyId: uc.company.id, role: uc.role })))
    setShowForm(true)
  }

  function toggleCompany(companyId: number) {
    const exists = companyConfigs.find(c => c.companyId === companyId)
    if (exists) {
      setCompanyConfigs(companyConfigs.filter(c => c.companyId !== companyId))
    } else {
      const role = allowedRolesByCurrentUser()[allowedRolesByCurrentUser().length - 1]
      setCompanyConfigs([...companyConfigs, { companyId, role }])
    }
  }

  function updateCompanyRole(companyId: number, role: Role) {
    setCompanyConfigs(companyConfigs.map(c => (c.companyId === companyId ? { ...c, role } : c)))
  }

  function closeForm() {
    setShowForm(false)
    setEditingUser(null)
    setFormData({ name: '', email: '', password: '', newRole: 'USER' })
    setCompanyConfigs([])
  }

  async function handleSubmit() {
    try {
      setFormLoading(true)
      if (!formData.name.trim() || !formData.email.trim()) {
        addToast('Nome e email são obrigatórios', 'error')
        setFormLoading(false)
        return
      }

      if (isAdmin() && companyConfigs.length === 0) {
        addToast('Selecione ao menos uma empresa', 'error')
        setFormLoading(false)
        return
      }

      if (editingUser) {
        const payload: any = {
          name: formData.name,
          email: formData.email,
          newRole: formData.newRole,
          companies: companyConfigs,
        }
        if (formData.password) payload.password = formData.password
        await api.put(`/users/${editingUser.id}`, payload)
        addToast('Usuário atualizado com sucesso', 'success')
      } else {
        if (!formData.password) {
          addToast('Senha Ã© obrigatÃ³ria para novos Usuários', 'error')
          setFormLoading(false)
          return
        }
        const payload: any = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          newRole: formData.newRole,
          companies: companyConfigs,
        }
        await api.post('/users', payload)
        addToast('Usuário criado com sucesso', 'success')
      }

      closeForm()
      fetchUsers()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar Usuário', 'error')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(user: User) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir o Usuário "${user.name}"? Esta ação nÃ£o pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger',
      },
      async () => {
        try {
          await api.delete(`/users/${user.id}`)
          addToast('Usuário excluído com sucesso', 'success')
          if (editingUser?.id === user.id) closeForm()
          fetchUsers()
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir Usuário', 'error')
          throw err
        }
      }
    )
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Usuários' }]} />

      <AccessGuard requiredRole="SUPERUSER">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Usuários</h1>
          {showForm ? (
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={closeForm} disabled={formLoading} className="flex items-center gap-2">
                <X size={16} />
                Cancelar
              </Button>
              <Button variant="accent" onClick={handleSubmit} disabled={formLoading || (!editingUser && companies.length === 0)} className="flex items-center gap-2">
                <Save size={16} />
                {formLoading ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </Button>
            </div>
          ) : (
            <Button variant="accent" onClick={openNewForm} className="flex items-center gap-2" disabled={formLoading}>
              <Plus size={16} />
              Novo Usuário
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Nome</label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nome" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Email</label>
                <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@dominio.com" />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Senha</label>
                  <Input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Senha" />
                </div>
              )}
              <div>
                <label className="block text-sm text-muted mb-1">Papel (global)</label>
                <select
                  value={formData.newRole}
                  onChange={e => setFormData({ ...formData, newRole: e.target.value as Role })}
                  className="px-2 py-2 bg-background border border-soft text-base-color rounded w-full focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                >
                  {allowedRolesByCurrentUser().map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm text-muted mb-2">Empresas</label>
              <div className="space-y-3">
                {companies.map(comp => {
                  const cfg = companyConfigs.find(c => c.companyId === comp.id)
                  const checked = !!cfg
                  return (
                    <div key={comp.id} className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-accent bg-background border-soft rounded focus:ring-accent"
                          checked={checked}
                          onChange={() => toggleCompany(comp.id)}
                        />
                        <span className="text-base-color">{comp.name}</span>
                      </label>
                      {checked && (
                        <select
                          value={cfg?.role || 'USER'}
                          onChange={e => updateCompanyRole(comp.id, e.target.value as Role)}
                          className="px-2 py-1 bg-background border border-soft text-base-color rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        >
                          {allowedRolesByCurrentUser().map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={fetchUsers}>Tentar Novamente</Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10">
              <UsersIcon size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhum Usuário encontrado</p>
              {!companiesError && (
                <Button variant="accent" onClick={openNewForm} className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Criar Primeiro Usuário
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Empresas</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-gray-700 hover:bg-elevated">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button onClick={() => openEditForm(u)} className="p-1 text-gray-300 hover:text-[#2563eb]" title="Editar" disabled={formLoading}>
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(u)} className="p-1 text-gray-300 hover:text-red-400" title="Excluir" disabled={formLoading}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-gray-300">{u.email}</td>
                      <td className="px-4 py-3 text-gray-300">{u.companies.map(uc => uc.company.name).join(', ')}</td>
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
  )
}



