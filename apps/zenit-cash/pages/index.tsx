import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { QuickNavigation } from '@/components/ui/SmartNavigation';
import FinancialHomeOverview from '@/components/home/FinancialHomeOverview';
import api from '@/lib/api';
import {
  HomeScreenPreference,
  readStoredHomeBalancesVisibility,
  readStoredHomeScreenPreference,
  storeHomeBalancesVisibility,
  storeHomeScreenPreference
} from '@/lib/auth-storage';
import { Landmark, Layers3, Wallet, Zap } from 'lucide-react';

const HOME_SCREEN_OPTIONS: Array<{
  description: string;
  icon: React.ReactNode;
  label: string;
  value: HomeScreenPreference;
}> = [
  {
    value: 'quick-access',
    label: 'Acesso Rapido',
    description: 'Atalhos diretos para as acoes mais usadas.',
    icon: <Zap size={16} />
  },
  {
    value: 'accounts-overview',
    label: 'Resumo de Contas e Cartoes',
    description: 'Saldo, cartoes, fixas e leitura rapida do financeiro.',
    icon: <Wallet size={16} />
  }
];

function readInitialHomeScreen(): HomeScreenPreference {
  if (typeof window === 'undefined') {
    return 'quick-access';
  }

  return readStoredHomeScreenPreference() || 'quick-access';
}

function readInitialBalancesVisibility(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return readStoredHomeBalancesVisibility();
}

export default function HomePage() {
  const { user } = useAuth();
  const { getRoleLabel } = usePermissions();

  const [selectedHomeScreen, setSelectedHomeScreen] = useState<HomeScreenPreference>(
    readInitialHomeScreen
  );
  const [showBalances, setShowBalances] = useState<boolean>(readInitialBalancesVisibility);

  function handleHomeScreenChange(nextScreen: HomeScreenPreference) {
    setSelectedHomeScreen(nextScreen);
    storeHomeScreenPreference(nextScreen);
    void api.put('/preferences/home-screen', { homeScreen: nextScreen }).catch(() => {});
  }

  function handleBalanceVisibilityToggle() {
    setShowBalances((currentValue) => {
      const nextValue = !currentValue;
      storeHomeBalancesVisibility(nextValue);
      void api.put('/preferences/home-balances', { showHomeBalances: nextValue }).catch(() => {});
      return nextValue;
    });
  }

  return (
    <DashboardLayout title="Dashboard">
      <Breadcrumb items={[{ label: 'Inicio' }]} />

      <div className="space-y-6">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_32%)]" />
          <div className="relative">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                  <Layers3 size={14} />
                  Tela inicial
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-accent p-3 shadow-[var(--color-primary-shadow)]">
                    <Landmark size={24} className="text-white" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-semibold text-white">
                      Bem-vindo, {user?.name}
                    </h2>
                    <p className="mt-1 font-medium text-accent">{getRoleLabel()}</p>
                    <p className="mt-3 max-w-2xl text-sm text-gray-400">
                      Escolha a experiencia inicial que faz mais sentido para seu fluxo. A ultima
                      selecao fica salva e volta automaticamente no proximo acesso.
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-xl rounded-2xl border border-gray-700/80 bg-[#10151d]/95 p-3">
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Tipo de tela inicial
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {HOME_SCREEN_OPTIONS.map((option) => {
                    const isActive = option.value === selectedHomeScreen;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleHomeScreenChange(option.value)}
                        className={`rounded-xl border p-4 text-left transition-all duration-200 ${
                          isActive
                            ? 'border-accent bg-accent/10 shadow-[var(--color-primary-shadow)]'
                            : 'border-gray-700 bg-[#151b23] hover:border-accent/60 hover:bg-[#181f29]'
                        }`}
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <span className={isActive ? 'text-accent' : 'text-gray-400'}>
                            {option.icon}
                          </span>
                          {option.label}
                        </div>
                        <div className="mt-2 text-sm text-gray-400">{option.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {selectedHomeScreen === 'quick-access' ? (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Acesso Rapido</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Entradas diretas para cadastro, consulta e rotina operacional.
                </p>
              </div>
            </div>

            <QuickNavigation category="financeiro" />
          </Card>
        ) : (
          <FinancialHomeOverview
            showBalances={showBalances}
            onToggleBalances={handleBalanceVisibilityToggle}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
