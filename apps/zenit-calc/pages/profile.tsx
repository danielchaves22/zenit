// frontend/pages/profile.tsx
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { useToast } from '@/components/ui/ToastContext'

export default function ProfilePage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
  })
  
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
    </DashboardLayout>
  )
}