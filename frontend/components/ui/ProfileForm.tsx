import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Input } from './Input'
import { Button } from './Button'
import api from '../../lib/api'

export type Company = {
  id: number
  name: string
  code: number
}

export type User = {
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'SUPERUSER' | 'USER'
  companies: {
    isDefault: boolean
    company: Company
  }[]
}

type Props = {
  user: User
}

export default function ProfileForm({ user }: Props) {
  const { userId: authId, userRole } = useAuth()

  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    password: '',
    newRole: user.role,
    companyId: user.companies.find(c => c.isDefault)?.company.id || 0
  })

  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSelf = user.id === Number(authId)

  const canEditRole = userRole === 'ADMIN' && !isSelf
  const canEditCompany = userRole === 'ADMIN'

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    if (formData.newRole !== user.role && isSelf) {
      setMessage('Você não pode alterar seu próprio tipo de acesso.')
      setLoading(false)
      return
    }

    try {
      const payload: Partial<typeof formData> = { ...formData }

      if (!canEditRole) delete payload.newRole
      if (!canEditCompany) delete payload.companyId
      if (!payload.password) delete payload.password

      await api.put(`/users/${user.id}`, payload)

      setMessage('Perfil atualizado com sucesso.')
      // Limpar senha após sucesso
      setFormData(prev => ({ ...prev, password: '' }))
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Erro ao salvar perfil.'
      setMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        name="name"
        label="Nome"
        value={formData.name}
        onChange={handleChange}
        required
      />
      <Input
        name="email"
        label="Email"
        type="email"
        value={formData.email}
        onChange={handleChange}
        required
      />
      <Input
        name="password"
        label="Nova senha"
        type="password"
        placeholder="Deixe em branco para manter"
        value={formData.password}
        onChange={handleChange}
      />

      {canEditRole && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Acesso</label>
          <select
            name="newRole"
            value={formData.newRole}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
          >
            <option value="USER">Usuário</option>
            <option value="SUPERUSER">Superusuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
      )}

      {canEditCompany && user.companies.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
          <select
            name="companyId"
            value={formData.companyId}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
          >
            {user.companies.map(c => (
              <option key={c.company.id} value={c.company.id}>
                {c.company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button 
        type="submit" 
        disabled={loading}
        className="w-full"
      >
        {loading ? 'Salvando...' : 'Salvar'}
      </Button>

      {message && (
        <div className={`mt-2 text-sm ${
          message.includes('sucesso') ? 'text-success' : 'text-danger'
        }`}>
          {message}
        </div>
      )}
    </form>
  )
}