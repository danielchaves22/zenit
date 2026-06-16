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
  ChevronDown,
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
import { Input } from '@/components/ui/Input';
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

type CategoryPieMode = 'EXPENSE' | 'INCOME';
type CategoryPieBreakdownMode = 'CATEGORY' | 'SUBCATEGORY';

type PieLegendChildDatum = {
  id: string;
  label: string;
  fullLabel: string;
  color: string;
  value: number;
  share: number;
  categoryIds: number[];
  isDirectCategory: boolean;
};

type PieCategoryDatum = {
  id: string;
  categoryId: number | null;
  name: string;
  fullLabel: string;
  color: string;
  type: CategoryPieMode;
  value: number;
  share: number;
  realizedAmount: number;
  pendingAmount: number;
  projectedAmount: number;
  categoryIds: number[];
  isOther: boolean;
  isUncategorized: boolean;
  children: PieLegendChildDatum[];
  hasChildBreakdown: boolean;
};

const VIEW_OPTIONS: Array<{ value: FinancialDashboardView; label: string }> = [
  { value: 'monthly', label: 'Situacao financeira mensal' },
  { value: 'history', label: 'Historico financeiro' }
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
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '12px',
    color: '#f8fafc',
    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.45)'
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

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function getVisibleCategoryAmount(params: {
  realizedAmount: number;
  pendingAmount: number;
  projectedAmount: number;
  includePending: boolean;
  includeProjected: boolean;
}): number {
  return (
    params.realizedAmount +
    (params.includePending ? params.pendingAmount : 0) +
    (params.includeProjected ? params.projectedAmount : 0)
  );
}

function dedupeNumberIds(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));
}

