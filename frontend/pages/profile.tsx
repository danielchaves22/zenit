// frontend/pages/profile.tsx
import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { useToast } from '@/components/ui/ToastContext'
import { getApiErrorMessage } from '@/utils/errors'

export default function ProfilePage() {
  const { user, preferences, updatePreferences } = useAuth()
  const { addToast } = useToast()

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
  })

  const [loading, setLoading] = useState(false)
  const [confirmNegative, setConfirmNegative] = useState(preferences.confirmNegativeBalanceMovements)
  const [preferencesLoading, setPreferencesLoading] = useState(false)

  useEffect(() => {
    setConfirmNegative(preferences.confirmNegativeBalanceMovements)
  }, [preferences.confirmNegativeBalanceMovements])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Simular atualização
      await new Promise(resolve => setTimeout(resolve, 1000))
      addToast('Perfil atualizado com sucesso!', 'success')
      setFormData(prev => ({ ...prev, password: '' }))
    } catch (error) {
      addToast('Erro ao atualizar perfil', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleNegativeConfirmation = async (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked
    setConfirmNegative(checked)
    setPreferencesLoading(true)

    try {
      await updatePreferences({ confirmNegativeBalanceMovements: checked })
      addToast(
        checked
          ? 'Confirmação para movimentações sem saldo ativada.'
          : 'Confirmação para movimentações sem saldo desativada.',
        'success'
      )
    } catch (error) {
      addToast(getApiErrorMessage(error, 'Não foi possível atualizar a preferência.'), 'error')
      setConfirmNegative(preferences.confirmNegativeBalanceMovements)
    } finally {
      setPreferencesLoading(false)
    }
  }

  return (
    <DashboardLayout title="Meu Perfil">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Meu Perfil' }
      ]} />
      
      <div className="max-w-2xl mx-auto">
        <Card headerTitle="Informações do Perfil" headerSubtitle="Atualize suas informações pessoais">
          <form onSubmit={handleSubmit}>
            <Input
              label="Nome"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
            
            <Input
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
            
            <Input
              label="Nova Senha"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Deixe em branco para manter a atual"
            />
            
            <Button 
              type="submit" 
              variant="accent"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </form>
        </Card>
      </div>

      <div className="max-w-2xl mx-auto mt-8">
        <Card
          headerTitle="Preferências Financeiras"
          headerSubtitle="Configure como o sistema deve lidar com movimentações que deixam a conta negativa"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">
                Solicitar confirmação para movimentação sem saldo na conta
              </h3>
              <p className="mt-1 text-sm text-gray-300">
                Ative para receber um aviso antes de registrar despesas que façam a conta ficar negativa quando o saldo negativo é permitido.
              </p>
            </div>

            <label className="inline-flex cursor-pointer select-none items-center">
              <input
                type="checkbox"
                className="sr-only"
                checked={confirmNegative}
                onChange={handleToggleNegativeConfirmation}
                disabled={preferencesLoading}
              />
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  confirmNegative ? 'bg-accent' : 'bg-gray-600'
                } ${preferencesLoading ? 'opacity-60' : ''}`}
              >
                <span
                  className={`absolute left-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    confirmNegative ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
              <span className="ml-3 text-sm text-gray-200">
                {confirmNegative ? 'Sim' : 'Não'}
              </span>
            </label>
          </div>

          {preferencesLoading && (
            <p className="mt-3 text-sm text-gray-400">Salvando preferência...</p>
          )}
        </Card>
      </div>
    </DashboardLayout>
  )
}