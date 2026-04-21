import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Zap } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();
  const { getRoleLabel } = usePermissions();

  return (
    <DashboardLayout title="Dashboard">
      <Breadcrumb items={[{ label: 'Dashboard' }]} />

      <div className="space-y-8">
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
                    <h2 className="text-2xl font-semibold text-white">Bem-vindo, {user?.name}</h2>
                    <p className="text-accent font-medium">{getRoleLabel()}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Acesso Rapido</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
