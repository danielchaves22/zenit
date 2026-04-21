import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Skeleton } from '@/components/ui/Skeleton'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useConfirmation } from '@/hooks/useConfirmation'
import { useToast } from '@/components/ui/ToastContext'
import { Plus, Users as UsersIcon, Edit2, Trash2 } from 'lucide-react'
import api from '@/lib/api'

interface Company {
  id: number
  name: string
  code: number
}

interface UserCompany {
  company: Company
  role: 'USER' | 'SUPERUSER' | 'ADMIN'
}

interface User {
  id: number
  name: string
  email: string
  companies: UserCompany[]
}

export default function UsersPage() {
  const router = useRouter()
  const confirmation = useConfirmation()
  const { addToast } = useToast()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    void fetchUsers()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/users')
      setUsers(response.data)
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar usuarios'
      setError(errorMsg)
      addToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  function openNewForm() {
    router.push('/admin/users/new')
  }

  function openEditForm(user: User) {
    router.push(`/admin/users/${user.id}`)
  }

  function handleDelete(user: User) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir o usuario "${user.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          setActionLoading(true)
          await api.delete(`/users/${user.id}`)
          addToast('Usuario excluido com sucesso', 'success')
          await fetchUsers()
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir usuario', 'error')
          throw err
        } finally {
          setActionLoading(false)
        }
      }
    )
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: 'Usuarios' }]} />

      <AccessGuard requiredRole="SUPERUSER">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Usuarios</h1>
          <Button
            variant="accent"
            onClick={openNewForm}
            className="flex items-center gap-2"
            disabled={actionLoading}
          >
            <Plus size={16} />
            Novo Usuario
          </Button>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={() => void fetchUsers()}>
                Tentar novamente
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10">
              <UsersIcon size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhum usuario encontrado</p>
              <Button variant="accent" onClick={openNewForm} className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar primeiro usuario
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Acoes</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Empresas</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-soft hover:bg-elevated">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEditForm(user)}
                            className="p-1 text-gray-300 hover:text-[#2563eb]"
                            title="Editar"
                            disabled={actionLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="p-1 text-gray-300 hover:text-red-400"
                            title="Excluir"
                            disabled={actionLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-gray-300">{user.email}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {user.companies.map(item => item.company.name).join(', ')}
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
  )
}
