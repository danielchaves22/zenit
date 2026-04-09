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
import { Plus, Building2, Edit2, Trash2 } from 'lucide-react'
import api from '@/lib/api'

interface Company {
  id: number
  name: string
  legalName?: string
  address?: string
  code: number
  createdAt: string
  updatedAt: string
}

export default function CompaniesPage() {
  const router = useRouter()
  const confirmation = useConfirmation()
  const { addToast } = useToast()

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchCompanies()
  }, [])

  async function fetchCompanies() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/companies')
      setCompanies(response.data)
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar empresas'
      setError(errorMsg)
      addToast(errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  function openNewForm() {
    router.push('/admin/companies/new')
  }

  function openEditForm(company: Company) {
    router.push(`/admin/companies/${company.id}`)
  }

  function handleDelete(company: Company) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a empresa "${company.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          setActionLoading(true)
          await api.delete(`/companies/${company.id}`)
          addToast('Empresa excluída com sucesso', 'success')
          fetchCompanies()
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir empresa', 'error')
          throw err
        } finally {
          setActionLoading(false)
        }
      }
    )
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Empresas' }]} />

      <AccessGuard allowedRoles={['ADMIN']}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Empresas</h1>
          <Button variant="accent" onClick={openNewForm} className="flex items-center gap-2" disabled={actionLoading}>
            <Plus size={16} />
            Nova Empresa
          </Button>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={fetchCompanies}>
                Tentar Novamente
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <div className="text-center py-10">
              <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhuma empresa cadastrada</p>
              <Button variant="accent" onClick={openNewForm} className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Empresa
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Razão social</th>
                    <th className="px-4 py-3 text-left">Endereço</th>
                    <th className="px-4 py-3 text-left">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="border-b border-soft hover:bg-elevated">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEditForm(company)}
                            className="p-1 text-gray-300 hover:text-[#2563eb]"
                            title="Editar"
                            disabled={actionLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(company)}
                            className="p-1 text-gray-300 hover:text-red-400"
                            title="Excluir"
                            disabled={actionLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-accent font-medium">
                          {company.code.toString().padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-accent" />
                          <span className="font-medium text-white">{company.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {company.legalName || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {company.address || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {new Date(company.createdAt).toLocaleDateString('pt-BR')}
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
