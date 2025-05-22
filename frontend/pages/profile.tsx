import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ProfileForm from '../components/ui/ProfileForm'
import api from '../lib/api'
import { Layout } from '../components/ui/Layout'
import type { User } from '../components/ui/ProfileForm'

export default function ProfilePage() {
  const { userId, token } = useAuth()
  const [user, setUser]     = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token || userId === null) return

    api
      .get<User>(`/users/${userId}`)
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [token, userId])

  if (!token) return <div>Carregando autenticação…</div>
  if (loading) return <Layout><div>Carregando perfil…</div></Layout>
  if (!user)   return <Layout><div>Erro ao carregar seu perfil.</div></Layout>

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Meu Perfil</h1>
        <ProfileForm user={user} />
      </div>
    </Layout>
  )
}