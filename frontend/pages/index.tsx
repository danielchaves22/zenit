// frontend/pages/index.tsx
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { DollarSign, Users, Building2, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <DashboardLayout title="Dashboard">
      <Breadcrumb items={[{ label: 'Dashboard' }]} />

      <div className="max-w-5xl mx-auto">
        {/* Card de boas-vindas */}
        <Card className="mb-8 bg-[#151921] overflow-hidden">
          <div className="p-6">
            <h2 className="text-2xl font-semibold mb-4 text-white">
              Bem-vindo ao Zenit, {user?.name}! 👋
            </h2>
            <div className="space-y-2">
              <p className="text-gray-300">
                <span className="font-medium text-white">Email:</span> {user?.email}
              </p>
              <p className="text-gray-300">
                <span className="font-medium text-white">Empresa:</span> {user?.company?.name}
              </p>
              <p className="text-gray-300">
                <span className="font-medium text-white">Perfil:</span> 
                <span className="ml-2 px-2 py-1 bg-[#f59e0b] text-white text-xs rounded-full">
                  {user?.role}
                </span>
              </p>
            </div>
          </div>
        </Card>
        
        {/* Cards de acesso rápido */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/financial" className="block">
            <Card className="bg-[#151921] hover:bg-[#1a1f2b] transition-colors cursor-pointer">
              <div className="p-6 text-center">
                <div className="bg-[#f59e0b] rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <DollarSign className="text-white" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Financeiro</h3>
                <p className="text-gray-400 text-sm">Gestão financeira completa</p>
              </div>
            </Card>
          </Link>
          
          <Link href="/users" className="block">
            <Card className="bg-[#151921] hover:bg-[#1a1f2b] transition-colors cursor-pointer">
              <div className="p-6 text-center">
                <div className="bg-blue-600 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <Users className="text-white" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Usuários</h3>
                <p className="text-gray-400 text-sm">Gerenciar usuários do sistema</p>
              </div>
            </Card>
          </Link>
          
          <Link href="/companies" className="block">
            <Card className="bg-[#151921] hover:bg-[#1a1f2b] transition-colors cursor-pointer">
              <div className="p-6 text-center">
                <div className="bg-green-600 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <Building2 className="text-white" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Empresas</h3>
                <p className="text-gray-400 text-sm">Administrar empresas</p>
              </div>
            </Card>
          </Link>
          
          <Link href="/reports/cashflow" className="block">
            <Card className="bg-[#151921] hover:bg-[#1a1f2b] transition-colors cursor-pointer">
              <div className="p-6 text-center">
                <div className="bg-purple-600 rounded-full p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                  <TrendingUp className="text-white" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Relatórios</h3>
                <p className="text-gray-400 text-sm">Análises e relatórios</p>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}