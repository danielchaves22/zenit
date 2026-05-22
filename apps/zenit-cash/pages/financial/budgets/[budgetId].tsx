import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  PiggyBank,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  BudgetEntry,
  BudgetListResponse,
  fetchBudgets,
  formatBusinessDate,
  formatBusinessDateTime,
  formatCurrencyFromCents,
  getAllocationModeLabel,
  getBudgetDaysRemaining,
  getBudgetKindLabel,
  getBudgetStatusLabel,
  getEntryTypeLabel,
  sortBudgetEntries
} from '@/utils/budgets';

function BudgetDetailPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const [payload, setPayload] = useState<BudgetListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const budgetId = typeof router.query.budgetId === 'string' ? router.query.budgetId : null;

  useEffect(() => {
    if (!router.isReady || !budgetId) return;
    void loadBudget();
  }, [router.isReady, budgetId]);

  async function loadBudget() {
    setLoading(true);

    try {
      const nextPayload = await fetchBudgets();
      setPayload(nextPayload);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar orçamento', 'error');
    } finally {
      setLoading(false);
    }
  }

  const budget = useMemo(() => {
    if (!payload || !budgetId) return null;
    return payload.budgets.find((item) => item.clientKey === budgetId) || null;
  }, [payload, budgetId]);

  return (
    <DashboardLayout title={budget ? `Orçamento ${budget.code}` : 'Detalhe do orçamento'}>
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Financeiro' },
          { label: 'Orçamentos', href: '/financial/budgets' },
          { label: budget?.code || 'Detalhe' }
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {budget ? `Orçamento ${budget.code}` : 'Detalhe do orçamento'}
          </h1>
          {payload && (
            <p className="mt-1 text-sm text-gray-400">
              Data de negócio: {formatBusinessDate(payload.businessDate, payload.timeZone)}
            </p>
          )}
        </div>

        <Link href="/financial/budgets">
          <Button variant="outline" className="inline-flex items-center gap-2">
            <ArrowLeft size={16} />
            Voltar
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : !budget || !payload ? (
        <Card>
          <div className="py-12 text-center">
            <PiggyBank size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="mb-2 text-gray-300">Orçamento não encontrado</p>
            <p className="mb-4 text-sm text-gray-500">
              O orçamento pode ter sido removido, trocado de empresa ou ainda não sincronizado.
            </p>
            <Link href="/financial/budgets">
              <Button variant="outline">Voltar para a listagem</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
            <MetricCard label="Saldo atual" value={formatCurrencyFromCents(budget.currentBalanceCents)} />
            <MetricCard
              label="Hoje"
              value={formatCurrencyFromCents(budget.dailyBudgetCurrentCents)}
            />
            <MetricCard
              label="Saldo extra"
              value={formatCurrencyFromCents(budget.dayExtraBalanceCents)}
            />
            <MetricCard
              label="Meta final"
              value={formatCurrencyFromCents(budget.targetEndingBalanceCents)}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.9fr]">
            <Card headerTitle="Resumo do orçamento">
              <div className="space-y-4 text-sm">
                <InfoRow label="Tipo" value={getBudgetKindLabel(budget.kind)} />
                <InfoRow label="Status" value={getBudgetStatusLabel(budget.status)} />
                <InfoRow label="Principal" value={budget.isPrimary ? 'Sim' : 'Não'} />
                <InfoRow
                  label="Periodo"
                  value={`${formatBusinessDate(budget.startDate, payload.timeZone)} ate ${formatBusinessDate(
                    budget.endDate,
                    payload.timeZone
                  )}`}
                />
                <InfoRow
                  label="Dias restantes"
                  value={String(getBudgetDaysRemaining(budget, payload.businessDate, payload.timeZone))}
                />
                <InfoRow
                  label="Ultima atualizacao"
                  value={formatBusinessDateTime(budget.updatedAt, payload.timeZone)}
                />
                <InfoRow label="Total de entries" value={String(budget.entries.length)} />
              </div>
            </Card>

            <Card headerTitle="Entradas e saídas" headerSubtitle="Timeline do domínio de orçamento">
              {budget.entries.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  Nenhuma movimentação sincronizada neste orçamento
                </div>
              ) : (
                <div className="space-y-4">
                  {sortBudgetEntries(budget.entries).map((entry) => (
                    <EntryRow key={entry.clientKey} entry={entry} timeZone={payload.timeZone} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-800 pb-3 last:border-b-0 last:pb-0">
      <span className="text-gray-400">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function EntryRow({ entry, timeZone }: { entry: BudgetEntry; timeZone: string }) {
  const isIncome = entry.entryType === 'INCOME';
  const allocationLabel = getAllocationModeLabel(entry.allocationMode);

  return (
    <div className="rounded-xl border border-gray-700 bg-[#11161d] p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-1 rounded-full p-2 ${
              isIncome ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}
          >
            {isIncome ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white">{getEntryTypeLabel(entry.entryType)}</span>
              {allocationLabel && (
                <span className="rounded-full border border-gray-600 px-2 py-0.5 text-xs text-gray-300">
                  {allocationLabel}
                </span>
              )}
              {!entry.affectsBudgetBalance && (
                <span className="rounded-full border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">
                  Sem impacto direto
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-400">{entry.description || 'Sem descrição'}</p>
          </div>
        </div>

        <div className="text-left md:text-right">
          <p className={`text-lg font-semibold ${isIncome ? 'text-green-300' : 'text-red-300'}`}>
            {formatCurrencyFromCents(entry.amountCents)}
          </p>
          <p className="text-xs text-gray-500">
            Impacto principal: {formatCurrencyFromCents(entry.principalImpactAmountCents)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={13} />
          {formatBusinessDate(entry.occurredAt, timeZone)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock3 size={13} />
          Atualizado em {formatBusinessDateTime(entry.updatedAt, timeZone)}
        </span>
      </div>
    </div>
  );
}

export default function BudgetDetailPage() {
  return (
    <PageGuard requiredRole="USER">
      <BudgetDetailPageInner />
    </PageGuard>
  );
}
