import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  LineChart as LineChartIcon,
  Loader2,
  PieChart as PieChartIcon,
  Save,
  Settings2
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  type FinancialDashboardHistoryResponse,
  type FinancialDashboardMonthlyResponse,
  type FinancialDashboardView,
  getFinancialDashboardHistory,
  getFinancialDashboardMonthly,
  getVariableProjectionPreference,
  updateVariableProjectionPreference
} from '@/lib/financial-dashboard';

interface Category {
  id: number;
  name: string;
  color: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  parentId?: number | null;
}

const VIEW_OPTIONS: Array<{ value: FinancialDashboardView; label: string }> = [
  { value: 'monthly', label: 'Situação financeira mensal' },
  { value: 'history', label: 'Histórico financeiro' }
];

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(monthKey: string, offset: number): string {
  const date = parseMonthKey(monthKey);
  return formatMonthKey(new Date(date.getFullYear(), date.getMonth() + offset, 1, 12, 0, 0, 0));
}

function normalizeMonthKey(value: string | string[] | undefined, fallback: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d{4}-\d{2}$/.test(candidate)) {
    return fallback;
  }

  return candidate < fallback ? fallback : candidate;
}

function normalizeView(value: string | string[] | undefined): FinancialDashboardView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'history' ? 'history' : 'monthly';
}

function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(typeof value === 'number' ? value : Number(value || 0));
}

function formatMonthLabel(monthKey: string): string {
  return parseMonthKey(monthKey).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function formatShortMonthLabel(monthKey: string): string {
  return parseMonthKey(monthKey).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit'
  });
}

function buildTooltipStyle() {
  return {
    backgroundColor: 'var(--color-bg)',
    borderColor: '#374151',
    color: '#fff'
  };
}

function parseAmount(value: string): number {
  return Number(value || 0);
}

function formatTooltipLabel(
  _: unknown,
  payload?: Array<{ payload?: { fullLabel?: string } }>
): string {
  return String(payload?.[0]?.payload?.fullLabel || '');
}

