import { useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import api from '@/lib/api'

export default function FirstAccessPage() {
  const { userId, updateMustChangePassword } = useAuth()
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('As senhas não coincidem')
      return
    }

    setLoading(true)
    try {
      await api.put(`/users/${userId}`, { password })
      updateMustChangePassword(false)
      router.replace('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e2126]">
      <Card className="w-full max-w-md" headerTitle="Defina sua nova senha">
        <form onSubmit={handleSubmit}>
          <Input
            id="password"
            label="Nova Senha"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Input
            id="confirm"
            label="Confirme a Senha"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
          />
          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
