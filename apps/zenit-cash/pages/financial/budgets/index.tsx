import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, PiggyBank, Star, Wallet } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  Budget,
  BudgetKind,
  BudgetListResponse,
  BudgetStatus,
  fetchBudgets,
  formatBusinessDate,
  formatCurrencyFromCents,
  getBudgetKindLabel,
  getBudgetStatusLabel,
  getPrimaryBudget
} from '@/utils/budgets';

function kindBadgeClass(kind: BudgetKind): string {
  return kind === 'SPENDING'
    ? 'bg-blue-900/50 text-blue-200 border border-blue-700'
    : 'bg-emerald-900/50 text-emerald-200 border border-emerald-700';
}

function statusBadgeClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    ACTIVE: 'bg-green-900 text-green-300',
    ARCHIVED: 'bg-slate-700 text-slate-200',
    EXPIRED: 'bg-amber-900 text-amber-300',
    DELETED: 'bg-red-900 text-red-300'
  };

  return map[status] || 'bg-slate-700 text-slate-200';
}

function BudgetsPageInner() {
  const { addToast } = useToast();
  const [payload, setPayload] = useState<BudgetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'ALL' | BudgetKind>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BudgetStatus>('ALL');
  const [onlyPrimary, setOnlyPrimary] = useState(false);

  useEffect(() => {
    void loadBudgets();
  }, []);

  async function loadBudgets() {
    setLoading(true);

    try {
      const nextPayload = await fetchBudgets();
      setPayload(nextPayload);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar orçamentos', 'error');
    } finally {
      setLoading(false);
    }
  }

  const budgets = payload?.budgets || [];
  const timeZone = payload?.timeZone || 'UTC';
  const businessDate = payload?.businessDate || new Date().toISOString();

  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      if (kindFilter !== 'ALL' && budget.kind !== kindFilter) return false;
      if (statusFilter !== 'ALL' && budget.status !== statusFilter) return false;
      if (onlyPrimary && !budget.isPrimary) return false;
      return true;
    });
  }, [budgets, kindFilter, statusFilter, onlyPrimary]);

  const primaryBudget = useMemo(() => getPrimaryBudget(budgets), [budgets]);
  const activeBudgets = useMemo(
    () => budgets.filter((budget) => budget.status === 'ACTIVE'),
    [budgets]
  );

  return (
    <DashboardLayout title="Orçamentos">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Financeiro' },
          { label: 'Orçamentos' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Orçamentos</h1>
          <p className="mt-1 text-sm text-gray-400">
            Visão dos orçamentos sincronizados nesta empresa. Data de negócio:{' '}
            {formatBusinessDate(businessDate, timeZone)}
          </p>
        </div>

        <Button variant="outline" onClick={() => void loadBudgets()}>
          Atualizar
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-400">Total de orçamentos</p>
              <p className="mt-2 text-3xl font-bold text-white">{budgets.length}</p>
            </div>
            <Wallet className="text-accent" size={22} />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-400">Ativos</p>
              <p className="mt-2 text-3xl font-bold text-white">{activeBudgets.length}</p>
            </div>
            <CalendarDays className="text-accent" size={22} />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-400">Orçamento principal</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {primaryBudget?.code || 'Nenhum definido'}
              </p>
              {primaryBudget && (
                <p className="mt-1 text-sm text-gray-400">
                  Hoje: {formatCurrencyFromCents(primaryBudget.dailyBudgetCurrentCents)}
                </p>
              )}
            </div>
            <Star className="text-yellow-400" size={22} />
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Tipo</label>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as 'ALL' | BudgetKind)}
              className="w-full rounded border border-gray-700 bg-[#1e2126] px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring"
            >
              <option value="ALL">Todos</option>
              <option value="SPENDING">Gasto</option>
              <option value="SAVINGS">Economia</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'ALL' | BudgetStatus)}
              className="w-full rounded border border-gray-700 bg-[#1e2126] px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="ARCHIVED">Arquivados</option>
              <option value="EXPIRED">Expirados</option>
              <option value="DELETED">Excluídos</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded border border-gray-700 px-3 py-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={onlyPrimary}
                onChange={(event) => setOnlyPrimary(event.target.checked)}
                className="rounded border-gray-600 bg-[#1e2126]"
              />
              Apenas principal
            </label>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setKindFilter('ALL');
                setStatusFilter('ALL');
                setOnlyPrimary(false);
              }}
              className="w-full"
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : budgets.length === 0 ? (
          <div className="py-12 text-center">
            <PiggyBank size={42} className="mx-auto mb-3 text-gray-500" />
          <p className="mb-2 text-gray-300">Nenhum orçamento sincronizado nesta empresa</p>
            <p className="text-sm text-gray-500">
              Os orçamentos aparecem aqui quando o app mobile sincroniza com o Cash.
            </p>
          </div>
        ) : filteredBudgets.length === 0 ? (
          <div className="py-12 text-center">
            <PiggyBank size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="text-gray-400">Nenhum orçamento encontrado para os filtros aplicados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredBudgets.map((budget) => (
              <BudgetCard
                key={budget.clientKey}
                budget={budget}
                timeZone={timeZone}
                businessDate={businessDate}
              />
            ))}
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}

function BudgetCard({
  budget,
  timeZone,
  businessDate
}: {
  budget: Budget;
  timeZone: string;
  businessDate: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-[#11161d] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{budget.code}</h2>
            {budget.isPrimary && (
              <span className="rounded-full bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-300">
                Principal
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Periodo {formatBusinessDate(budget.startDate, timeZone)} ate{' '}
            {formatBusinessDate(budget.endDate, timeZone)}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <span className={`rounded-full px-2 py-1 text-xs ${kindBadgeClass(budget.kind)}`}>
            {getBudgetKindLabel(budget.kind)}
          </span>
          <span className={`rounded-full px-2 py-1 text-xs ${statusBadgeClass(budget.status)}`}>
            {getBudgetStatusLabel(budget.status)}
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-700 bg-[#151b23] p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Saldo atual</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatCurrencyFromCents(budget.currentBalanceCents)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-[#151b23] p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Hoje</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatCurrencyFromCents(budget.dailyBudgetCurrentCents)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-[#151b23] p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Saldo extra</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatCurrencyFromCents(budget.dayExtraBalanceCents)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
        <span>Entries: {budget.entries.length}</span>
        <span>Meta final: {formatCurrencyFromCents(budget.targetEndingBalanceCents)}</span>
        <span>Data de negócio: {formatBusinessDate(businessDate, timeZone)}</span>
      </div>

      <Link href={`/financial/budgets/${budget.clientKey}`}>
        <Button variant="outline" className="inline-flex items-center gap-2">
          Ver detalhes
          <ArrowRight size={16} />
        </Button>
      </Link>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <PageGuard requiredRole="USER">
      <BudgetsPageInner />
    </PageGuard>
  );
}