function SummaryCard({
  title,
  value,
  tone,
  subtitle
}: {
  title: string;
  value: string;
  tone: 'default' | 'income' | 'expense' | 'balance';
  subtitle?: React.ReactNode;
}) {
  const styles =
    tone === 'income'
      ? {
          card: 'border-emerald-900/60 bg-emerald-950/25',
          title: 'text-emerald-200/80',
          value: 'text-emerald-300'
        }
      : tone === 'expense'
        ? {
            card: 'border-red-900/60 bg-red-950/25',
            title: 'text-red-200/80',
            value: 'text-red-300'
          }
        : tone === 'balance'
          ? parseAmount(value) >= 0
            ? {
                card: 'border-sky-900/60 bg-sky-950/25',
                title: 'text-sky-200/80',
                value: 'text-sky-300'
              }
            : {
                card: 'border-red-900/60 bg-red-950/25',
                title: 'text-red-200/80',
                value: 'text-red-300'
              }
          : {
              card: 'border-gray-700 bg-slate-900/40',
              title: 'text-slate-300/80',
              value: 'text-slate-100'
            };

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles.card}`}>
      <div className={`text-[11px] font-medium uppercase tracking-wide ${styles.title}`}>{title}</div>
      <div className={`mt-1 text-xl font-semibold ${styles.value}`}>{formatCurrency(value)}</div>
      {subtitle ? <div className="mt-2 text-xs text-gray-400">{subtitle}</div> : null}
    </div>
  );
}

export default function FinancialDashboard() {
  const router = useRouter();
  const { addToast } = useToast();
  const currentMonth = getCurrentMonthKey();

  const [view, setView] = useState<FinancialDashboardView>('monthly');
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trackedExpenseCategoryIds, setTrackedExpenseCategoryIds] = useState<number[]>([]);
  const [trackedExpenseCategoryDraft, setTrackedExpenseCategoryDraft] = useState<string[]>([]);
  const [historyCategoryIds, setHistoryCategoryIds] = useState<string[]>([]);
  const [monthlyData, setMonthlyData] = useState<FinancialDashboardMonthlyResponse | null>(null);
  const [historyData, setHistoryData] = useState<FinancialDashboardHistoryResponse | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPieMode, setCategoryPieMode] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const nextView = normalizeView(router.query.view);
    const nextMonth = normalizeMonthKey(router.query.month, currentMonth);

    setView(nextView);
    setMonth(nextMonth);

    const shouldReplace = nextView !== router.query.view || nextMonth !== router.query.month;

    if (shouldReplace) {
      void router.replace(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            view: nextView,
            month: nextMonth
          }
        },
        undefined,
        { shallow: true }
      );
    }
  }, [currentMonth, router]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadingBootstrap(true);
      try {
        const [categoryResponse, preference] = await Promise.all([
          api.get('/financial/categories'),
          getVariableProjectionPreference()
        ]);

        if (cancelled) {
          return;
        }

        const nextCategories = (categoryResponse.data || []) as Category[];
        const nextTrackedIds = preference.trackedExpenseCategoryIds || [];

        setCategories(nextCategories);
        setTrackedExpenseCategoryIds(nextTrackedIds);
        setTrackedExpenseCategoryDraft(nextTrackedIds.map(String));
      } catch (bootstrapError: any) {
        if (!cancelled) {
          setError(
            bootstrapError.response?.data?.error || 'Erro ao carregar configurações do dashboard'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingBootstrap(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingBootstrap) {
      return;
    }

    let cancelled = false;

    async function loadMonthly() {
      setLoadingMonthly(true);
      setError(null);
      try {
        const response = await getFinancialDashboardMonthly(month);
        if (!cancelled) {
          setMonthlyData(response);
        }
      } catch (monthlyError: any) {
        if (!cancelled) {
          setError(monthlyError.response?.data?.error || 'Erro ao carregar visão mensal');
          setMonthlyData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingMonthly(false);
        }
      }
    }

    if (view === 'monthly') {
      void loadMonthly();
    }

    return () => {
      cancelled = true;
    };
  }, [loadingBootstrap, month, view]);

  useEffect(() => {
    if (loadingBootstrap || view !== 'history') {
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoadingHistory(true);
      setError(null);

      try {
        const response = await getFinancialDashboardHistory({
          months: 12,
          categoryIds: historyCategoryIds.map(Number)
        });

        if (!cancelled) {
          setHistoryData(response);
        }
      } catch (historyError: any) {
        if (!cancelled) {
          setError(historyError.response?.data?.error || 'Erro ao carregar histórico financeiro');
          setHistoryData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyCategoryIds, loadingBootstrap, view]);

  const expenseCategoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.type === 'EXPENSE')
        .map((category) => ({
          value: String(category.id),
          label: category.name
        })),
    [categories]
  );

  const historyCategoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.type === 'EXPENSE' || category.type === 'INCOME')
        .map((category) => ({
          value: String(category.id),
          label: `${category.name} (${category.type === 'EXPENSE' ? 'Despesa' : 'Receita'})`
        })),
    [categories]
  );

  const pieCategoryTotals = useMemo(() => {
    if (!monthlyData) {
      return [];
    }

    return monthlyData.categoryTotals.filter((category) => category.type === categoryPieMode);
  }, [categoryPieMode, monthlyData]);

  const monthlyBarData = useMemo(() => {
    if (!monthlyData) {
      return [];
    }

    const incomeRealized = parseAmount(monthlyData.currentMonthBreakdown.income.realized);
    const incomeRemaining = parseAmount(monthlyData.currentMonthBreakdown.income.remaining);
    const expenseRealized = parseAmount(monthlyData.currentMonthBreakdown.expense.realizedCommitted);
    const expenseRemainingCommitted = parseAmount(
      monthlyData.currentMonthBreakdown.expense.remainingCommitted
    );
    const expenseRemainingVariable = parseAmount(
      monthlyData.currentMonthBreakdown.expense.remainingVariableProjected
    );

    return [
      {
        name: 'Receitas',
        Realizado: monthlyData.isCurrentMonth ? incomeRealized : 0,
        Restante: monthlyData.isCurrentMonth
          ? incomeRemaining
          : parseAmount(monthlyData.monthlyTotals.incomeTotal),
        Comprometido: 0,
        Variavel: 0
      },
      {
        name: 'Saídas',
        Realizado: monthlyData.isCurrentMonth ? expenseRealized : 0,
        Restante: expenseRemainingCommitted,
        Comprometido: expenseRemainingCommitted,
        Variavel: expenseRemainingVariable
      }
    ];
  }, [monthlyData]);

  const historyTotalsData = useMemo(() => {
    if (!historyData) {
      return [];
    }

    return historyData.monthlyTotals.map((monthPoint) => ({
      label: formatShortMonthLabel(monthPoint.month),
      fullLabel: formatMonthLabel(monthPoint.month),
      Receitas: parseAmount(monthPoint.incomeTotal),
      Despesas: parseAmount(monthPoint.expenseTotal),
      parcial: monthPoint.isPartialCurrentMonth
    }));
  }, [historyData]);

  const historyCategoryChartData = useMemo(() => {
    if (!historyData || historyData.categorySeries.length === 0) {
      return [];
    }

    const months = historyData.monthlyTotals.map((item) => item.month);
    return months.map((monthKey) => {
      const base: Record<string, string | number> = {
        label: formatShortMonthLabel(monthKey),
        fullLabel: formatMonthLabel(monthKey)
      };

      historyData.categorySeries.forEach((series) => {
        const point = series.points.find((item) => item.month === monthKey);
        base[`category-${series.categoryId}`] = parseAmount(point?.amount || '0');
      });

      return base;
    });
  }, [historyData]);

  function syncRouterQuery(nextView: FinancialDashboardView, nextMonth: string) {
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          view: nextView,
          month: nextMonth
        }
      },
      undefined,
      { shallow: true }
    );
  }

  function handleViewChange(nextView: string) {
    const normalizedView = nextView === 'history' ? 'history' : 'monthly';
    setView(normalizedView);
    syncRouterQuery(normalizedView, month);
  }

  function handleMonthChange(offset: -1 | 1) {
    const nextMonth = addMonths(month, offset);
    if (nextMonth < currentMonth) {
      return;
    }

    setMonth(nextMonth);
    syncRouterQuery(view, nextMonth);
  }

  async function handleSaveTrackedCategories() {
    const nextIds = Array.from(new Set(trackedExpenseCategoryDraft.map(Number))).filter(Boolean);

    if (nextIds.length > 10) {
      addToast('Selecione no máximo 10 categorias', 'error');
      return;
    }

    setSavingPreference(true);
    try {
      const response = await updateVariableProjectionPreference(nextIds);
      setTrackedExpenseCategoryIds(response.trackedExpenseCategoryIds);
      setTrackedExpenseCategoryDraft(response.trackedExpenseCategoryIds.map(String));
      addToast('Categorias observadas atualizadas', 'success');

      if (view === 'monthly') {
        setLoadingMonthly(true);
        const refreshed = await getFinancialDashboardMonthly(month);
        setMonthlyData(refreshed);
      }
    } catch (saveError: any) {
      addToast(saveError.response?.data?.error || 'Erro ao salvar categorias observadas', 'error');
    } finally {
      setSavingPreference(false);
      setLoadingMonthly(false);
    }
  }

  function handleTrackedCategoryDraftChange(values: string[]) {
    if (values.length > 10) {
      addToast('Selecione no máximo 10 categorias', 'error');
      return;
    }

    setTrackedExpenseCategoryDraft(values);
  }

  const monthlyLoadingState = loadingBootstrap || loadingMonthly;
  const canGoBackMonth = month > currentMonth;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Dashboard financeiro
          </div>
          <h1 className="mt-1 text-2xl font-heading font-bold text-white">
            Visão analítica do caixa e das tendências do mês.
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            aria-label="Selecione a visão do dashboard"
            options={VIEW_OPTIONS}
            value={view}
            onChange={(event) => handleViewChange(event.target.value)}
          />

          <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#11161d] px-3 py-2">
            <CalendarRange size={16} className="text-accent" />
            <span className="text-sm text-gray-300">
              {view === 'monthly' ? formatMonthLabel(month) : 'Últimos 12 meses'}
            </span>
          </div>
        </div>
      </div>

      {error ? <Card className="p-4 text-danger">{error}</Card> : null}

      {view === 'monthly' ? (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <PieChartIcon size={16} className="text-accent" />
                  Situação financeira mensal
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  O mês atual parte do saldo real de hoje. Meses futuros carregam o saldo final
                  projetado do mês anterior.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <Button
                  variant="outline"
                  onClick={() => handleMonthChange(-1)}
                  disabled={!canGoBackMonth}
                  className="inline-flex items-center gap-1"
                >
                  <ChevronLeft size={15} />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleMonthChange(1)}
                  className="inline-flex items-center gap-1"
                >
                  Próximo
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </Card>

          {monthlyLoadingState ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : monthlyData ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <SummaryCard
                  title="Saldo base"
                  value={monthlyData.carryOver.amount}
                  tone="default"
                  subtitle={
                    monthlyData.carryOver.source === 'CURRENT_BALANCE'
                      ? 'Saldo real disponivel agora'
                      : 'Saldo final projetado do mês anterior'
                  }
                />
                <SummaryCard
                  title="Receitas do mês"
                  value={monthlyData.monthlyTotals.incomeTotal}
                  tone="income"
                  subtitle={
                    <>
                      Realizado: {formatCurrency(monthlyData.currentMonthBreakdown.income.realized)}
                      <br />
                      Restante: {formatCurrency(monthlyData.currentMonthBreakdown.income.remaining)}
                    </>
                  }
                />
                <SummaryCard
                  title="Saídas comprometidas"
                  value={monthlyData.monthlyTotals.committedExpenseTotal}
                  tone="expense"
                  subtitle={
                    <>
                      Realizado: {formatCurrency(monthlyData.currentMonthBreakdown.expense.realizedCommitted)}
                      <br />
                      Restante: {formatCurrency(monthlyData.currentMonthBreakdown.expense.remainingCommitted)}
                    </>
                  }
                />
                <SummaryCard
                  title="Variáveis estimadas"
                  value={monthlyData.monthlyTotals.variableProjectedExpenseTotal}
                  tone="expense"
                  subtitle={
                    trackedExpenseCategoryIds.length > 0
                      ? `${monthlyData.variableProjection.categories.length} categoria(s) com projeção restante`
                      : 'Configure categorias observadas'
                  }
                />
                <SummaryCard
                  title="Saldo final projetado"
                  value={monthlyData.projectedEndingBalance}
                  tone="balance"
                  subtitle={
                    monthlyData.isCurrentMonth
                      ? 'Saldo atual + movimentos restantes'
                      : 'Carry-over projetado + movimentos do mês'
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.95fr)]">
                <Card className="p-5">
                  <h3 className="text-lg font-medium text-white">Composição do mês</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Receitas conhecidas, saídas comprometidas e estimativa restante das categorias observadas.
                  </p>
                  <div className="mt-5 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyBarData} margin={{ top: 12, right: 18, left: 6, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#243041" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={buildTooltipStyle()}
                          formatter={(value) => formatCurrency(Number(value))}
                        />
                        <Legend />
                        <Bar dataKey="Realizado" stackId="stack" fill="#38bdf8" />
                        <Bar dataKey="Restante" stackId="stack" fill="#22c55e" />
                        <Bar dataKey="Variavel" stackId="stack" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-medium text-white">Categorias do mês</h3>
                      <p className="mt-1 text-sm text-gray-400">
                        Distribuição final do mês no cenário projetado.
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-gray-700 bg-[#11161d] p-1">
                      <button
                        type="button"
                        onClick={() => setCategoryPieMode('EXPENSE')}
                        className={`rounded-md px-3 py-1.5 text-sm ${
                          categoryPieMode === 'EXPENSE'
                            ? 'bg-red-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Despesas
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryPieMode('INCOME')}
                        className={`rounded-md px-3 py-1.5 text-sm ${
                          categoryPieMode === 'INCOME'
                            ? 'bg-green-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Receitas
                      </button>
                    </div>
                  </div>

                  {pieCategoryTotals.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-400">
                      Nenhuma categoria encontrada para esta leitura do mês.
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-4">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieCategoryTotals} dataKey="amount" nameKey="name" outerRadius={82}>
                              {pieCategoryTotals.map((category) => (
                                <Cell
                                  key={`${categoryPieMode}-${category.categoryId ?? category.name}`}
                                  fill={category.color}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) => formatCurrency(Number(value))}
                              contentStyle={buildTooltipStyle()}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {pieCategoryTotals.map((category) => (
                          <div
                            key={`${categoryPieMode}-${category.categoryId ?? category.name}-legend`}
                            className="flex items-center gap-3 text-sm"
                          >
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="flex-1 text-gray-300">{category.name}</span>
                            <span className="font-medium text-white">
                              {formatCurrency(category.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.08fr)]">
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-lg font-medium text-white">
                        <Settings2 size={16} className="text-accent" />
                        Categorias observadas
                      </div>
                      <p className="mt-1 text-sm text-gray-400">
                        Esta configuração é central do domínio financeiro e será reutilizável em
                        outras superfícies.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <MultiSelect
                      label="Despesas variáveis observadas"
                      options={expenseCategoryOptions}
                      values={trackedExpenseCategoryDraft}
                      onChange={handleTrackedCategoryDraftChange}
                      placeholder="Selecione até 10 categorias"
                      triggerClassName="h-10"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                      <span>{trackedExpenseCategoryDraft.length}/10 selecionadas</span>
                      <Button
                        variant="accent"
                        onClick={() => void handleSaveTrackedCategories()}
                        disabled={savingPreference}
                        className="inline-flex items-center gap-2"
                      >
                        {savingPreference ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar categorias
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="text-lg font-medium text-white">Variáveis estimadas por categoria</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    A média usa os 6 meses fechados anteriores. O restante some quando a categoria
                    já consumiu toda a média no mês.
                  </p>

                  {monthlyData.variableProjection.categories.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-400">
                      {trackedExpenseCategoryIds.length === 0
                        ? 'Selecione categorias observadas para gerar a estimativa variável.'
                        : 'Nenhuma categoria observada possui projeção restante neste mês.'}
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[640px]">
                        <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                          <tr>
                            <th className="px-3 py-3 text-left">Categoria</th>
                            <th className="px-3 py-3 text-right">Média 6 meses</th>
                            <th className="px-3 py-3 text-right">Já comprometido</th>
                            <th className="px-3 py-3 text-right">Restante projetado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyData.variableProjection.categories.map((item) => (
                            <tr key={item.categoryId} className="border-t border-gray-800">
                              <td className="px-3 py-3 text-sm text-gray-200">
                                <span
                                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {item.categoryName}
                              </td>
                              <td className="px-3 py-3 text-right text-sm text-gray-300">
                                {formatCurrency(item.historicalAverage)}
                              </td>
                              <td className="px-3 py-3 text-right text-sm text-gray-300">
                                {formatCurrency(item.committedInMonth)}
                              </td>
                              <td className="px-3 py-3 text-right text-sm font-medium text-amber-300">
                                {formatCurrency(item.remainingProjected)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <LineChartIcon size={16} className="text-accent" />
                  Histórico financeiro
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Evolução mensal das receitas, despesas e das categorias escolhidas para análise.
                </p>
              </div>

              <div className="min-w-[280px]">
                <MultiSelect
                  label="Categorias no gráfico"
                  options={historyCategoryOptions}
                  values={historyCategoryIds}
                  onChange={setHistoryCategoryIds}
                  placeholder="Selecione categorias para comparar"
                  triggerClassName="h-10"
                  className="mb-0"
                />
              </div>
            </div>
          </Card>

          {loadingBootstrap || loadingHistory ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Skeleton className="h-[360px] rounded-xl" />
              <Skeleton className="h-[360px] rounded-xl" />
            </div>
          ) : historyData ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card className="p-5">
                <h3 className="text-lg font-medium text-white">Receitas x despesas</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Últimos 12 meses, com o mês atual marcado como parcial.
                </p>
                <div className="mt-5 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyTotalsData} margin={{ top: 12, right: 18, left: 6, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#243041" />
                      <XAxis dataKey="label" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={buildTooltipStyle()}
                        formatter={(value) => formatCurrency(Number(value))}
                        labelFormatter={formatTooltipLabel}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-lg font-medium text-white">Categorias selecionadas</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Começa vazio por padrão. Adicione as categorias que deseja acompanhar.
                </p>

                {historyData.categorySeries.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-gray-700 px-4 py-10 text-center text-sm text-gray-400">
                    Nenhuma categoria selecionada para o gráfico histórico.
                  </div>
                ) : (
                  <div className="mt-5 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyCategoryChartData} margin={{ top: 12, right: 18, left: 6, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#243041" />
                        <XAxis dataKey="label" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={buildTooltipStyle()}
                          formatter={(value) => formatCurrency(Number(value))}
                          labelFormatter={formatTooltipLabel}
                        />
                        <Legend />
                        {historyData.categorySeries.map((series) => (
                          <Line
                            key={series.categoryId}
                            type="monotone"
                            dataKey={`category-${series.categoryId}`}
                            stroke={series.color}
                            strokeWidth={2.25}
                            dot={false}
                            name={series.name}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
