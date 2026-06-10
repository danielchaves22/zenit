import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
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
import { HelpCircle, Landmark, Layers3, Wallet, Zap } from 'lucide-react';

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

  const [selectedHomeScreen, setSelectedHomeScreen] = useState<HomeScreenPreference>(
    readInitialHomeScreen
  );
  const [showBalances, setShowBalances] = useState<boolean>(readInitialBalancesVisibility);
  const [isHomeScreenInfoOpen, setIsHomeScreenInfoOpen] = useState(false);

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
      <div className="space-y-5">
        <Card className="relative overflow-hidden p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_40%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_32%)]" />
          <div className="relative p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                  <Layers3 size={14} />
                  Tela inicial
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-accent p-2.5 shadow-[var(--color-primary-shadow)]">
                    <Landmark size={20} className="text-white" />
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold text-white sm:text-[1.65rem]">
                      Bem-vindo, {user?.name}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-xl rounded-2xl border border-gray-700/80 bg-[#10151d]/95 p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Tipo de tela inicial
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHomeScreenInfoOpen(true)}
                    className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    Clique para saber mais
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {HOME_SCREEN_OPTIONS.map((option) => {
                    const isActive = option.value === selectedHomeScreen;

                    return (
                      <div
                        key={option.value}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-200 ${
                          isActive
                            ? 'border-accent bg-accent/10 shadow-[var(--color-primary-shadow)]'
                            : 'border-gray-700 bg-[#151b23] hover:border-accent/60 hover:bg-[#181f29]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleHomeScreenChange(option.value)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-pressed={isActive}
                        >
                          <span className={isActive ? 'text-accent' : 'text-gray-400'}>
                            {option.icon}
                          </span>
                          <span className="truncate text-sm font-semibold text-white">
                            {option.label}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsHomeScreenInfoOpen(true)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#1a2230] hover:text-accent"
                          title={option.description}
                          aria-label={`Mais detalhes sobre ${option.label}`}
                        >
                          <HelpCircle size={15} />
                        </button>
                      </div>
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
                <h3 className="text-base font-semibold text-white">Acesso Rapido</h3>
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

      <Modal
        isOpen={isHomeScreenInfoOpen}
        onClose={() => setIsHomeScreenInfoOpen(false)}
        title="Como funciona a tela inicial"
        footer={(
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsHomeScreenInfoOpen(false)}>
              Fechar
            </Button>
          </div>
        )}
      >
        <div className="space-y-4 text-sm leading-relaxed text-gray-300">
          <p>
            Escolha a experiencia inicial que faz mais sentido para seu fluxo. A ultima selecao
            fica salva e volta automaticamente no proximo acesso.
          </p>

          <div className="space-y-3">
            {HOME_SCREEN_OPTIONS.map((option) => (
              <div key={option.value} className="rounded-xl border border-gray-700 bg-[#11161f] p-3">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="text-accent">{option.icon}</span>
                  {option.label}
                </div>
                <p className="mt-1 text-sm text-gray-400">{option.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
