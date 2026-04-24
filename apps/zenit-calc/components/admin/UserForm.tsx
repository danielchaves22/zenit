import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastContext'
import { usePermissions } from '@/hooks/usePermissions'
import { Save, X } from 'lucide-react'
import api from '@/lib/api'
import { AppKey } from '@zenit/shared-users-core'

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

interface UserResponse {
  id: number
  name: string
  email: string
  role?: Role
  companies: UserCompany[]
  appGrants?: {
    companyId: number
    granted: boolean
    app: {
      appKey: 'ZENIT_CASH' | 'ZENIT_CALC' | 'ZENIT_ADMIN'
    }
  }[]
}

interface CompanyConfig {
  companyId: number
  role: Role
}

interface FormData {
  name: string
  email: string
  password: string
  newRole: Role
}

export interface UserFormProps {
  mode: 'create' | 'edit'
  userId?: string | number
}

function normalizeRole(value: string | null | undefined): Role {
  if (value === 'ADMIN' || value === 'SUPERUSER' || value === 'USER') {
    return value
  }
  return 'USER'
}

function fromBackendAppKey(value: 'ZENIT_CASH' | 'ZENIT_CALC' | 'ZENIT_ADMIN'): AppKey {
  if (value === 'ZENIT_CASH') return 'zenit-cash'
  if (value === 'ZENIT_CALC') return 'zenit-calc'
  return 'zenit-admin'
}

const APP_KEY = (process.env.NEXT_PUBLIC_APP_KEY || 'zenit-calc') as AppKey
const APP_LABELS: Record<AppKey, string> = {
  'zenit-cash': 'Zenit Cash',
  'zenit-calc': 'Zenit Calc',
  'zenit-admin': 'Zenit Admin'
}

