import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastContext'
import { Save, X } from 'lucide-react'
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

interface CompanyFormProps {
  mode: 'create' | 'edit'
  companyId?: string | number
}

export function CompanyForm({ mode, companyId }: CompanyFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const isEdit = mode === 'edit'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({ name: '', legalName: '', address: '' })

  useEffect(() => {
    if (isEdit && (companyId === undefined || companyId === null)) return
    const load = async () => {
      setLoading(true)
      setError(null)
      if (isEdit) {
        await fetchCompany()
      } else {
        setFormData({ name: '', legalName: '', address: '' })
      }
      setLoading(false)
    }
    load()
  }, [isEdit, companyId])

  async function fetchCompany() {
    const id = Number(companyId)
    if (isNaN(id)) {
      setError('ID de empresa inválido.')
      return
    }
    try {
      const response = await api.get('/companies')
      const list: Company[] = response.data || []
      const found = list.find(c => c.id === id)
      if (!found) {
        setError('Empresa não encontrada.')
        return
      }
      setFormData({ name: found.name, legalName: found.legalName || '', address: found.address || '' })
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar empresa'
      setError(errorMsg)
    }
  }

  function handleCancel() {
    router.push('/admin/companies')
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da empresa é obrigatório', 'error')
      return
    }

    setFormLoading(true)
    try {
      if (isEdit) {
        const payload: any = { name: formData.name }
        if (formData.legalName?.trim()) payload.legalName = formData.legalName
        if (formData.address?.trim()) payload.address = formData.address
        await api.put(`/companies/${companyId}`, payload)
        addToast('Empresa atualizada com sucesso', 'success')
      } else {
        await api.post('/companies', {
          name: formData.name,
          legalName: formData.legalName || undefined,
          address: formData.address || undefined
        })
        addToast('Empresa criada com sucesso', 'success')
      }
      router.push('/admin/companies')
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar empresa', 'error')
    } finally {
      setFormLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded bg-elevated" />
          ))}
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-10">
          <div className="text-red-400 mb-4">{error}</div>
          <Button variant="outline" onClick={handleCancel}>Voltar</Button>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">
          {isEdit ? 'Editar empresa' : 'Nova empresa'}
        </h1>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={formLoading} className="flex items-center gap-2">
            <X size={16} />
            Cancelar
          </Button>
          <Button variant="accent" onClick={handleSubmit} disabled={formLoading} className="flex items-center gap-2">
            <Save size={16} />
            {formLoading ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar empresa'}
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Nome da empresa</label>
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nome" autoFocus={!isEdit} />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Razão social</label>
            <Input value={formData.legalName} onChange={e => setFormData({ ...formData, legalName: e.target.value })} placeholder="Razão social" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Endereço</label>
            <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Endereço" />
          </div>
        </div>
      </Card>
    </>
  )
}

export default CompanyForm
