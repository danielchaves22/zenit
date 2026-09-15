import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { AvailabilityPlan } from '@/components/financial/budgets/AvailabilityPlan';
import { BudgetOverview } from '@/components/financial/budgets/BudgetOverview';
import {
  BudgetSectionTabs,
  BudgetSectionView
} from '@/components/financial/budgets/BudgetSectionTabs';
import { MonthlyCategoryPlanning } from '@/components/financial/budgets/MonthlyCategoryPlanning';
import { FinancialProvisions } from '@/components/financial/budgets/FinancialProvisions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { InfoModalButton } from '@/components/ui/InfoModalButton';

function getCurrentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeView(value: string | string[] | undefined): BudgetSectionView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'availability' || candidate === 'monthly' || candidate === 'provisions'
    ? candidate
    : 'overview';
}

function normalizeMonth(value: string | string[] | undefined, currentMonth: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d{4}-\d{2}$/.test(candidate)) return currentMonth;

  const numericMonth = Number(candidate.slice(5));
  if (numericMonth < 1 || numericMonth > 12 || candidate < currentMonth) return currentMonth;
  return candidate;
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, 1, 12, 0, 0, 0));

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function BudgetsPageInner() {
  const router = useRouter();
  const currentMonth = getCurrentMonthKey();
  const maximumMonth = addMonths(currentMonth, 24);
  const view = normalizeView(router.query.view);
  const month = normalizeMonth(router.query.month, currentMonth);

  useEffect(() => {
    if (!router.isReady) return;

    const rawView = Array.isArray(router.query.view) ? router.query.view[0] : router.query.view;
    const rawMonth = Array.isArray(router.query.month) ? router.query.month[0] : router.query.month;
    if (rawView === view && rawMonth === month) return;

    void router.replace(
      {
        pathname: '/financial/budgets',
        query: { view, month }
      },
      undefined,
      { shallow: true }
    );
  }, [month, router, view]);

  function changeMonth(nextMonth: string) {
    void router.push(
      {
        pathname: '/financial/budgets',
        query: { view, month: nextMonth }
      },
      undefined,
      { shallow: true }
    );
  }

  return (
    <DashboardLayout title="Orçamento">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Financeiro' },
          { label: 'Orçamento' }
        ]}
      />

      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-white">Orçamento</h1>
        <InfoModalButton modalTitle="Sobre o Orçamento" buttonLabel="Ajuda sobre o Orçamento">
          <p>
            O Orçamento reúne três controles complementares para transformar sua movimentação
            financeira em decisões.
          </p>
          <p>
            <strong className="text-white">Plano de Disponibilidade:</strong> mostra quanto pode ser
            utilizado preservando a meta de saldo.
          </p>
          <p>
            <strong className="text-white">Planejamento Mensal:</strong> organiza onde você pretende
            usar esse dinheiro por categoria.
          </p>
          <p>
            <strong className="text-white">Provisões:</strong> prepara gradualmente recursos para
            despesas futuras previsíveis.
          </p>
          <p>
            Os limites mensais não alteram o saldo do Plano de Disponibilidade nem criam lançamentos.
            Eles representam uma intenção comparada aos gastos existentes.
          </p>
        </InfoModalButton>
      </div>

      <BudgetSectionTabs activeView={view} month={month} />

      {view !== 'availability' && view !== 'provisions' && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-gray-700 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <CalendarDays size={18} className="text-accent" />
            Mês de referência
          </div>
          <span className="text-sm font-semibold text-white">{formatMonthLabel(month)}</span>
          <div className="ml-1 flex items-center gap-2">
            <Button
              variant="outline"
              aria-label="Mês anterior"
              disabled={month === currentMonth}
              onClick={() => changeMonth(addMonths(month, -1))}
              className="px-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </Button>
            <Button
              variant="outline"
              aria-label="Próximo mês"
              disabled={month === maximumMonth}
              onClick={() => changeMonth(addMonths(month, 1))}
              className="px-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      )}

      {view === 'overview' && <BudgetOverview month={month} />}
      {view === 'availability' && <AvailabilityPlan />}
      {view === 'monthly' && (
        <MonthlyCategoryPlanning month={month} onMonthChange={changeMonth} />
      )}
      {view === 'provisions' && <FinancialProvisions />}
    </DashboardLayout>
  );
}

export default function BudgetsPage() {
  return (
    <PageGuard requiredRole="USER">
      <BudgetsPageInner />
    </PageGuard>
  );
}
