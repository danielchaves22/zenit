import Link from 'next/link';
import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  PiggyBank,
  Target,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import {
  FinancialDashboardMonthlyResponse,
  getFinancialDashboardMonthly
} from '@/lib/financial-dashboard';
import {
  MonthlyCategoryBudgetResponse,
  getMonthlyCategoryBudget
} from '@/lib/monthly-category-budgets';
import {
  FinancialProvisionListResponse,
  getFinancialProvisions
} from '@/lib/financial-provisions';
import {
  Budget,
  BudgetListResponse,
  fetchBudgets,
  formatCurrencyFromCents,
  getPrimaryBudget
} from '@/utils/budgets';

type OverviewSection = 'dashboard' | 'availability' | 'monthly' | 'provisions';
type OverviewState = 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'INCOMPLETE';
type AttentionTone = 'critical' | 'attention' | 'incomplete';

interface OverviewAttention {
  key: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: AttentionTone;
}

interface OverviewAssessment {
  state: OverviewState;
  label: string;
  title: string;
  description: string;
  attentions: OverviewAttention[];
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

function budgetHref(view: 'availability' | 'monthly' | 'provisions', month: string): string {
  return `/financial/budgets?view=${view}&month=${month}`;
}

function buildAssessment(params: {
  month: string;
  dashboard: FinancialDashboardMonthlyResponse | null;
  monthly: MonthlyCategoryBudgetResponse | null;
  provisions: FinancialProvisionListResponse | null;
  primaryBudget: Budget | null;
  failedSections: OverviewSection[];
}): OverviewAssessment {
  const { month, dashboard, monthly, provisions, primaryBudget, failedSections } = params;
  const attentions: OverviewAttention[] = [];
  const failed = new Set(failedSections);

  if (failed.has('dashboard')) {
    attentions.push({
      key: 'dashboard-unavailable',
      title: 'Projeção mensal indisponível',
      detail: 'Não foi possível calcular o saldo final deste mês agora.',
      href: `/financial/dashboard?view=monthly&month=${month}`,
      actionLabel: 'Abrir dashboard',
      tone: 'incomplete'
    });
  }

  if (failed.has('monthly')) {
    attentions.push({
      key: 'monthly-unavailable',
      title: 'Planejamento mensal indisponível',
      detail: 'Os limites por categoria não puderam ser consultados.',
      href: budgetHref('monthly', month),
      actionLabel: 'Abrir planejamento',
      tone: 'incomplete'
    });
  } else if (monthly) {
    const forecastVariance = Number(monthly.summary.forecastVarianceAmount);
    const budgetRiskCount = monthly.summary.exceededCount + monthly.summary.atRiskCount;

    if (monthly.items.length === 0) {
      attentions.push({
        key: 'monthly-missing',
        title: 'Mês ainda não planejado',
        detail: 'Defina limites para comparar sua intenção com a tendência de gastos.',
        href: budgetHref('monthly', month),
        actionLabel: 'Planejar mês',
        tone: 'incomplete'
      });
    } else if (forecastVariance < 0 || budgetRiskCount > 0) {
      const categoryDetail = [
        monthly.summary.exceededCount > 0
          ? `${monthly.summary.exceededCount} categoria(s) excedida(s)`
          : null,
        monthly.summary.atRiskCount > 0
          ? `${monthly.summary.atRiskCount} categoria(s) em atenção`
          : null
      ]
        .filter(Boolean)
        .join(' e ');
      attentions.push({
        key: 'monthly-risk',
        title: 'Tendência acima do planejado',
        detail:
          forecastVariance < 0
            ? `A projeção supera os limites em ${formatMoney(Math.abs(forecastVariance))}${
                categoryDetail ? ` · ${categoryDetail}` : ''
              }.`
            : `${categoryDetail}.`,
        href: budgetHref('monthly', month),
        actionLabel: 'Revisar categorias',
        tone: 'attention'
      });
    }

    if (!monthly.statsAvailable) {
      attentions.push({
        key: 'monthly-stats-unavailable',
        title: 'Estatísticas do mês incompletas',
        detail: 'Os limites existem, mas ainda não foi possível compará-los com os gastos.',
        href: budgetHref('monthly', month),
        actionLabel: 'Ver planejamento',
        tone: 'incomplete'
      });
    } else if (monthly.items.length > 0 && monthly.historicalMonthsUsed < 6) {
      attentions.push({
        key: 'monthly-short-history',
        title: 'Histórico ainda curto',
        detail: `As tendências usam ${monthly.historicalMonthsUsed} de até 6 meses completos.`,
        href: budgetHref('monthly', month),
        actionLabel: 'Ver planejamento',
        tone: 'incomplete'
      });
    }
  }

  if (
    !failed.has('dashboard') &&
    dashboard &&
    dashboard.variableProjection.categories.length === 0
  ) {
    attentions.push({
      key: 'variable-projection-missing',
      title: 'Gastos variáveis sem estimativa',
      detail: 'Escolha no dashboard as categorias que devem usar a média histórica.',
      href: `/financial/dashboard?view=monthly&month=${month}`,
      actionLabel: 'Configurar estimativas',
      tone: 'incomplete'
    });
  }

  if (failed.has('provisions')) {
    attentions.push({
      key: 'provisions-unavailable',
      title: 'Provisões indisponíveis',
      detail: 'As reservas para despesas futuras não puderam ser consultadas.',
      href: budgetHref('provisions', month),
      actionLabel: 'Abrir provisões',
      tone: 'incomplete'
    });
  } else if (provisions && provisions.summary.overdueCount > 0) {
    attentions.push({
      key: 'provisions-overdue',
      title: 'Provisões com prazo vencido',
      detail: `${provisions.summary.overdueCount} provisão(ões) precisa(m) de revisão.`,
      href: budgetHref('provisions', month),
      actionLabel: 'Revisar provisões',
      tone: 'attention'
    });
  }

  if (failed.has('availability')) {
    attentions.push({
      key: 'availability-unavailable',
      title: 'Plano de disponibilidade indisponível',
      detail: 'O limite de uso diário não pôde ser consultado.',
      href: budgetHref('availability', month),
      actionLabel: 'Abrir disponibilidade',
      tone: 'incomplete'
    });
  } else if (!primaryBudget) {
    attentions.push({
      key: 'availability-missing',
      title: 'Plano de disponibilidade não configurado',
      detail: 'Defina quanto pode utilizar preservando a meta de saldo.',
      href: budgetHref('availability', month),
      actionLabel: 'Configurar plano',
      tone: 'incomplete'
    });
  }

  const projectedEndingBalance = dashboard ? Number(dashboard.projectedEndingBalance) : null;
  const provisionContribution = dashboard
    ? Number(dashboard.monthlyTotals.provisionContributionTotal)
    : null;

  if (
    projectedEndingBalance !== null &&
    projectedEndingBalance > 0 &&
    provisionContribution !== null &&
    provisionContribution > projectedEndingBalance
  ) {
    attentions.unshift({
      key: 'provision-pressure',
      title: 'Saldo projetado não cobre os aportes planejados',
      detail: `As provisões pedem ${formatMoney(provisionContribution)}, acima do saldo final projetado.`,
      href: budgetHref('provisions', month),
      actionLabel: 'Revisar provisões',
      tone: 'attention'
    });
  }

  if (projectedEndingBalance === 0) {
    attentions.unshift({
      key: 'no-projected-margin',
      title: 'Projeção sem margem ao final do mês',
      detail: 'Qualquer gasto adicional pode levar o saldo projetado para o negativo.',
      href: budgetHref('monthly', month),
      actionLabel: 'Revisar planejamento',
      tone: 'attention'
    });
  }

  if (projectedEndingBalance !== null && projectedEndingBalance < 0) {
    attentions.unshift({
      key: 'negative-projection',
      title: 'Reequilibrar o mês',
      detail: `A projeção precisa melhorar em ${formatMoney(Math.abs(projectedEndingBalance))} para chegar a zero.`,
      href: budgetHref('monthly', month),
      actionLabel: 'Revisar planejamento',
      tone: 'critical'
    });
    return {
      state: 'CRITICAL',
      label: 'Situação crítica',
      title: 'O mês tende a terminar no negativo',
      description: `Faltam ${formatMoney(Math.abs(projectedEndingBalance))} para que a projeção termine em zero.`,
      attentions
    };
  }

  if (attentions.some((attention) => attention.tone === 'attention')) {
    return {
      state: 'ATTENTION',
      label: 'Atenção necessária',
      title: 'Há pontos que podem pressionar o mês',
      description: dashboard
        ? `O saldo final ainda é projetado em ${formatMoney(dashboard.projectedEndingBalance)}, mas há desvios para revisar.`
        : 'Existem desvios no planejamento que precisam ser revisados.',
      attentions
    };
  }

  if (attentions.length > 0 || !dashboard) {
    return {
      state: 'INCOMPLETE',
      label: 'Base incompleta',
      title: 'A projeção ainda precisa de contexto',
      description: dashboard
        ? `O saldo final é projetado em ${formatMoney(dashboard.projectedEndingBalance)}, mas complete os pontos abaixo para aumentar a confiança.`
        : 'Complete ou atualize os dados abaixo antes de tomar uma decisão.',
      attentions
    };
  }

  return {
    state: 'HEALTHY',
    label: 'Mês sob controle',
    title: 'A projeção mantém saldo positivo',
    description: `Receitas e saídas estimadas resultam em ${formatMoney(
      dashboard.projectedEndingBalance
    )} ao final do mês. Os aportes para provisões são mostrados à parte.`,
    attentions
  };
}

const stateStyles: Record<
  OverviewState,
  { border: string; badge: string; title: string; icon: typeof CheckCircle2 }
> = {
  HEALTHY: {
    border: 'border-emerald-800/70',
    badge: 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200',
    title: 'text-emerald-300',
    icon: CheckCircle2
  },
  ATTENTION: {
    border: 'border-amber-800/70',
    badge: 'border-amber-800/70 bg-amber-950/40 text-amber-200',
    title: 'text-amber-300',
    icon: AlertTriangle
  },
  CRITICAL: {
    border: 'border-red-800/70',
    badge: 'border-red-800/70 bg-red-950/40 text-red-200',
    title: 'text-red-300',
    icon: TrendingUp
  },
  INCOMPLETE: {
    border: 'border-blue-800/70',
    badge: 'border-blue-800/70 bg-blue-950/40 text-blue-200',
    title: 'text-blue-300',
    icon: AlertTriangle
  }
};

export function BudgetOverview({ month }: { month: string }) {
  const { addToast } = useToast();
  const [availability, setAvailability] = useState<BudgetListResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyCategoryBudgetResponse | null>(null);
  const [provisions, setProvisions] = useState<FinancialProvisionListResponse | null>(null);
  const [dashboard, setDashboard] = useState<FinancialDashboardMonthlyResponse | null>(null);
  const [failedSections, setFailedSections] = useState<OverviewSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading(true);
      setFailedSections([]);

      const results = await Promise.allSettled([
        getFinancialDashboardMonthly(month),
        fetchBudgets(),
        getMonthlyCategoryBudget(month),
        getFinancialProvisions()
      ] as const);

      if (cancelled) return;

      const sectionNames: OverviewSection[] = [
        'dashboard',
        'availability',
        'monthly',
        'provisions'
      ];
      const failed = results.flatMap((result, index) =>
        result.status === 'rejected' ? [sectionNames[index]] : []
      );

      setDashboard(results[0].status === 'fulfilled' ? results[0].value : null);
      setAvailability(results[1].status === 'fulfilled' ? results[1].value : null);
      setMonthly(results[2].status === 'fulfilled' ? results[2].value : null);
      setProvisions(results[3].status === 'fulfilled' ? results[3].value : null);
      setFailedSections(failed);
      setLoading(false);

      if (failed.length > 0) {
        addToast(
          failed.length === sectionNames.length
            ? 'Não foi possível carregar a visão geral do orçamento'
            : 'Parte da visão geral não pôde ser atualizada',
          'error'
        );
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
  const assessment = useMemo(
    () =>
      buildAssessment({
        month,
        dashboard,
        monthly,
        provisions,
        primaryBudget,
        failedSections
      }),
    [dashboard, failedSections, month, monthly, primaryBudget, provisions]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  const stateStyle = stateStyles[assessment.state];
  const StateIcon = stateStyle.icon;
  const forecastVariance = Number(monthly?.summary.forecastVarianceAmount || 0);
  const hasMonthlyPlan = (monthly?.items.length || 0) > 0;

  return (
    <div className="space-y-5">
      <Card className={`overflow-hidden border ${stateStyle.border}`}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
          <section aria-labelledby="monthly-decision-title">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${stateStyle.badge}`}
            >
              <StateIcon size={15} />
              {assessment.label}
            </span>
            <h2 id="monthly-decision-title" className="mt-4 text-2xl font-semibold text-white">
              {assessment.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              {assessment.description}
            </p>
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Saldo final projetado
              </p>
              <p className={`mt-1 text-4xl font-semibold ${stateStyle.title}`}>
                {dashboard ? formatMoney(dashboard.projectedEndingBalance) : 'Indisponível'}
              </p>
              {dashboard && Number(dashboard.monthlyTotals.provisionContributionTotal) > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Não desconta os aportes lógicos para provisões.
                </p>
              )}
            </div>
          </section>

          <section aria-label="Composição da projeção" className="grid grid-cols-2 gap-3">
            <OverviewMetric
              label="Saldo base"
              value={dashboard ? formatMoney(dashboard.carryOver.amount) : '—'}
              detail={
                dashboard?.carryOver.source === 'CURRENT_BALANCE'
                  ? 'Saldo atual das contas'
                  : 'Projeção do mês anterior'
              }
            />
            <OverviewMetric
              label={dashboard?.isCurrentMonth ? 'Receitas restantes' : 'Receitas previstas'}
              value={
                dashboard
                  ? formatMoney(
                      dashboard.isCurrentMonth
                        ? dashboard.currentMonthBreakdown.income.remaining
                        : dashboard.monthlyTotals.incomeTotal
                    )
                  : '—'
              }
              tone="success"
            />
            <OverviewMetric
              label={dashboard?.isCurrentMonth ? 'Compromissos restantes' : 'Saídas comprometidas'}
              value={
                dashboard
                  ? formatMoney(
                      dashboard.isCurrentMonth
                        ? dashboard.currentMonthBreakdown.expense.remainingCommitted
                        : dashboard.monthlyTotals.committedExpenseTotal
                    )
                  : '—'
              }
              tone="danger"
            />
            <OverviewMetric
              label={dashboard?.isCurrentMonth ? 'Variáveis ainda estimadas' : 'Variáveis estimadas'}
              value={
                dashboard
                  ? formatMoney(
                      dashboard.isCurrentMonth
                        ? dashboard.currentMonthBreakdown.expense.remainingVariableProjected
                        : dashboard.monthlyTotals.variableProjectedExpenseTotal
                    )
                  : '—'
              }
              tone="danger"
            />
            <OverviewMetric
              label="Aportes para provisões"
              value={dashboard ? formatMoney(dashboard.monthlyTotals.provisionContributionTotal) : '—'}
              detail="Reserva lógica; não reduz o saldo projetado"
              className="col-span-2"
            />
          </section>
        </div>
      </Card>

      {assessment.attentions.length > 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <AlertTriangle size={19} className="text-amber-300" />
            <h2 className="text-lg font-semibold text-white">O que merece atenção</h2>
          </div>
          <div className="mt-4 divide-y divide-gray-800">
            {assessment.attentions.map((attention) => (
              <div
                key={attention.key}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0 ${
                    attention.tone === 'critical'
                      ? 'bg-red-400'
                      : attention.tone === 'attention'
                        ? 'bg-amber-400'
                        : 'bg-blue-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{attention.title}</p>
                  <p className="mt-0.5 text-sm text-gray-400">{attention.detail}</p>
                </div>
                <Link
                  href={attention.href}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
                >
                  {attention.actionLabel}
                  <ArrowRight size={15} />
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section aria-labelledby="budget-controls-title">
        <h2 id="budget-controls-title" className="mb-3 text-lg font-semibold text-white">
          Controles do orçamento
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ControlCard
            title="Plano de disponibilidade"
            icon={<PiggyBank className="text-blue-300" size={23} />}
            value={
              failedSections.includes('availability')
                ? 'Indisponível'
                : primaryBudget
                  ? formatCurrencyFromCents(primaryBudget.dailyBudgetCurrentCents)
                  : 'Não configurado'
            }
            valueLabel={primaryBudget ? 'Disponível hoje' : 'Situação'}
            details={
              primaryBudget
                ? [
                    `Meta de saldo: ${formatCurrencyFromCents(primaryBudget.targetEndingBalanceCents)}`,
                    `Saldo do plano: ${formatCurrencyFromCents(primaryBudget.currentBalanceCents)}`
                  ]
                : []
            }
            href={budgetHref('availability', month)}
            actionLabel={primaryBudget ? 'Abrir disponibilidade' : 'Configurar disponibilidade'}
          />

          <ControlCard
            title="Planejamento mensal"
            icon={<Target className="text-emerald-300" size={23} />}
            value={
              failedSections.includes('monthly')
                ? 'Indisponível'
                : hasMonthlyPlan && monthly
                  ? formatMoney(monthly.summary.plannedAmount)
                  : 'Não planejado'
            }
            valueLabel={hasMonthlyPlan ? 'Total planejado' : 'Situação'}
            details={
              hasMonthlyPlan && monthly
                ? [
                    `Tendência: ${formatMoney(monthly.summary.forecastAmount)}`,
                    forecastVariance < 0
                      ? `${formatMoney(Math.abs(forecastVariance))} acima do planejado`
                      : `${formatMoney(forecastVariance)} de margem`
                  ]
                : []
            }
            href={budgetHref('monthly', month)}
            actionLabel={hasMonthlyPlan ? 'Abrir planejamento' : 'Planejar mês'}
            tone={forecastVariance < 0 ? 'danger' : 'neutral'}
          />

          <ControlCard
            title="Provisões"
            icon={<CalendarClock className="text-violet-300" size={23} />}
            value={
              failedSections.includes('provisions')
                ? 'Indisponível'
                : provisions && provisions.summary.activeCount > 0
                  ? formatMoney(provisions.summary.monthlyContributionAmount)
                  : 'Nenhuma ativa'
            }
            valueLabel={
              provisions && provisions.summary.activeCount > 0 ? 'Aporte mensal' : 'Situação'
            }
            details={
              provisions && provisions.summary.activeCount > 0
                ? [
                    `${provisions.summary.activeCount} provisão(ões) ativa(s)`,
                    `Reservado: ${formatMoney(provisions.summary.reservedAmount)}`
                  ]
                : []
            }
            href={budgetHref('provisions', month)}
            actionLabel={
              provisions && provisions.summary.activeCount > 0 ? 'Abrir provisões' : 'Criar provisão'
            }
            tone={(provisions?.summary.overdueCount || 0) > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </section>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  className = '',
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const valueClass =
    tone === 'success' ? 'text-emerald-300' : tone === 'danger' ? 'text-red-300' : 'text-white';

  return (
    <div className={`rounded-xl border border-gray-700 bg-[#11161d] p-4 ${className}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold ${valueClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

function ControlCard({
  title,
  icon,
  value,
  valueLabel,
  details,
  href,
  actionLabel,
  tone = 'neutral'
}: {
  title: string;
  icon: ReactNode;
  value: string;
  valueLabel: string;
  details: string[];
  href: string;
  actionLabel: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">{title}</h3>
        {icon}
      </div>
      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">{valueLabel}</p>
        <p
          className={`mt-1 truncate text-2xl font-semibold ${
            tone === 'danger' ? 'text-red-300' : 'text-white'
          }`}
        >
          {value}
        </p>
        {details.length > 0 && (
          <div className="mt-3 space-y-1 text-sm text-gray-400">
            {details.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
        )}
      </div>
      <div className="mt-auto pt-5">
        <Link href={href}>
          <Button variant="outline" className="inline-flex items-center gap-2">
            {actionLabel}
            <ArrowRight size={16} />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
