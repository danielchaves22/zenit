import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastContext'
import { Save, X, KeyRound, FlaskConical } from 'lucide-react'
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

interface AdminOpenAiStatusResponse {
  configured: boolean
  credential: {
    id: number
    provider: 'OPENAI'
    model: string
    promptVersion: string
    isActive: boolean
    updatedAt: string
    createdAt: string
  } | null
}

export function CompanyForm({ mode, companyId }: CompanyFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const isEdit = mode === 'edit'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({ name: '', legalName: '', address: '' })

  const [loadingOpenAi, setLoadingOpenAi] = useState(false)
  const [savingOpenAi, setSavingOpenAi] = useState(false)
  const [testingOpenAi, setTestingOpenAi] = useState(false)

  const [openAiStatus, setOpenAiStatus] = useState<AdminOpenAiStatusResponse | null>(null)
  const [openAiApiKey, setOpenAiApiKey] = useState('')
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-mini')
  const [openAiPromptVersion, setOpenAiPromptVersion] = useState('v1')
  const [openAiEnabled, setOpenAiEnabled] = useState(true)

  useEffect(() => {
    if (isEdit && (companyId === undefined || companyId === null)) return

    const load = async () => {
      setLoading(true)
      setError(null)

      if (isEdit) {
        const parsedCompanyId = parseCompanyId()

        if (!parsedCompanyId) {
          setError('ID de empresa invalido.')
          resetOpenAiState()
          setLoading(false)
          return
        }

        const loadedCompany = await fetchCompany(parsedCompanyId)
        if (loadedCompany) {
          await loadOpenAiConfig(parsedCompanyId)
        } else {
          resetOpenAiState()
        }
      } else {
        setFormData({ name: '', legalName: '', address: '' })
        resetOpenAiState()
      }

      setLoading(false)
    }

    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, companyId])

  function parseCompanyId(): number | null {
    const parsed = Number(companyId)
    if (!Number.isInteger(parsed) || parsed <= 0) return null
    return parsed
  }

  function resetOpenAiState() {
    setOpenAiStatus(null)
    setOpenAiApiKey('')
    setOpenAiModel('gpt-4o-mini')
    setOpenAiPromptVersion('v1')
    setOpenAiEnabled(true)
  }

  async function fetchCompany(id: number): Promise<boolean> {
    try {
      const response = await api.get('/companies')
      const list: Company[] = response.data || []
      const found = list.find(c => c.id === id)

      if (!found) {
        setError('Empresa nao encontrada.')
        return false
      }

      setFormData({ name: found.name, legalName: found.legalName || '', address: found.address || '' })
      return true
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar empresa'
      setError(errorMsg)
      return false
    }
  }

  async function loadOpenAiConfig(id: number) {
    setLoadingOpenAi(true)
    try {
      const response = await api.get<AdminOpenAiStatusResponse>(`/admin/companies/${id}/openai`)
      const data = response.data

      setOpenAiStatus(data)

      if (data.credential) {
        setOpenAiModel(data.credential.model || 'gpt-4o-mini')
        setOpenAiPromptVersion(data.credential.promptVersion || 'v1')
        setOpenAiEnabled(data.credential.isActive)
      } else {
        setOpenAiModel('gpt-4o-mini')
        setOpenAiPromptVersion('v1')
        setOpenAiEnabled(true)
      }

      setOpenAiApiKey('')
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao carregar configuracao OpenAI da empresa.', 'error')
      resetOpenAiState()
    } finally {
      setLoadingOpenAi(false)
    }
  }

  function handleCancel() {
    router.push('/admin/companies')
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da empresa e obrigatorio', 'error')
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

  async function saveOpenAiConfig() {
    const parsedCompanyId = parseCompanyId()
    if (!isEdit || !parsedCompanyId) return

    if (!openAiApiKey.trim() && !openAiStatus?.configured) {
      addToast('Informe a chave OpenAI para salvar a primeira configuracao.', 'error')
      return
    }

    try {
      setSavingOpenAi(true)
      await api.put(`/admin/companies/${parsedCompanyId}/openai`, {
        apiKey: openAiApiKey.trim() || undefined,
        model: openAiModel,
        promptVersion: openAiPromptVersion,
        isActive: openAiEnabled
      })

      setOpenAiApiKey('')
      addToast('Configuracao OpenAI da empresa salva com sucesso.', 'success')
      await loadOpenAiConfig(parsedCompanyId)
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar configuracao OpenAI.', 'error')
    } finally {
      setSavingOpenAi(false)
    }
  }

  async function testOpenAiConfig() {
    const parsedCompanyId = parseCompanyId()
    if (!isEdit || !parsedCompanyId) return

    try {
      setTestingOpenAi(true)
      const response = await api.post(`/admin/companies/${parsedCompanyId}/openai/test`, {
        apiKey: openAiApiKey.trim() || undefined,
        model: openAiModel
      })

      if (response.data?.ok) {
        addToast('Teste OpenAI executado com sucesso.', 'success')
      } else {
        addToast(response.data?.error || 'Falha no teste OpenAI.', 'error')
      }
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Falha no teste OpenAI.', 'error')
    } finally {
      setTestingOpenAi(false)
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
            {formLoading ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Criar empresa'}
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
            <label className="block text-sm text-gray-300 mb-1">Razao social</label>
            <Input value={formData.legalName} onChange={e => setFormData({ ...formData, legalName: e.target.value })} placeholder="Razao social" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Endereco</label>
            <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Endereco" />
          </div>
        </div>

        {isEdit && (
          <div className="pt-6 mt-2 border-t border-soft">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={16} className="text-accent" />
              <h4 className="text-base font-medium text-white">Configuracoes Internas (Plataforma)</h4>
            </div>

            {loadingOpenAi ? (
              <div className="text-sm text-gray-300">Carregando configuracao OpenAI...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input
                    label="Chave API OpenAI"
                    type="password"
                    placeholder={openAiStatus?.configured ? '******** (manter atual se vazio)' : 'sk-...'}
                    value={openAiApiKey}
                    onChange={(event) => setOpenAiApiKey(event.target.value)}
                    disabled={savingOpenAi || testingOpenAi || formLoading}
                  />

                  <Input
                    label="Modelo"
                    value={openAiModel}
                    onChange={(event) => setOpenAiModel(event.target.value)}
                    placeholder="gpt-4o-mini"
                    disabled={savingOpenAi || testingOpenAi || formLoading}
                  />

                  <Input
                    label="Versao do Prompt"
                    value={openAiPromptVersion}
                    onChange={(event) => setOpenAiPromptVersion(event.target.value)}
                    placeholder="v1"
                    disabled={savingOpenAi || testingOpenAi || formLoading}
                  />

                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Ativa</label>
                    <select
                      value={openAiEnabled ? 'true' : 'false'}
                      onChange={(event) => setOpenAiEnabled(event.target.value === 'true')}
                      className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color"
                      disabled={savingOpenAi || testingOpenAi || formLoading}
                    >
                      <option value="true">Sim</option>
                      <option value="false">Nao</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Button
                    type="button"
                    variant="accent"
                    onClick={saveOpenAiConfig}
                    disabled={savingOpenAi || testingOpenAi || formLoading}
                    className="flex items-center gap-2"
                  >
                    <Save size={16} />
                    {savingOpenAi ? 'Salvando OpenAI...' : 'Salvar OpenAI'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={testOpenAiConfig}
                    disabled={testingOpenAi || savingOpenAi || formLoading}
                    className="flex items-center gap-2"
                  >
                    <FlaskConical size={16} />
                    {testingOpenAi ? 'Testando...' : 'Testar Credencial'}
                  </Button>
                </div>

                <div className="text-sm text-gray-400">
                  Status: {openAiStatus?.configured ? 'Configurada' : 'Nao configurada'}
                  {openAiStatus?.credential
                    ? ` | Atualizada em ${new Date(openAiStatus.credential.updatedAt).toLocaleString('pt-BR')}`
                    : ''}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

export default CompanyForm
