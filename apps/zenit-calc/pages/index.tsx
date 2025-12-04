// frontend/pages/index.tsx - COM Navegação INTELIGENTE
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
// import { MainNavigation, QuickNavigation } from '@/components/ui/SmartNavigation';
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
        {/* âœ… CARD DE BOAS-VINDAS PERSONALIZADO */}
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

                {/* âœ… ACESSO RÃPIDO */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Acesso Rápido</h3>
                  </div>
                  {/* navegação rápida removida */}
                </div>
              </div>
            </div>
          </div>
        </Card>
        
      </div>
    </DashboardLayout>
  );
}