function buildCategoryPieSummary(params: {
  includePending: boolean;
  includeProjected: boolean;
}): string {
  const visibleBuckets = ['liquidadas'];

  if (params.includePending) {
    visibleBuckets.push('pendentes');
  }

  if (params.includeProjected) {
    visibleBuckets.push('projetadas');
  }

  return visibleBuckets.join(' + ');
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

function buildCategoryPieData(params: {
  categoryTotals: FinancialDashboardMonthlyResponse['categoryTotals'];
  categories: Category[];
  categoryPieMode: CategoryPieMode;
  includePending: boolean;
  includeProjected: boolean;
  smallSliceThresholdPercent: number;
  categoryPieBreakdownMode: CategoryPieBreakdownMode;
}): PieCategoryDatum[] {
  const categoriesById = new Map(params.categories.map((category) => [category.id, category]));
  const childrenByParentId = new Map<number, Category[]>();

  params.categories.forEach((category) => {
    const parentId = category.parentId ?? null;

    if (parentId === null) {
      return;
    }

    const siblings = childrenByParentId.get(parentId) || [];
    siblings.push(category);
    childrenByParentId.set(parentId, siblings);
  });

  const visibleCategories = params.categoryTotals
    .filter((category) => category.type === params.categoryPieMode)
    .map((category) => {
      const realizedAmount = parseAmount(category.realizedAmount);
      const pendingAmount = parseAmount(category.pendingAmount);
      const projectedAmount = parseAmount(category.projectedAmount);
      const categoryMeta =
        category.categoryId !== null ? categoriesById.get(category.categoryId) ?? null : null;
      const parentCategory =
        categoryMeta?.parentId != null ? categoriesById.get(categoryMeta.parentId) ?? null : null;
      const hasChildren =
        categoryMeta?.id != null ? (childrenByParentId.get(categoryMeta.id)?.length ?? 0) > 0 : false;
      const value = getVisibleCategoryAmount({
        realizedAmount,
        pendingAmount,
        projectedAmount,
        includePending: params.includePending,
        includeProjected: params.includeProjected
      });

      return {
        id: `${params.categoryPieMode}-${category.categoryId ?? 'uncategorized'}`,
        categoryId: category.categoryId,
        name: category.name,
        color: category.color,
        type: params.categoryPieMode,
        value,
        realizedAmount,
        pendingAmount,
        projectedAmount,
        categoryMeta,
        parentCategory,
        hasChildren
      };
    })
    .filter((category) => category.value > 0)
    .sort((left, right) => right.value - left.value);

  type PieCategoryAccumulator = {
    id: string;
    categoryId: number | null;
    name: string;
    fullLabel: string;
    color: string;
    type: CategoryPieMode;
    value: number;
    realizedAmount: number;
    pendingAmount: number;
    projectedAmount: number;
    categoryIds: number[];
    isUncategorized: boolean;
    childrenById: Map<string, PieLegendChildDatum>;
  };

  const pieAccumulators = new Map<string, PieCategoryAccumulator>();

  const upsertAccumulator = (paramsForAccumulator: {
    id: string;
    categoryId: number | null;
    name: string;
    fullLabel: string;
    color: string;
    type: CategoryPieMode;
    sourceCategoryId: number | null;
    value: number;
    realizedAmount: number;
    pendingAmount: number;
    projectedAmount: number;
    child?: Omit<PieLegendChildDatum, 'share'>;
  }) => {
    const existing =
      pieAccumulators.get(paramsForAccumulator.id) ??
      {
        id: paramsForAccumulator.id,
        categoryId: paramsForAccumulator.categoryId,
        name: paramsForAccumulator.name,
        fullLabel: paramsForAccumulator.fullLabel,
        color: paramsForAccumulator.color,
        type: paramsForAccumulator.type,
        value: 0,
        realizedAmount: 0,
        pendingAmount: 0,
        projectedAmount: 0,
        categoryIds: [],
        isUncategorized: paramsForAccumulator.categoryId === null,
        childrenById: new Map<string, PieLegendChildDatum>()
      };

    existing.value += paramsForAccumulator.value;
    existing.realizedAmount += paramsForAccumulator.realizedAmount;
    existing.pendingAmount += paramsForAccumulator.pendingAmount;
    existing.projectedAmount += paramsForAccumulator.projectedAmount;

    if (typeof paramsForAccumulator.sourceCategoryId === 'number') {
      existing.categoryIds.push(paramsForAccumulator.sourceCategoryId);
    }

    if (paramsForAccumulator.child) {
      const currentChild = existing.childrenById.get(paramsForAccumulator.child.id);

      if (currentChild) {
        currentChild.value += paramsForAccumulator.child.value;
        currentChild.categoryIds = dedupeNumberIds([
          ...currentChild.categoryIds,
          ...paramsForAccumulator.child.categoryIds
        ]);
      } else {
        existing.childrenById.set(paramsForAccumulator.child.id, {
          ...paramsForAccumulator.child,
          categoryIds: dedupeNumberIds(paramsForAccumulator.child.categoryIds),
          share: 0
        });
      }
    }

    pieAccumulators.set(paramsForAccumulator.id, existing);
  };

  visibleCategories.forEach((category) => {
    if (category.categoryId === null) {
      upsertAccumulator({
        id: `${params.categoryPieMode}-uncategorized`,
        categoryId: null,
        name: category.name,
        fullLabel: category.name,
        color: category.color,
        type: params.categoryPieMode,
        sourceCategoryId: null,
        value: category.value,
        realizedAmount: category.realizedAmount,
        pendingAmount: category.pendingAmount,
        projectedAmount: category.projectedAmount
      });
      return;
    }

    const parentCategory = category.parentCategory;

    if (
      params.categoryPieBreakdownMode === 'CATEGORY' &&
      parentCategory &&
      parentCategory.type === category.type
    ) {
      upsertAccumulator({
        id: `${params.categoryPieMode}-${parentCategory.id}`,
        categoryId: parentCategory.id,
        name: parentCategory.name,
        fullLabel: parentCategory.name,
        color: parentCategory.color || category.color,
        type: params.categoryPieMode,
        sourceCategoryId: category.categoryId,
        value: category.value,
        realizedAmount: category.realizedAmount,
        pendingAmount: category.pendingAmount,
        projectedAmount: category.projectedAmount,
        child: {
          id: `${params.categoryPieMode}-${parentCategory.id}-child-${category.categoryId}`,
          label: category.name,
          fullLabel: `${parentCategory.name} / ${category.name}`,
          color: category.color,
          value: category.value,
          categoryIds: [category.categoryId],
          isDirectCategory: false
        }
      });
      return;
    }

    const fullLabel =
      params.categoryPieBreakdownMode === 'SUBCATEGORY' &&
      parentCategory &&
      parentCategory.type === category.type
        ? `${parentCategory.name} / ${category.name}`
        : category.name;

    upsertAccumulator({
      id: category.id,
      categoryId: category.categoryId,
      name: fullLabel,
      fullLabel,
      color: category.color,
      type: params.categoryPieMode,
      sourceCategoryId: category.categoryId,
      value: category.value,
      realizedAmount: category.realizedAmount,
      pendingAmount: category.pendingAmount,
      projectedAmount: category.projectedAmount,
      child:
        params.categoryPieBreakdownMode === 'CATEGORY' && category.hasChildren
          ? {
              id: `${category.id}-direct`,
              label: 'Sem subcategoria',
              fullLabel: `${category.name} / Sem subcategoria`,
              color: category.color,
              value: category.value,
              categoryIds: [category.categoryId],
              isDirectCategory: true
            }
          : undefined
    });
  });

  const aggregatedCategories = Array.from(pieAccumulators.values())
    .map<PieCategoryDatum>((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      fullLabel: item.fullLabel,
      color: item.color,
      type: item.type,
      value: item.value,
      share: 0,
      realizedAmount: item.realizedAmount,
      pendingAmount: item.pendingAmount,
      projectedAmount: item.projectedAmount,
      categoryIds: dedupeNumberIds(item.categoryIds),
      isOther: false,
      isUncategorized: item.isUncategorized,
      children: Array.from(item.childrenById.values())
        .sort((left, right) => right.value - left.value)
        .map((child) => ({
          ...child,
          share: 0
        })),
      hasChildBreakdown: Array.from(item.childrenById.values()).some(
        (child) => !child.isDirectCategory
      )
    }))
    .sort((left, right) => right.value - left.value);

  const total = aggregatedCategories.reduce((sum, category) => sum + category.value, 0);
  if (total <= 0) {
    return [];
  }

  const thresholdRatio = Math.max(0, params.smallSliceThresholdPercent) / 100;
  const groupedCategories: PieCategoryDatum[] = [];
  let otherCategory: PieCategoryDatum | null = null;

  for (const category of aggregatedCategories) {
    const share = category.value / total;
    const shouldGroup =
      thresholdRatio > 0 &&
      !category.isUncategorized &&
      category.categoryIds.length > 0 &&
      share < thresholdRatio;

    if (!shouldGroup) {
      groupedCategories.push({
        ...category,
        share,
        children: category.children.map((child) => ({
          ...child,
          share: child.value / total
        }))
      });
      continue;
    }

    if (!otherCategory) {
      otherCategory = {
        id: `${params.categoryPieMode}-other`,
        categoryId: null,
        name: params.categoryPieMode === 'EXPENSE' ? 'Outras despesas' : 'Outras receitas',
        fullLabel: params.categoryPieMode === 'EXPENSE' ? 'Outras despesas' : 'Outras receitas',
        color: '#475569',
        type: params.categoryPieMode,
        value: 0,
        share: 0,
        realizedAmount: 0,
        pendingAmount: 0,
        projectedAmount: 0,
        categoryIds: [],
        isOther: true,
        isUncategorized: false,
        children: [],
        hasChildBreakdown: false
      };
    }

    otherCategory.value += category.value;
    otherCategory.realizedAmount += category.realizedAmount;
    otherCategory.pendingAmount += category.pendingAmount;
    otherCategory.projectedAmount += category.projectedAmount;
    otherCategory.categoryIds = dedupeNumberIds([
      ...otherCategory.categoryIds,
      ...category.categoryIds
    ]);
  }

  if (otherCategory && otherCategory.value > 0) {
    otherCategory.share = otherCategory.value / total;
    groupedCategories.push(otherCategory);
  }

  return groupedCategories.sort((left, right) => right.value - left.value);
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
  const [categoryPieMode, setCategoryPieMode] = useState<CategoryPieMode>('EXPENSE');
  const [categoryPieBreakdownMode, setCategoryPieBreakdownMode] =
    useState<CategoryPieBreakdownMode>('CATEGORY');
  const [includePendingInCategoryPie, setIncludePendingInCategoryPie] = useState(false);
  const [includeProjectedInCategoryPie, setIncludeProjectedInCategoryPie] = useState(false);
  const [smallSliceThresholdPercent, setSmallSliceThresholdPercent] = useState(3);
  const [smallSliceThresholdPercentDraft, setSmallSliceThresholdPercentDraft] = useState(3);
  const [expandedPieLegendIds, setExpandedPieLegendIds] = useState<Record<string, boolean>>({});

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
        const nextSmallSliceThresholdPercent = preference.smallSliceThresholdPercent ?? 3;

        setCategories(nextCategories);
        setTrackedExpenseCategoryIds(nextTrackedIds);
        setTrackedExpenseCategoryDraft(nextTrackedIds.map(String));
        setSmallSliceThresholdPercent(nextSmallSliceThresholdPercent);
        setSmallSliceThresholdPercentDraft(nextSmallSliceThresholdPercent);
      } catch (bootstrapError: any) {
        if (!cancelled) {
          setError(
            bootstrapError.response?.data?.error || 'Erro ao carregar configuracoes do dashboard'
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
    if (loadingBootstrap || view !== 'monthly') {
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
          setError(monthlyError.response?.data?.error || 'Erro ao carregar visao mensal');
          setMonthlyData(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingMonthly(false);
        }
      }
    }

    void loadMonthly();

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
          setError(historyError.response?.data?.error || 'Erro ao carregar historico financeiro');
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

    return buildCategoryPieData({
      categoryTotals: monthlyData.categoryTotals,
      categories,
      categoryPieMode,
      includePending: includePendingInCategoryPie,
      includeProjected: includeProjectedInCategoryPie,
      smallSliceThresholdPercent: smallSliceThresholdPercentDraft,
      categoryPieBreakdownMode
    });
  }, [
    categories,
    categoryPieMode,
    categoryPieBreakdownMode,
    includePendingInCategoryPie,
    includeProjectedInCategoryPie,
    monthlyData,
    smallSliceThresholdPercentDraft
  ]);

  const pieCategoryTotalAmount = useMemo(
    () => pieCategoryTotals.reduce((sum, category) => sum + category.value, 0),
    [pieCategoryTotals]
  );

  const pieCategorySummary = useMemo(
    () =>
      buildCategoryPieSummary({
        includePending: includePendingInCategoryPie,
        includeProjected: includeProjectedInCategoryPie
      }),
    [includePendingInCategoryPie, includeProjectedInCategoryPie]
  );

  const hasPreferenceChanges = useMemo(() => {
    const savedIds = [...trackedExpenseCategoryIds].sort((left, right) => left - right);
    const draftIds = trackedExpenseCategoryDraft
      .map(Number)
      .filter(Boolean)
      .sort((left, right) => left - right);

    if (savedIds.length !== draftIds.length) {
      return true;
    }

    if (savedIds.some((value, index) => value !== draftIds[index])) {
      return true;
    }

    return smallSliceThresholdPercentDraft !== smallSliceThresholdPercent;
  }, [
    smallSliceThresholdPercent,
    smallSliceThresholdPercentDraft,
    trackedExpenseCategoryDraft,
    trackedExpenseCategoryIds
  ]);

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
        name: 'Saidas',
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
    const nextSmallSliceThresholdPercent = Math.max(0, Math.min(25, smallSliceThresholdPercentDraft));

    if (nextIds.length > 10) {
      addToast('Selecione no maximo 10 categorias', 'error');
      return;
    }

    setSavingPreference(true);
    try {
      const response = await updateVariableProjectionPreference({
        trackedExpenseCategoryIds: nextIds,
        smallSliceThresholdPercent: nextSmallSliceThresholdPercent
      });

      setTrackedExpenseCategoryIds(response.trackedExpenseCategoryIds);
      setTrackedExpenseCategoryDraft(response.trackedExpenseCategoryIds.map(String));
      setSmallSliceThresholdPercent(response.smallSliceThresholdPercent);
      setSmallSliceThresholdPercentDraft(response.smallSliceThresholdPercent);
      addToast('Preferencias do dashboard atualizadas', 'success');

      if (view === 'monthly') {
        setLoadingMonthly(true);
        const refreshed = await getFinancialDashboardMonthly(month);
        setMonthlyData(refreshed);
      }
    } catch (saveError: any) {
      addToast(saveError.response?.data?.error || 'Erro ao salvar preferencias do dashboard', 'error');
    } finally {
      setSavingPreference(false);
      setLoadingMonthly(false);
    }
  }

  function handleTrackedCategoryDraftChange(values: string[]) {
    if (values.length > 10) {
      addToast('Selecione no maximo 10 categorias', 'error');
      return;
    }

    setTrackedExpenseCategoryDraft(values);
  }

  function handleSmallSliceThresholdChange(value: string) {
    if (value === '') {
      setSmallSliceThresholdPercentDraft(0);
      return;
    }

    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      return;
    }

    setSmallSliceThresholdPercentDraft(Math.max(0, Math.min(25, parsedValue)));
  }

  function togglePieLegendExpansion(categoryId: string) {
    setExpandedPieLegendIds((current) => ({
      ...current,
      [categoryId]: !current[categoryId]
    }));
  }

  function openTransactionsForCategory(categoryIds: number[]) {
    if (!monthlyData) {
      return;
    }

    const normalizedCategoryIds = dedupeNumberIds(categoryIds);
    if (normalizedCategoryIds.length === 0) {
      return;
    }

    const query: Record<string, string | string[]> = {
      startDate: monthlyData.period.startDate.slice(0, 10),
      endDate: monthlyData.period.endDate.slice(0, 10),
      dateField: 'dueDate',
      showOnlyMaterialized: includeProjectedInCategoryPie ? 'false' : 'true'
    };

    if (!includePendingInCategoryPie && !includeProjectedInCategoryPie) {
      query.status = 'COMPLETED';
    }

    if (normalizedCategoryIds.length === 1) {
      query.categoryId = String(normalizedCategoryIds[0]);
    } else {
      query.categoryIds = normalizedCategoryIds.map(String);
    }

    void router.push({
      pathname: '/financial/transactions',
      query
    });
  }

  const monthlyLoadingState = loadingBootstrap || loadingMonthly;
  const canGoBackMonth = month > currentMonth;

  useEffect(() => {
    setExpandedPieLegendIds((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([categoryId]) =>
          pieCategoryTotals.some((category) => category.id === categoryId)
        )
      )
    );
  }, [pieCategoryTotals]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Dashboard financeiro
          </div>
          <h1 className="mt-1 text-2xl font-heading font-bold text-white">
            Visao analitica do caixa e das tendencias do mes.
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            aria-label="Selecione a visao do dashboard"
            options={VIEW_OPTIONS}
            value={view}
            onChange={(event) => handleViewChange(event.target.value)}
          />

          <div className="flex items-center gap-2 rounded-xl border border-gray-700 bg-[#11161d] px-3 py-2">
            <CalendarRange size={16} className="text-accent" />
            <span className="text-sm text-gray-300">
              {view === 'monthly' ? formatMonthLabel(month) : 'Ultimos 12 meses'}
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
                  Situacao financeira mensal
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  O mes atual parte do saldo real de hoje. Meses futuros carregam o saldo final
                  projetado do mes anterior.
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
                  Proximo
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
                      : 'Saldo final projetado do mes anterior'
                  }
                />
                <SummaryCard
                  title="Receitas do mes"
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
                  title="Saidas comprometidas"
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
                  title="Variaveis estimadas"
                  value={monthlyData.monthlyTotals.variableProjectedExpenseTotal}
                  tone="expense"
                  subtitle={
                    trackedExpenseCategoryIds.length > 0
                      ? `${monthlyData.variableProjection.categories.length} categoria(s) com projecao restante`
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
                      : 'Carry-over projetado + movimentos do mes'
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.35fr)]">
                <Card className="p-5">
                  <h3 className="text-lg font-medium text-white">Composicao do mes</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Receitas conhecidas, saidas comprometidas e estimativa restante das categorias observadas.
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
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-white">
                          {categoryPieMode === 'EXPENSE' ? 'Gastos por categoria' : 'Receitas por categoria'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-400">
                          Distribuicao por categoria considerando {pieCategorySummary}. Compras no
                          cartao seguem a competencia da fatura.
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

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setIncludePendingInCategoryPie((current) => !current)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          includePendingInCategoryPie
                            ? 'border-sky-500 bg-sky-500/15 text-sky-100'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        Incluir pendentes
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncludeProjectedInCategoryPie((current) => !current)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          includeProjectedInCategoryPie
                            ? 'border-amber-500 bg-amber-500/15 text-amber-100'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        Incluir projetadas
                      </button>
                      <div className="flex rounded-full border border-gray-700 bg-[#11161d] p-1">
                        <button
                          type="button"
                          onClick={() => setCategoryPieBreakdownMode('CATEGORY')}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            categoryPieBreakdownMode === 'CATEGORY'
                              ? 'bg-slate-200 text-slate-950'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Agrupar subcategorias
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryPieBreakdownMode('SUBCATEGORY')}
                          className={`rounded-full px-3 py-1.5 text-sm transition ${
                            categoryPieBreakdownMode === 'SUBCATEGORY'
                              ? 'bg-slate-200 text-slate-950'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          Quebrar em subcategorias
                        </button>
                      </div>
                    </div>
                  </div>

                  {pieCategoryTotals.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-dashed border-gray-700 px-4 py-10 text-center text-sm text-gray-400">
                      Nenhuma categoria encontrada para esta leitura do mes.
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(340px,1.05fr)_minmax(300px,0.95fr)] xl:items-center">
                      <div className="relative h-[360px]">
                        <div className="relative z-20 h-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieCategoryTotals}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={82}
                                outerRadius={132}
                                paddingAngle={pieCategoryTotals.length > 1 ? 2 : 0}
                              >
                                {pieCategoryTotals.map((category) => (
                                  <Cell key={category.id} fill={category.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value) => formatCurrency(Number(value))}
                                contentStyle={buildTooltipStyle()}
                                wrapperStyle={{ zIndex: 40 }}
                                labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
                                itemStyle={{ color: '#f8fafc' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                              Total exibido
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-white">
                              {formatCurrency(pieCategoryTotalAmount)}
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                              Fatias abaixo de {smallSliceThresholdPercentDraft}% entram em{' '}
                              {categoryPieMode === 'EXPENSE' ? 'Outras despesas' : 'Outras receitas'}.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5" data-testid="category-pie-legend">
                        {pieCategoryTotals.map((category) => {
                          const isExpanded = Boolean(expandedPieLegendIds[category.id]);
                          const canNavigate = category.categoryIds.length > 0;

                          return (
                            <div
                              key={`${category.id}-legend`}
                              className="rounded-xl border border-gray-800 bg-[#0f1419] px-3 py-2.5"
                            >
                              <div className="flex items-center gap-2">
                                {canNavigate ? (
                                  <button
                                    type="button"
                                    onClick={() => openTransactionsForCategory(category.categoryIds)}
                                    className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                                  >
                                    <span
                                      className="inline-block h-3 w-3 rounded-full"
                                      style={{ backgroundColor: category.color }}
                                    />
                                    <span
                                      className="min-w-0 flex-1 truncate text-sm text-gray-200 transition group-hover:text-white"
                                      title={category.fullLabel}
                                    >
                                      {category.name}
                                    </span>
                                    <span className="text-[11px] tabular-nums text-gray-500">
                                      {formatPercent(category.share * 100)}
                                    </span>
                                    <span className="text-sm font-semibold tabular-nums text-white">
                                      {formatCurrency(category.value)}
                                    </span>
                                  </button>
                                ) : (
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                      className="inline-block h-3 w-3 rounded-full"
                                      style={{ backgroundColor: category.color }}
                                    />
                                    <span
                                      className="min-w-0 flex-1 truncate text-sm text-gray-200"
                                      title={category.fullLabel}
                                    >
                                      {category.name}
                                    </span>
                                    <span className="text-[11px] tabular-nums text-gray-500">
                                      {formatPercent(category.share * 100)}
                                    </span>
                                    <span className="text-sm font-semibold tabular-nums text-white">
                                      {formatCurrency(category.value)}
                                    </span>
                                  </div>
                                )}

                                {category.hasChildBreakdown ? (
                                  <button
                                    type="button"
                                    onClick={() => togglePieLegendExpansion(category.id)}
                                    className="rounded-md p-1 text-gray-500 transition hover:bg-slate-800 hover:text-white"
                                    aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${category.name}`}
                                  >
                                    <ChevronDown
                                      size={16}
                                      className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                                    />
                                  </button>
                                ) : null}
                              </div>

                              {isExpanded ? (
                                <div className="mt-2 space-y-1 border-t border-gray-800 pt-2">
                                  {category.children.map((child) => {
                                    const canNavigateChild = child.categoryIds.length > 0;

                                    return canNavigateChild ? (
                                      <button
                                        key={child.id}
                                        type="button"
                                        onClick={() => openTransactionsForCategory(child.categoryIds)}
                                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-900/80"
                                      >
                                        <span
                                          className="ml-4 inline-block h-2.5 w-2.5 rounded-full"
                                          style={{ backgroundColor: child.color }}
                                        />
                                        <span
                                          className="min-w-0 flex-1 truncate text-sm text-gray-400 transition group-hover:text-gray-200"
                                          title={child.fullLabel}
                                        >
                                          {child.label}
                                        </span>
                                        <span className="text-[11px] tabular-nums text-gray-500">
                                          {formatPercent(child.share * 100)}
                                        </span>
                                        <span className="text-sm font-medium tabular-nums text-gray-200">
                                          {formatCurrency(child.value)}
                                        </span>
                                      </button>
                                    ) : (
                                      <div
                                        key={child.id}
                                        className="flex items-center gap-2 rounded-lg px-2 py-1"
                                      >
                                        <span
                                          className="ml-4 inline-block h-2.5 w-2.5 rounded-full"
                                          style={{ backgroundColor: child.color }}
                                        />
                                        <span
                                          className="min-w-0 flex-1 truncate text-sm text-gray-400"
                                          title={child.fullLabel}
                                        >
                                          {child.label}
                                        </span>
                                        <span className="text-[11px] tabular-nums text-gray-500">
                                          {formatPercent(child.share * 100)}
                                        </span>
                                        <span className="text-sm font-medium tabular-nums text-gray-200">
                                          {formatCurrency(child.value)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
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
                        Preferencias do dashboard
                      </div>
                      <p className="mt-1 text-sm text-gray-400">
                        Configure as categorias observadas e a regra de agrupamento das fatias menores.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <MultiSelect
                      label="Despesas variaveis observadas"
                      options={expenseCategoryOptions}
                      values={trackedExpenseCategoryDraft}
                      onChange={handleTrackedCategoryDraftChange}
                      placeholder="Selecione ate 10 categorias"
                      triggerClassName="h-10"
                    />
                    <Input
                      id="small-slice-threshold"
                      label="Agrupar fatias menores que (%)"
                      type="number"
                      min={0}
                      max={25}
                      step={1}
                      value={smallSliceThresholdPercentDraft}
                      onChange={(event) => handleSmallSliceThresholdChange(event.target.value)}
                      className="mb-0"
                    />
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                      <span>
                        {trackedExpenseCategoryDraft.length}/10 categorias observadas · agrupamento abaixo de{' '}
                        {smallSliceThresholdPercentDraft}%
                      </span>
                      <Button
                        variant="accent"
                        onClick={() => void handleSaveTrackedCategories()}
                        disabled={savingPreference || !hasPreferenceChanges}
                        className="inline-flex items-center gap-2"
                      >
                        {savingPreference ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar preferencias
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="text-lg font-medium text-white">Variaveis estimadas por categoria</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    A media usa os 6 meses fechados anteriores. O restante some quando a categoria ja
                    consumiu toda a media no mes.
                  </p>

                  {monthlyData.variableProjection.categories.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-400">
                      {trackedExpenseCategoryIds.length === 0
                        ? 'Selecione categorias observadas para gerar a estimativa variavel.'
                        : 'Nenhuma categoria observada possui projecao restante neste mes.'}
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[640px]">
                        <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                          <tr>
                            <th className="px-3 py-3 text-left">Categoria</th>
                            <th className="px-3 py-3 text-right">Media 6 meses</th>
                            <th className="px-3 py-3 text-right">Ja comprometido</th>
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
                  Historico financeiro
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Evolucao mensal das receitas, despesas e das categorias escolhidas para analise.
                </p>
              </div>

              <div className="min-w-[280px]">
                <MultiSelect
                  label="Categorias no grafico"
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
                  Ultimos 12 meses, com o mes atual marcado como parcial.
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
                  Comeca vazio por padrao. Adicione as categorias que deseja acompanhar.
                </p>

                {historyData.categorySeries.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-gray-700 px-4 py-10 text-center text-sm text-gray-400">
                    Nenhuma categoria selecionada para o grafico historico.
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
