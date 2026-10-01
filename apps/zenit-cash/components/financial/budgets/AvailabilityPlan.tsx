import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, PiggyBank, Star, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
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
    ? 'border border-tone-blue/25 bg-tone-blue-soft text-tone-blue'
    : 'border border-tone-emerald/25 bg-tone-emerald-soft text-tone-emerald';
}

function statusBadgeClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    ACTIVE: 'bg-tone-green-soft text-tone-green',
    ARCHIVED: 'bg-elevated text-text',
    EXPIRED: 'bg-tone-amber-soft text-tone-amber',
    DELETED: 'bg-tone-red-soft text-tone-red'
  };

  return map[status] || 'bg-elevated text-text';
}

export function AvailabilityPlan() {
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
      setPayload(await fetchBudgets());
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar o plano de disponibilidade', 'error');
    } finally {
      setLoading(false);
    }
  }

  const budgets = payload?.budgets || [];
  const timeZone = payload?.timeZone || 'UTC';
  const businessDate = payload?.businessDate || new Date().toISOString();
  const filteredBudgets = useMemo(
    () =>
      budgets.filter((budget) => {
        if (kindFilter !== 'ALL' && budget.kind !== kindFilter) return false;
        if (statusFilter !== 'ALL' && budget.status !== statusFilter) return false;
        if (onlyPrimary && !budget.isPrimary) return false;
        return true;
      }),
    [budgets, kindFilter, onlyPrimary, statusFilter]
  );
  const primaryBudget = useMemo(() => getPrimaryBudget(budgets), [budgets]);
  const activeBudgets = useMemo(
    () => budgets.filter((budget) => budget.status === 'ACTIVE'),
    [budgets]
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-text">Plano de disponibilidade</h2>
          <InfoModalButton
            modalTitle="Sobre o Plano de Disponibilidade"
            buttonLabel="Ajuda sobre o Plano de Disponibilidade"
          >
            <p>
              Acompanhe quanto pode utilizar por dia preservando o saldo que deseja manter ao fim do
              período.
            </p>
          </InfoModalButton>
          {payload && (
            <span className="text-xs text-text-subtle">
              Data de negócio: {formatBusinessDate(businessDate, timeZone)}
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => void loadBudgets()}>
          Atualizar
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-muted">Planos cadastrados</p>
              <p className="mt-2 text-3xl font-bold text-text">{budgets.length}</p>
            </div>
            <Wallet className="text-accent" size={22} />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-muted">Planos ativos</p>
              <p className="mt-2 text-3xl font-bold text-text">{activeBudgets.length}</p>
            </div>
            <CalendarDays className="text-accent" size={22} />
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-muted">Disponibilidade principal hoje</p>
              <p className="mt-2 text-lg font-semibold text-text">
                {primaryBudget
                  ? formatCurrencyFromCents(primaryBudget.dailyBudgetCurrentCents)
                  : 'Nenhum plano principal'}
              </p>
              {primaryBudget && <p className="mt-1 text-sm text-text-muted">{primaryBudget.code}</p>}
            </div>
            <Star className="text-tone-yellow" size={22} />
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Tipo</label>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as 'ALL' | BudgetKind)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-text focus:border-accent focus:outline-none focus:ring"
            >
              <option value="ALL">Todos</option>
              <option value="SPENDING">Gasto</option>
              <option value="SAVINGS">Economia</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'ALL' | BudgetStatus)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-text focus:border-accent focus:outline-none focus:ring"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="ARCHIVED">Arquivados</option>
              <option value="EXPIRED">Expirados</option>
              <option value="DELETED">Excluídos</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={onlyPrimary}
                onChange={(event) => setOnlyPrimary(event.target.checked)}
                className="rounded border-border-strong bg-background"
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
            <PiggyBank size={42} className="mx-auto mb-3 text-text-subtle" />
            <p className="mb-2 text-text-muted">Nenhum plano de disponibilidade nesta empresa</p>
            <p className="text-sm text-text-subtle">
              Os planos aparecem aqui quando o aplicativo móvel sincroniza com o Cash.
            </p>
          </div>
        ) : filteredBudgets.length === 0 ? (
          <div className="py-12 text-center">
            <PiggyBank size={42} className="mx-auto mb-3 text-text-subtle" />
            <p className="text-text-muted">Nenhum plano encontrado para os filtros aplicados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredBudgets.map((budget) => (
              <AvailabilityPlanCard
                key={budget.clientKey}
                budget={budget}
                timeZone={timeZone}
                businessDate={businessDate}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function AvailabilityPlanCard({
  budget,
  timeZone,
  businessDate
}: {
  budget: Budget;
  timeZone: string;
  businessDate: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-text">{budget.code}</h3>
            {budget.isPrimary && (
              <span className="rounded-full bg-tone-yellow-soft px-2 py-1 text-xs font-medium text-tone-yellow">
                Principal
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Período {formatBusinessDate(budget.startDate, timeZone)} até{' '}
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
        <PlanMetric label="Saldo atual" value={formatCurrencyFromCents(budget.currentBalanceCents)} />
        <PlanMetric label="Hoje" value={formatCurrencyFromCents(budget.dailyBudgetCurrentCents)} />
        <PlanMetric label="Saldo extra" value={formatCurrencyFromCents(budget.dayExtraBalanceCents)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-text-muted">
        <span>Lançamentos: {budget.entries.length}</span>
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

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <p className="text-xs uppercase tracking-wide text-text-subtle">{label}</p>
      <p className="mt-2 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}
