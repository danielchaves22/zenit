import React, { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'

export default function LandingPage() {
  const { token } = useAuth()
  const [showToken, setShowToken] = useState(false)


  return (
    <Layout>
      <h1 className="text-3xl font-heading font-semibold mb-2 text-center">
        Bem-vindo ao Zenit Core 👋
      </h1>
      <p className="mb-8 text-center text-gray-600">
        Escolha uma opção para continuar:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Link href="/financial">
          <Button variant="primary" className="w-full">💰 Financeiro</Button>
        </Link>
        <Link href="/companies">
          <Button variant="primary" className="w-full">🏢 Empresas</Button>
        </Link>
        <Link href="/users">
          <Button variant="accent" className="w-full">👤 Usuários</Button>
        </Link>
        <Link href="/profile">
          <Button variant="outline" className="w-full">⚙️ Meu Perfil</Button>
        </Link>
      </div>

      <div className="text-center">
        <Button
          variant="outline"
          onClick={() => setShowToken(!showToken)}
          className="mb-4"
        >
          {showToken ? 'Ocultar Token' : 'Mostrar Token'}
        </Button>

        {showToken && (
          <pre className="bg-white p-4 rounded-lg shadow-lg text-xs text-left overflow-x-auto max-w-full mx-auto">
            {token}
          </pre>
        )}
      </div>
    </Layout>
  );
}