export function UserForm({ mode, userId }: UserFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const { userRole } = useAuth()
  const { isAdmin } = usePermissions()

  const isEdit = mode === 'edit'
  const currentRole = normalizeRole(userRole)

  const allowedRoles = useMemo<Role[]>(() => {
    if (currentRole === 'ADMIN') return ['ADMIN', 'SUPERUSER', 'USER']
    if (currentRole === 'SUPERUSER') return ['SUPERUSER', 'USER']
    return ['USER']
  }, [currentRole])

  const defaultRole = useMemo<Role>(() => {
    return currentRole === 'ADMIN' ? 'SUPERUSER' : 'USER'
  }, [currentRole])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    newRole: defaultRole
  })
  const [companyConfigs, setCompanyConfigs] = useState<CompanyConfig[]>([])
  const [companyEntitlements, setCompanyEntitlements] = useState<Record<number, AppKey[]>>({})
  const [appGrantsByCompany, setAppGrantsByCompany] = useState<Record<number, AppKey[]>>({})

  const loadData = useCallback(async () => {
    if (isEdit && (userId === undefined || userId === null)) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEdit) {
        const parsedId = Number(userId)
        if (Number.isNaN(parsedId)) {
          setError('ID de usuario invalido.')
          return
        }

        const [companiesResponse, userResponse] = await Promise.all([
          api.get('/companies'),
          api.get(`/users/${parsedId}`)
        ])

        const companyList = Array.isArray(companiesResponse.data) ? companiesResponse.data : []
        const user = userResponse.data as UserResponse
        const userCompanies = Array.isArray(user.companies) ? user.companies : []
        const entitlementEntries = await Promise.all(
          companyList.map(async company => {
            const entitlementResponse = await api.get(`/app-access/company/${company.id}/entitlements`)
            const enabledApps = (entitlementResponse.data || [])
              .filter((item: { appKey: AppKey; enabled: boolean }) => item.enabled)
              .map((item: { appKey: AppKey }) => item.appKey as AppKey)
            return [company.id, enabledApps] as const
          })
        )
        setCompanyEntitlements(
          entitlementEntries.reduce<Record<number, AppKey[]>>((acc, [id, apps]) => {
            acc[id] = apps
            return acc
          }, {})
        )

        setCompanies(companyList)
        setFormData({
          name: user.name || '',
          email: user.email || '',
          password: '',
          newRole: normalizeRole(user.role || userCompanies[0]?.role || defaultRole)
        })
        setCompanyConfigs(
          userCompanies
            .filter(({ company }) => company && typeof company.id === 'number')
            .map(({ company, role }) => ({
              companyId: company.id,
              role: normalizeRole(role)
            }))
        )
        setAppGrantsByCompany(
          (user.appGrants || []).reduce<Record<number, AppKey[]>>((acc, grant) => {
            if (!grant.granted) return acc
            if (!acc[grant.companyId]) acc[grant.companyId] = []
            acc[grant.companyId].push(fromBackendAppKey(grant.app.appKey))
            return acc
          }, {})
        )
        return
      }

      const companiesResponse = await api.get('/companies')
      const companyList = Array.isArray(companiesResponse.data) ? companiesResponse.data : []
      const entitlementEntries = await Promise.all(
        companyList.map(async company => {
          const entitlementResponse = await api.get(`/app-access/company/${company.id}/entitlements`)
          const enabledApps = (entitlementResponse.data || [])
            .filter((item: { appKey: AppKey; enabled: boolean }) => item.enabled)
            .map((item: { appKey: AppKey }) => item.appKey as AppKey)
          return [company.id, enabledApps] as const
        })
      )

      setCompanies(companyList)
      setCompanyEntitlements(
        entitlementEntries.reduce<Record<number, AppKey[]>>((acc, [id, apps]) => {
          acc[id] = apps
          return acc
        }, {})
      )
      setFormData({
        name: '',
        email: '',
        password: '',
        newRole: defaultRole
      })
      setCompanyConfigs([])
      setAppGrantsByCompany({})
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar dados do formulario de usuario')
    } finally {
      setLoading(false)
    }
  }, [defaultRole, isEdit, userId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function handleCancel() {
    router.push('/admin/users')
  }

  function toggleCompany(companyId: number) {
    setCompanyConfigs(prev => {
      const exists = prev.some(config => config.companyId === companyId)
      if (exists) {
        setAppGrantsByCompany(current => {
          const next = { ...current }
          delete next[companyId]
          return next
        })
        return prev.filter(config => config.companyId !== companyId)
      }

      const fallbackRole = allowedRoles[allowedRoles.length - 1] || 'USER'
      const enabledApps = companyEntitlements[companyId] || []
      const defaultApps = enabledApps.includes(APP_KEY)
        ? [APP_KEY]
        : enabledApps.length > 0
          ? [enabledApps[0]]
          : []
      setAppGrantsByCompany(current => ({
        ...current,
        [companyId]: defaultApps
      }))
      return [...prev, { companyId, role: fallbackRole }]
    })
  }

  function updateCompanyRole(companyId: number, role: Role) {
    setCompanyConfigs(prev =>
      prev.map(config => (config.companyId === companyId ? { ...config, role } : config))
    )
  }

  function toggleAppGrant(companyId: number, appKey: AppKey) {
    setAppGrantsByCompany(prev => {
      const current = prev[companyId] || []
      const hasKey = current.includes(appKey)
      return {
        ...prev,
        [companyId]: hasKey
          ? current.filter(item => item !== appKey)
          : [...current, appKey]
      }
    })
  }

  function buildAppGrantsPayload() {
    return companyConfigs.flatMap(config => {
      const companyId = config.companyId
      const enabledApps = companyEntitlements[companyId] || []
      const selectedApps = new Set(appGrantsByCompany[companyId] || [])
      return enabledApps.map(appKey => ({
        companyId,
        appKey,
        granted: selectedApps.has(appKey)
      }))
    })
  }

  async function handleSubmit() {
    if (!formData.name.trim() || !formData.email.trim()) {
      addToast('Nome e email sao obrigatorios', 'error')
      return
    }

    if (!isEdit && !formData.password) {
      addToast('Senha e obrigatoria para novos usuarios', 'error')
      return
    }

    if (isAdmin() && companyConfigs.length === 0) {
      addToast('Selecione ao menos uma empresa', 'error')
      return
    }

    try {
      setFormLoading(true)

      const payload: {
        name: string
        email: string
        newRole: Role
        companies: CompanyConfig[]
        appGrants: Array<{ companyId: number; appKey: AppKey; granted: boolean }>
        password?: string
      } = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        newRole: formData.newRole,
        companies: companyConfigs,
        appGrants: buildAppGrantsPayload()
      }

      if (formData.password) {
        payload.password = formData.password
      }

      if (isEdit) {
        const parsedId = Number(userId)
        await api.put(`/users/${parsedId}`, payload)
        addToast('Usuario atualizado com sucesso', 'success')
      } else {
        await api.post('/users', payload)
        addToast('Usuario criado com sucesso', 'success')
      }

      router.push('/admin/users')
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar usuario', 'error')
    } finally {
      setFormLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded bg-elevated" />
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
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => void loadData()}>
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Voltar
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">
          {isEdit ? 'Editar usuario' : 'Novo usuario'}
        </h1>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={formLoading}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            variant="accent"
            onClick={() => void handleSubmit()}
            disabled={formLoading}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {formLoading ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Criar usuario'}
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Nome</label>
            <Input
              value={formData.name}
              onChange={event => setFormData({ ...formData, name: event.target.value })}
              placeholder="Nome"
              autoFocus={!isEdit}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <Input
              type="email"
              value={formData.email}
              onChange={event => setFormData({ ...formData, email: event.target.value })}
              placeholder="email@dominio.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              {isEdit ? 'Nova senha (opcional)' : 'Senha'}
            </label>
            <Input
              type="password"
              value={formData.password}
              onChange={event => setFormData({ ...formData, password: event.target.value })}
              placeholder={isEdit ? 'Deixe em branco para manter' : 'Senha'}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Papel (global)</label>
            <select
              value={formData.newRole}
              onChange={event =>
                setFormData({ ...formData, newRole: normalizeRole(event.target.value) })
              }
              className="px-2 py-2 bg-background border border-soft text-base-color rounded w-full focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {allowedRoles.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm text-muted mb-2">Empresas</label>

          {companies.length === 0 ? (
            <div className="text-sm text-red-400">
              Nenhuma empresa disponivel para vincular.
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map(company => {
                const config = companyConfigs.find(item => item.companyId === company.id)
                const checked = Boolean(config)

                return (
                  <div key={company.id} className="border border-soft rounded p-3 space-y-3">
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-accent bg-background border-soft rounded focus:ring-accent"
                          checked={checked}
                          onChange={() => toggleCompany(company.id)}
                        />
                        <span className="text-base-color">{company.name}</span>
                      </label>

                      {checked && (
                        <select
                          value={config?.role || 'USER'}
                          onChange={event =>
                            updateCompanyRole(company.id, normalizeRole(event.target.value))
                          }
                          className="px-2 py-1 bg-background border border-soft text-base-color rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                        >
                          {allowedRoles.map(role => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {checked && (
                      <div>
                        <label className="block text-sm text-muted mb-2">Aplicativos do ecossistema</label>
                        <div className="flex flex-wrap gap-3">
                          {(companyEntitlements[company.id] || []).map(appKey => (
                            <label key={appKey} className="inline-flex items-center gap-2 text-sm text-base-color">
                              <input
                                type="checkbox"
                                className="w-4 h-4 text-accent bg-background border-soft rounded focus:ring-accent"
                                checked={(appGrantsByCompany[company.id] || []).includes(appKey)}
                                onChange={() => toggleAppGrant(company.id, appKey)}
                              />
                              {APP_LABELS[appKey]}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </>
  )
}

export default UserForm
