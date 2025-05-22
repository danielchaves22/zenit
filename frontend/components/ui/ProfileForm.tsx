import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Input } from './Input'
import { Button } from './Button'
import axios from 'axios'

export type Company = {
  id: number
  name: string
  code: string
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

    if (formData.newRole !== user.role && isSelf) {
      setMessage('Você não pode alterar seu próprio tipo de acesso.')
      return
    }

    try {

        const payload: Partial<typeof formData> = { ...formData }

        if (!canEditRole) delete payload.newRole
        if (!canEditCompany) delete payload.companyId
        if (!payload.password) delete payload.password

        await axios.put(`/api/users/${user.id}`, payload)

        setMessage('Perfil atualizado com sucesso.')
    } catch (err: any) {
        const msg = err.response?.data?.error || 'Erro ao salvar perfil.'
        setMessage(msg)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        name="name"
        label="Nome"
        value={formData.name}
        onChange={handleChange}
      />
      <Input
        name="email"
        label="Email"
        type="email"
        value={formData.email}
        onChange={handleChange}
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
            className="w-full p-2 border rounded"
          >
            <option value="USER">Usuário</option>
            <option value="SUPERUSER">Superusuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
      )}

      {canEditCompany && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
          <select
            name="companyId"
            value={formData.companyId}
            onChange={handleChange}
            className="w-full p-2 border rounded"
          >
            {user.companies.map(c => (
              <option key={c.company.id} value={c.company.id}>
                {c.company.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button type="submit">Salvar</Button>

      {message && (
        <div className="mt-2 text-sm text-red-600">{message}</div>
      )}
    </form>
  )
}