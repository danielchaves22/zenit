import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarRange, PiggyBank, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import {
  MonthlyCategoryBudgetResponse,
  getMonthlyCategoryBudget
} from '@/lib/monthly-category-budgets';
import {
  BudgetListResponse,
  fetchBudgets,
  formatCurrencyFromCents,
  getPrimaryBudget
} from '@/utils/budgets';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

export function BudgetOverview({ month }: { month: string }) {
  const { addToast } = useToast();
  const [availability, setAvailability] = useState<BudgetListResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyCategoryBudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      try {
        const [availabilityResponse, monthlyResponse] = await Promise.all([
          fetchBudgets(),
          getMonthlyCategoryBudget(month)
        ]);
        if (!cancelled) {
          setAvailability(availabilityResponse);
          setMonthly(monthlyResponse);
        }
      } catch (error: any) {
        if (!cancelled) {
          addToast(error.response?.data?.error || 'Erro ao carregar a visão geral do orçamento', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const primaryBudget = useMemo(
    () => getPrimaryBudget(availability?.budgets || []),
    [availability]
  );
  const forecastVariance = Number(monthly?.summary.forecastVarianceAmount || 0);
  const hasMonthlyPlan = (monthly?.items.length || 0) > 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 rounded-xl border border-blue-800/60 bg-blue-950/30 p-4">
        <p className="text-sm font-medium text-blue-200">Dois planos, duas perguntas complementares</p>
        <p className="mt-1 text-sm text-blue-100/70">
          O Plano de Disponibilidade mostra quanto pode ser utilizado preservando a meta de saldo. O
          Planejamento Mensal organiza onde você pretende usar esse dinheiro.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                Plano de disponibilidade
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Quanto posso utilizar preservando meu saldo desejado?
              </h2>
            </div>
            <PiggyBank className="shrink-0 text-blue-300" size={26} />
          </div>

          {primaryBudget ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <OverviewMetric
                label="Disponível hoje"
                value={formatCurrencyFromCents(primaryBudget.dailyBudgetCurrentCents)}
              />
              <OverviewMetric
                label="Meta de saldo final"
                value={formatCurrencyFromCents(primaryBudget.targetEndingBalanceCents)}
              />
              <OverviewMetric
                label="Saldo atual do plano"
                value={formatCurrencyFromCents(primaryBudget.currentBalanceCents)}
              />
              <OverviewMetric label="Plano principal" value={primaryBudget.code} />
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-gray-700 p-5 text-sm text-gray-400">
              Nenhum plano principal foi sincronizado ainda.
            </div>
          )}

          <div className="mt-auto pt-6">
            <Link href={{ pathname: '/financial/budgets', query: { view: 'availability', month } }}>
              <Button variant="outline" className="inline-flex items-center gap-2">
                Abrir plano de disponibilidade
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Planejamento mensal
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Onde pretendo utilizar o dinheiro neste mês?
              </h2>
            </div>
            <Target className="shrink-0 text-emerald-300" size={26} />
          </div>

          {hasMonthlyPlan && monthly ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <OverviewMetric label="Planejado" value={formatMoney(monthly.summary.plannedAmount)} />
                <OverviewMetric label="Tendência" value={formatMoney(monthly.summary.forecastAmount)} />
                <OverviewMetric
                  label="Realizado + comprometido"
                  value={formatMoney(
                    Number(monthly.summary.realizedAmount) + Number(monthly.summary.committedAmount)
                  )}
                />
                <OverviewMetric
                  label="Margem pela tendência"
                  value={formatMoney(forecastVariance)}
                  tone={forecastVariance < 0 ? 'danger' : 'success'}
                />
              </div>
              <div
                className={`mt-4 flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  forecastVariance < 0
                    ? 'border-red-800/70 bg-red-950/30 text-red-200'
                    : 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
                }`}
              >
                {forecastVariance < 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                <span>
                  {forecastVariance < 0
                    ? `A tendência ultrapassa o planejado em ${formatMoney(Math.abs(forecastVariance))}.`
                    : `A tendência está ${formatMoney(forecastVariance)} abaixo do total planejado.`}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-gray-700 p-5 text-sm text-gray-400">
              Este mês ainda não possui limites definidos por categoria.
            </div>
          )}

          <div className="mt-auto pt-6">
            <Link href={{ pathname: '/financial/budgets', query: { view: 'monthly', month } }}>
              <Button variant="outline" className="inline-flex items-center gap-2">
                {hasMonthlyPlan ? 'Abrir planejamento mensal' : 'Planejar este mês'}
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-start gap-3">
          <CalendarRange className="mt-0.5 shrink-0 text-accent" size={22} />
          <div>
            <h3 className="font-medium text-white">Leitura conjunta</h3>
            <p className="mt-1 text-sm text-gray-400">
              Limites por categoria não alteram o saldo do Plano de Disponibilidade e não criam
              lançamentos. Eles funcionam como uma intenção mensal comparada aos gastos que já existem.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}

function OverviewMetric({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const valueClass =
    tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';

  return (
    <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 truncate text-base font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
