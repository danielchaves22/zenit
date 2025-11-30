// frontend/pages/index.tsx - COM NAVEGAÇÃO INTELIGENTE
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { MainNavigation, QuickNavigation } from '@/components/ui/SmartNavigation';
import { DollarSign, Users, Building2, TrendingUp, Zap, Shield } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();
  const { getRoleLabel, currentRole, canManageUsers, canManageCompanies } = usePermissions();

  const getQuickStats = () => {
    const stats = [
      {
        label: 'Transações',
        value: '1,234',
        icon: <DollarSign size={20} />,
        color: 'text-green-400',
        bgColor: 'bg-green-900/20',
        available: true
      },
      {
        label: 'Usuários',
        value: '12',
        icon: <Users size={20} />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-900/20',
        available: canManageUsers()
      },
      {
        label: 'Empresas',
        value: '3',
        icon: <Building2 size={20} />,
        color: 'text-purple-400',
        bgColor: 'bg-purple-900/20',
        available: canManageCompanies()
      },
      {
        label: 'Crescimento',
        value: '+24%',
        icon: <TrendingUp size={20} />,
        color: 'text-accent',
        bgColor: 'bg-accent/20',
        available: true
      }
    ];

    return stats.filter(stat => stat.available);
  };

  return (
    <DashboardLayout title="Dashboard">
      <Breadcrumb items={[{ label: 'Início' }]} />

      <div className="space-y-8">
        {/* ✅ CARD DE BOAS-VINDAS PERSONALIZADO */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/10 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-accent rounded-lg">
                    <Zap size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-white">
                      Bem-vindo, {user?.name}
                    </h2>
                    <p className="text-accent font-medium">{getRoleLabel()}</p>
                  </div>
                </div>

                {/* ✅ ACESSO RÁPIDO */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Acesso Rápido</h3>
                  </div>
                  <QuickNavigation category="financeiro" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ✅ CARD DE AJUDA CONTEXTUAL */}
        <Card className="border-blue-600/30 bg-blue-900/10">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Shield size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-medium text-white mb-2">
                  Sistema de Permissões Ativo
                </h4>
                <p className="text-blue-200 mb-4">
                  Você está vendo apenas as funcionalidades disponíveis para seu perfil de usuário. 
                  {currentRole === 'USER' && ' Para acessar funcionalidades administrativas, entre em contato com um supervisor.'}
                  {currentRole === 'SUPERUSER' && ' Você pode gerenciar usuários e configurações da empresa.'}
                  {currentRole === 'ADMIN' && ' Você tem acesso completo a todas as funcionalidades do sistema.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                    Perfil: {getRoleLabel()}
                  </span>
                  <span className="px-3 py-1 bg-[#1e2126] text-blue-300 text-sm rounded-full border border-blue-600">
                    Funcionalidades: {(() => {
                      let count = 6; // Funcionalidades básicas do financeiro
                      if (canManageUsers()) count += 1;
                      if (canManageCompanies()) count += 1;
                      return count;
                    })()} disponíveis
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}