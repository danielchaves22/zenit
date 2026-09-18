import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarX2,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Repeat2,
  Save,
  Target,
  Trash2,
  TrendingUp
} from 'lucide-react';
import CategorySelect, { CategoryOption } from '@/components/financial/CategorySelect';
import { CategoryIcon } from '@/utils/categoryIcons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import {
  MonthlyCategoryBudgetItem,
  MonthlyCategoryBudgetKind,
  MonthlyCategoryBudgetResponse,
  MonthlyCategoryBudgetStatus,
  createMonthlyCategoryBudget,
  endRecurringMonthlyCategoryBudget,
  getMonthlyCategoryBudget,
  replaceMonthlyCategoryBudget
} from '@/lib/monthly-category-budgets';
import type { RecurringBudgetChangeScope } from '@/lib/monthly-category-budgets';
import {
  FinancialPlanningBudgetDraftProposal,
  MonthlyCategoryBudgetDraftAllocation,
  applyFinancialPlanningProposalToDraft,
  draftAllocationFromItem
} from '@/lib/monthly-category-budget-draft';

interface ExpenseCategory extends CategoryOption {
  type: 'EXPENSE';
  icon: string;
  _count?: { children: number };
}

type DraftAllocation = MonthlyCategoryBudgetDraftAllocation;

interface CreationDraft {
  categoryId: string;
  limitAmount: string;
  kind: MonthlyCategoryBudgetKind;
  month: string;
  includeChildren: boolean;
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

function previousMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 2, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
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

function normalizeAmount(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function allocationSignature(allocations: DraftAllocation[]): string {
  return allocations
    .slice()
    .sort((left, right) => left.categoryId - right.categoryId)
    .map(
      (allocation) =>
        `${allocation.categoryId}:${normalizeAmount(allocation.limitAmount)}:${allocation.includeChildren}`
    )
    .join('|');
}

function coveredCategoryIds(
  categoryId: number,
  includeChildren: boolean,
  childrenByParentId: Map<number, number[]>
): number[] {
  if (!includeChildren) return [categoryId];

  const result: number[] = [];
  const pending = [categoryId];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const nextId = pending.shift();
    if (!nextId || visited.has(nextId)) continue;
    visited.add(nextId);
    result.push(nextId);
    pending.push(...(childrenByParentId.get(nextId) || []));
  }
  return result;
}

function statusForValues(params: {
  limitAmount: number;
  knownAmount: number;
  forecastAmount: number;
}): MonthlyCategoryBudgetStatus {
  if (params.knownAmount > params.limitAmount) return 'EXCEEDED';
  if (params.forecastAmount > params.limitAmount) return 'AT_RISK';
  return 'ON_TRACK';
}

function statusPresentation(status: MonthlyCategoryBudgetStatus) {
  if (status === 'EXCEEDED') {
    return {
      label: 'Ultrapassado',
      badge: 'border-red-800 bg-red-950/50 text-red-300',
      bar: 'bg-red-500',
      icon: AlertTriangle
    };
  }

  if (status === 'AT_RISK') {
    return {
      label: 'Em risco',
      badge: 'border-amber-800 bg-amber-950/50 text-amber-300',
      bar: 'bg-amber-500',
      icon: TrendingUp
    };
  }

  return {
    label: 'Dentro do plano',
    badge: 'border-emerald-800 bg-emerald-950/50 text-emerald-300',
    bar: 'bg-emerald-500',
    icon: CheckCircle2
  };
}

export function MonthlyCategoryPlanning({
  month,
  onMonthChange,
  draftProposal,
  onDraftProposalConsumed
}: {
  month: string;
  onMonthChange?: (month: string) => void;
  draftProposal?: FinancialPlanningBudgetDraftProposal | null;
  onDraftProposalConsumed?: (proposalId: string) => void;
}) {
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [plan, setPlan] = useState<MonthlyCategoryBudgetResponse | null>(null);
  const [draft, setDraft] = useState<DraftAllocation[]>([]);
  const [savedSignature, setSavedSignature] = useState('');
  const [creationDraft, setCreationDraft] = useState<CreationDraft>({
    categoryId: '',
    limitAmount: '0.00',
    kind: 'ONE_TIME',
    month,
    includeChildren: true
  });
  const [creationPlan, setCreationPlan] = useState<MonthlyCategoryBudgetResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appliedProposalId, setAppliedProposalId] = useState<string | null>(null);
  const [scenarioDraftNotice, setScenarioDraftNotice] = useState<{
    scenarioLabel: string;
    appliedCount: number;
    unchangedCount: number;
    skippedCategoryNames: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [categoryResponse, planResponse] = await Promise.all([
          api.get('/financial/categories', { params: { type: 'EXPENSE' } }),
          getMonthlyCategoryBudget(month)
        ]);

        if (cancelled) return;

        const nextDraft = planResponse.items.map(draftAllocationFromItem);
        setCategories((categoryResponse.data || []) as ExpenseCategory[]);
        setPlan(planResponse);
        setDraft(nextDraft);
        setSavedSignature(allocationSignature(nextDraft));
        setCreationDraft({
          categoryId: '',
          limitAmount: '0.00',
          kind: 'ONE_TIME',
          month,
          includeChildren: true
        });
        setCreationPlan(planResponse);
        setScenarioDraftNotice(null);
      } catch (error: any) {
        if (!cancelled) {
          addToast(error.response?.data?.error || 'Erro ao carregar o planejamento mensal', 'error');
          setPlan(null);
          setDraft([]);
          setSavedSignature('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    if (creationDraft.month === month) {
      setCreationPlan(plan);
      return;
    }

    let cancelled = false;
    getMonthlyCategoryBudget(creationDraft.month, { planOnly: true })
      .then((response) => {
        if (!cancelled) setCreationPlan(response);
      })
      .catch((error: any) => {
        if (!cancelled) {
          setCreationPlan(null);
          addToast(
            error.response?.data?.error || 'Erro ao verificar o mês escolhido',
            'error'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [addToast, creationDraft.month, month, plan]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const planItemByCategoryId = useMemo(
    () => new Map((plan?.items || []).map((item) => [item.category.id, item])),
    [plan]
  );
  const childrenByParentId = useMemo(() => {
    const result = new Map<number, number[]>();
    categories.forEach((category) => {
      if (!category.parentId) return;
      const siblings = result.get(category.parentId) || [];
      siblings.push(category.id);
      result.set(category.parentId, siblings);
    });
    return result;
  }, [categories]);
  const creationAllocations = useMemo(
    () =>
      creationDraft.month === month
        ? draft
        : (creationPlan?.items || []).map(draftAllocationFromItem),
    [creationDraft.month, creationPlan, draft, month]
  );
  const availableCreationCategories = useMemo(() => {
    const selectedCategoryIds = new Set(
      creationAllocations.map((allocation) => allocation.categoryId)
    );
    const alreadyCovered = new Set<number>();
    creationAllocations.forEach((allocation) => {
      coveredCategoryIds(
        allocation.categoryId,
        allocation.includeChildren,
        childrenByParentId
      ).forEach((categoryId) => alreadyCovered.add(categoryId));
    });

    return categories.filter((category) => {
      if (selectedCategoryIds.has(category.id)) return false;
      return !coveredCategoryIds(category.id, true, childrenByParentId).some((categoryId) =>
        alreadyCovered.has(categoryId)
      );
    });
  }, [categories, childrenByParentId, creationAllocations]);
  const selectedCreationCategory = categoryById.get(Number(creationDraft.categoryId));
  const monthOptions = useMemo(() => {
    const currentMonth = currentMonthKey();
    return Array.from({ length: 25 }, (_, index) => {
      const value = addMonths(currentMonth, index);
      const suffix = index === 0 ? ' — mês atual' : index === 1 ? ' — próximo mês' : '';
      return { value, label: `${formatMonthLabel(value)}${suffix}` };
    });
  }, []);
  const currentSignature = useMemo(() => allocationSignature(draft), [draft]);
  const isDirty = currentSignature !== savedSignature;
  const canManage = plan?.access.canManage ?? false;

  useEffect(() => {
    if (!draftProposal || loading || !plan || appliedProposalId === draftProposal.id) return;

    setAppliedProposalId(draftProposal.id);
    onDraftProposalConsumed?.(draftProposal.id);
    if (draftProposal.targetMonth !== month) {
      addToast('O cenário pertence a outro mês de planejamento', 'error');
      return;
    }
    if (!canManage) {
      addToast('Você não possui permissão para revisar este cenário no planejamento', 'error');
      return;
    }

    const result = applyFinancialPlanningProposalToDraft({
      allocations: draft,
      categories,
      proposal: draftProposal
    });
    setDraft(result.allocations);
    setScenarioDraftNotice({
      scenarioLabel: draftProposal.sourceScenarioLabel,
      appliedCount: result.appliedCategoryIds.length,
      unchangedCount: result.unchangedCategoryIds.length,
      skippedCategoryNames: result.skipped.map((item) => item.categoryName)
    });
    if (result.appliedCategoryIds.length > 0) {
      addToast('Cenário levado ao rascunho. Revise os valores antes de salvar.', 'success');
    } else if (result.unchangedCategoryIds.length > 0 && result.skipped.length === 0) {
      addToast('O planejamento mensal já corresponde a este cenário');
    } else {
      addToast('Nenhuma sugestão pôde ser adicionada ao rascunho atual', 'error');
    }
  }, [
    addToast,
    appliedProposalId,
    canManage,
    categories,
    draft,
    draftProposal,
    loading,
    month,
    onDraftProposalConsumed,
    plan
  ]);

  const draftSummary = useMemo(() => {
    return draft.reduce(
      (summary, allocation) => {
        const item = planItemByCategoryId.get(allocation.categoryId);
        const limit = Number(allocation.limitAmount || 0);
        const realized = Number(item?.realizedAmount || 0);
        const committed = Number(item?.committedAmount || 0);
        const forecast = Number(item?.forecastAmount || 0);

        summary.planned += limit;
        summary.realized += realized;
        summary.committed += committed;
        summary.forecast += forecast;
        const status = statusForValues({
          limitAmount: limit,
          knownAmount: realized + committed,
          forecastAmount: forecast
        });
        if (status === 'AT_RISK') summary.atRisk += 1;
        if (status === 'EXCEEDED') summary.exceeded += 1;
        return summary;
      },
      { planned: 0, realized: 0, committed: 0, forecast: 0, atRisk: 0, exceeded: 0 }
    );
  }, [draft, planItemByCategoryId]);

  function applyPlanResponse(response: MonthlyCategoryBudgetResponse) {
    const nextDraft = response.items.map(draftAllocationFromItem);
    setPlan(response);
    setDraft(nextDraft);
    setSavedSignature(allocationSignature(nextDraft));
    setScenarioDraftNotice(null);
    if (creationDraft.month === response.month) setCreationPlan(response);
  }

  function updateAllocation(categoryId: number, patch: Partial<DraftAllocation>) {
    setDraft((current) =>
      current.map((allocation) =>
        allocation.categoryId === categoryId ? { ...allocation, ...patch } : allocation
      )
    );
  }

  async function handleCreatePlanning() {
    if (isDirty) {
      addToast('Salve as alterações do mês em exibição antes de criar outro planejamento', 'error');
      return;
    }
    const categoryId = Number(creationDraft.categoryId);
    const rawLimitAmount = creationDraft.limitAmount.trim();
    const limitAmount = Number(rawLimitAmount);
    if (!categoryId || !rawLimitAmount || !Number.isFinite(limitAmount) || limitAmount < 0) {
      addToast('Informe a categoria e um limite igual ou maior que zero', 'error');
      return;
    }

    setCreating(true);
    try {
      const response = await createMonthlyCategoryBudget({
        month: creationDraft.month,
        categoryId,
        limitAmount: normalizeAmount(creationDraft.limitAmount),
        includeChildren: creationDraft.includeChildren,
        kind: creationDraft.kind
      });
      setCreationDraft((current) => ({
        ...current,
        categoryId: '',
        limitAmount: '0.00',
        includeChildren: true
      }));
      addToast(
        creationDraft.kind === 'FIXED_MONTHLY'
          ? 'Planejamento fixo criado'
          : 'Planejamento do mês criado',
        'success'
      );
      if (creationDraft.month === month) {
        applyPlanResponse(response);
      } else if (onMonthChange) {
        onMonthChange(creationDraft.month);
      } else {
        setCreationPlan(response);
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao criar planejamento', 'error');
    } finally {
      setCreating(false);
    }
  }

  function handleEndRecurring(item: MonthlyCategoryBudgetItem) {
    if (!item.recurringBudgetId) return;
    if (isDirty) {
      addToast('Salve as alterações do mês antes de encerrar um planejamento fixo', 'error');
      return;
    }

    confirmation.confirm(
      {
        title: 'Encerrar planejamento fixo',
        message: `${item.category.name} deixará de ser projetado em ${formatMonthLabel(month)} e nos meses seguintes. Os meses anteriores serão preservados.`,
        confirmText: 'Encerrar a partir deste mês',
        type: 'warning'
      },
      async () => {
        try {
          const response = await endRecurringMonthlyCategoryBudget({
            recurringBudgetId: item.recurringBudgetId!,
            month
          });
          applyPlanResponse(response);
          addToast('Planejamento fixo encerrado', 'success');
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao encerrar planejamento fixo', 'error');
          throw error;
        }
      }
    );
  }

  async function persistPlan() {
    const invalidAllocation = draft.find((allocation) => {
      if (!allocation.limitAmount.trim()) return true;
      const amount = Number(allocation.limitAmount);
      return !Number.isFinite(amount) || amount < 0;
    });
    if (invalidAllocation) {
      addToast('O limite mensal não pode ser negativo', 'error');
      throw new Error('Limite mensal inválido');
    }

    setSaving(true);
    try {
      const response = await replaceMonthlyCategoryBudget({
        month,
        allocations: draft.map((allocation) => ({
          categoryId: allocation.categoryId,
          limitAmount: normalizeAmount(allocation.limitAmount),
          includeChildren: allocation.includeChildren,
          recurringChangeScope: allocation.recurringChangeScope
        }))
      });
      applyPlanResponse(response);
      addToast('Planejamento mensal salvo', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar o planejamento mensal', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (draft.length === 0 && savedSignature) {
      confirmation.confirm(
        {
          title: 'Remover planejamento do mês',
          message: 'Salvar sem categorias removerá todos os limites definidos para este mês.',
          confirmText: 'Remover planejamento',
          type: 'warning'
        },
        persistPlan
      );
      return;
    }

    void persistPlan().catch(() => undefined);
  }

  async function copyPreviousPlan() {
    try {
      const previousPlan = await getMonthlyCategoryBudget(previousMonth(month), { planOnly: true });
      if (previousPlan.items.length === 0) {
        addToast('O mês anterior não possui planejamento para copiar');
        return;
      }

      const nextDraft = previousPlan.items.map((item) => {
        const currentItem = planItemByCategoryId.get(item.category.id);
        return currentItem
          ? { ...draftAllocationFromItem(currentItem), limitAmount: item.limitAmount }
          : {
              ...draftAllocationFromItem(item),
              origin: 'ONE_TIME' as const,
              recurringBudgetId: null,
              baseLimitAmount: null,
              recurrenceStartMonth: null
            };
      });
      if (allocationSignature(nextDraft) === savedSignature) {
        addToast('Os planejamentos fixos do mês anterior já estão projetados neste mês');
        return;
      }
      setDraft(nextDraft);
      setScenarioDraftNotice(null);
      addToast('Mês anterior copiado para o rascunho. Salve para aplicar.', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao copiar o mês anterior', 'error');
      throw error;
    }
  }

  function handleCopyPrevious() {
    if (draft.length === 0) {
      void copyPreviousPlan().catch(() => undefined);
      return;
    }

    confirmation.confirm(
      {
        title: 'Substituir o rascunho atual',
        message:
          'Os valores exibidos serão trocados pelos do mês anterior. Nada será salvo até você confirmar em Salvar planejamento.',
        confirmText: 'Copiar para o rascunho',
        type: 'info'
      },
      copyPreviousPlan
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const forecastVariance = draftSummary.planned - draftSummary.forecast;
  const knownTotal = draftSummary.realized + draftSummary.committed;

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Planejamento mensal por categoria</h2>
          <InfoModalButton
            modalTitle="Sobre o Planejamento Mensal"
            buttonLabel="Ajuda sobre o Planejamento Mensal"
          >
            <p>
              Defina limites para as despesas do mês. Os lançamentos continuam livres; o Zenit apenas
              compara sua intenção com o realizado, o já comprometido e a tendência.
            </p>
            <p>
              Um planejamento pode existir somente no mês escolhido ou ser fixo mensal. Os fixos são
              projetados virtualmente a partir do mês inicial e só criam um ajuste próprio quando você
              muda um mês específico.
            </p>
          </InfoModalButton>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleCopyPrevious} className="inline-flex items-center gap-2">
              <Copy size={16} />
              Copiar mês anterior
            </Button>
            <Button
              variant="accent"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar planejamento
            </Button>
          </div>
        )}
      </div>

      {!canManage && (
        <div className="mb-4 rounded-lg border border-blue-900/70 bg-blue-950/20 px-4 py-3 text-sm text-blue-200">
          Você pode consultar este planejamento. Somente gestores do workspace podem alterá-lo.
        </div>
      )}

      {canManage && scenarioDraftNotice && (
        <div className="mb-4 rounded-lg border border-blue-800/70 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          <p>
            O cenário <strong className="text-white">{scenarioDraftNotice.scenarioLabel}</strong>{' '}
            {scenarioDraftNotice.appliedCount > 0 ? (
              <>
                atualizou {scenarioDraftNotice.appliedCount}{' '}
                {scenarioDraftNotice.appliedCount === 1 ? 'categoria' : 'categorias'} no rascunho.
              </>
            ) : (
              <>foi comparado com o planejamento atual.</>
            )}{' '}
            Nada foi salvo ainda.
          </p>
          {scenarioDraftNotice.unchangedCount > 0 && (
            <p className="mt-1 text-xs text-blue-200/80">
              {scenarioDraftNotice.unchangedCount}{' '}
              {scenarioDraftNotice.unchangedCount === 1
                ? 'categoria já estava'
                : 'categorias já estavam'}{' '}
              no valor sugerido.
            </p>
          )}
          {scenarioDraftNotice.skippedCategoryNames.length > 0 && (
            <p className="mt-1 text-xs text-blue-200/80">
              Revise manualmente: {scenarioDraftNotice.skippedCategoryNames.join(', ')}{' '}
              {scenarioDraftNotice.skippedCategoryNames.length === 1
                ? 'não pôde ser aplicada'
                : 'não puderam ser aplicadas'}{' '}
              por conflito de hierarquia ou indisponibilidade da categoria.
            </p>
          )}
        </div>
      )}

      {canManage && isDirty && !scenarioDraftNotice && (
        <div className="mb-4 rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Há alterações no rascunho. Os indicadores definitivos serão recalculados ao salvar.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryMetric label="Planejado" value={formatMoney(draftSummary.planned)} />
        <SummaryMetric label="Realizado" value={formatMoney(draftSummary.realized)} />
        <SummaryMetric label="Comprometido" value={formatMoney(draftSummary.committed)} />
        <SummaryMetric
          label="Margem pela tendência"
          value={formatMoney(forecastVariance)}
          tone={forecastVariance < 0 ? 'danger' : 'success'}
        />
      </div>

      {canManage && (
        <Card className="mb-6">
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,0.85fr)_minmax(0,1fr)_auto]">
            <CategorySelect
              label="Categoria ou grupo"
              categories={availableCreationCategories}
              value={creationDraft.categoryId}
              onChange={(categoryId) =>
                setCreationDraft((current) => ({ ...current, categoryId, includeChildren: true }))
              }
              placeholder="Selecione uma categoria de despesa"
              emptyLabel="Selecione uma categoria"
            />
            <CurrencyInput
              id="new-monthly-budget-limit"
              label="Limite mensal"
              value={creationDraft.limitAmount}
              onChange={(limitAmount) =>
                setCreationDraft((current) => ({ ...current, limitAmount }))
              }
              selectOnFocus
              className="!mb-0"
            />
            <div>
              <label htmlFor="monthly-budget-kind" className="mb-1 block text-sm font-medium text-gray-300">
                Tipo
              </label>
              <select
                id="monthly-budget-kind"
                value={creationDraft.kind}
                onChange={(event) =>
                  setCreationDraft((current) => ({
                    ...current,
                    kind: event.target.value as MonthlyCategoryBudgetKind
                  }))
                }
                className="w-full rounded border border-gray-700 bg-[#1e2126] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring"
              >
                <option value="ONE_TIME">Somente em um mês</option>
                <option value="FIXED_MONTHLY">Fixo mensal</option>
              </select>
            </div>
            <div>
              <label htmlFor="monthly-budget-start-month" className="mb-1 block text-sm font-medium text-gray-300">
                {creationDraft.kind === 'FIXED_MONTHLY' ? 'Começa em' : 'Mês do planejamento'}
              </label>
              <select
                id="monthly-budget-start-month"
                value={creationDraft.month}
                onChange={(event) => {
                  const nextMonth = event.target.value;
                  setCreationPlan(nextMonth === month ? plan : null);
                  setCreationDraft((current) => ({
                    ...current,
                    month: nextMonth,
                    categoryId: ''
                  }));
                }}
                className="w-full rounded border border-gray-700 bg-[#1e2126] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="accent"
              onClick={() => void handleCreatePlanning()}
              disabled={
                creating ||
                !creationPlan ||
                !creationDraft.categoryId ||
                !creationDraft.limitAmount.trim() ||
                !Number.isFinite(Number(creationDraft.limitAmount)) ||
                Number(creationDraft.limitAmount) < 0
              }
              className="mb-0 inline-flex min-h-10 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Criar
            </Button>
          </div>
          {selectedCreationCategory && (selectedCreationCategory._count?.children || 0) > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={creationDraft.includeChildren}
                onChange={(event) =>
                  setCreationDraft((current) => ({
                    ...current,
                    includeChildren: event.target.checked
                  }))
                }
                className="rounded border-gray-600 bg-[#1e2126]"
              />
              Incluir subcategorias deste grupo
            </label>
          )}
        </Card>
      )}

      {draft.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Target size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="mb-2 text-gray-300">Nenhuma categoria planejada neste mês</p>
            <p className="text-sm text-gray-500">
              Adicione apenas os gastos que deseja controlar. Não é necessário orçar todas as categorias.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {draft.map((allocation) => {
            const category = categoryById.get(allocation.categoryId);
            const item = planItemByCategoryId.get(allocation.categoryId);
            if (!category) return null;

            return (
              <CategoryBudgetRow
                key={allocation.categoryId}
                category={category}
                allocation={allocation}
                item={item}
                month={month}
                readOnly={!canManage}
                onChange={(patch) => updateAllocation(allocation.categoryId, patch)}
                onRemove={() =>
                  setDraft((current) =>
                    current.filter((entry) => entry.categoryId !== allocation.categoryId)
                  )
                }
                onEndRecurring={item?.recurringBudgetId ? () => handleEndRecurring(item) : undefined}
              />
            );
          })}

          <Card>
            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-gray-400">
                Realizado + comprometido:{' '}
                <span className="font-semibold text-white">{formatMoney(knownTotal)}</span>
              </div>
              <div className="text-gray-400">
                Tendência do mês:{' '}
                <span className={forecastVariance < 0 ? 'font-semibold text-red-300' : 'font-semibold text-emerald-300'}>
                  {formatMoney(draftSummary.forecast)}
                </span>
              </div>
              <div className="text-gray-400">
                Alertas:{' '}
                <span className="font-semibold text-white">
                  {draftSummary.exceeded} ultrapassado(s), {draftSummary.atRisk} em risco
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={confirmation.handleClose}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.options.title}
        message={confirmation.options.message}
        confirmText={confirmation.options.confirmText}
        cancelText={confirmation.options.cancelText}
        type={confirmation.options.type}
        loading={confirmation.loading}
      />
    </>
  );
}

function CategoryBudgetRow({
  category,
  allocation,
  item,
  month,
  readOnly,
  onChange,
  onRemove,
  onEndRecurring
}: {
  category: ExpenseCategory;
  allocation: DraftAllocation;
  item?: MonthlyCategoryBudgetItem;
  month: string;
  readOnly: boolean;
  onChange: (patch: Partial<DraftAllocation>) => void;
  onRemove: () => void;
  onEndRecurring?: () => void;
}) {
  const limit = Number(allocation.limitAmount || 0);
  const realized = Number(item?.realizedAmount || 0);
  const committed = Number(item?.committedAmount || 0);
  const historicalAverage = Number(item?.historicalAverageAmount || 0);
  const forecast = Number(item?.forecastAmount || 0);
  const known = realized + committed;
  const remaining = limit - known;
  const status = statusForValues({
    limitAmount: limit,
    knownAmount: known,
    forecastAmount: forecast
  });
  const presentation = statusPresentation(status);
  const StatusIcon = presentation.icon;
  const progress = limit > 0 ? Math.min(Math.max((known / limit) * 100, 0), 100) : 0;
  const hasChildren = (category._count?.children || 0) > 0;
  const isRecurring = Boolean(allocation.recurringBudgetId);
  const originLabel =
    allocation.origin === 'FIXED_OVERRIDE'
      ? 'Fixo ajustado neste mês'
      : allocation.origin === 'FIXED_MONTHLY'
        ? 'Fixo mensal'
        : 'Somente neste mês';

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-[#11161d]">
              <CategoryIcon icon={category.icon} color={category.color} size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-white">{category.name}</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    isRecurring
                      ? 'border-blue-800 bg-blue-950/40 text-blue-300'
                      : 'border-gray-700 bg-gray-900/50 text-gray-400'
                  }`}
                >
                  {isRecurring && <Repeat2 size={11} />}
                  {originLabel}
                </span>
              </div>
              {isRecurring && allocation.recurrenceStartMonth && (
                <p className="mt-1 text-xs text-gray-500">
                  Desde {formatMonthLabel(allocation.recurrenceStartMonth)}
                  {allocation.origin === 'FIXED_OVERRIDE' && allocation.baseLimitAmount
                    ? ` · Base fixa: ${formatMoney(allocation.baseLimitAmount)}`
                    : ''}
                </p>
              )}
              {hasChildren ? (
                <label className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={allocation.includeChildren}
                    disabled={readOnly}
                    onChange={(event) => onChange({ includeChildren: event.target.checked })}
                    className="rounded border-gray-600 bg-[#1e2126] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  Incluir subcategorias deste grupo
                </label>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Categoria de despesa</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div>
              <CurrencyInput
                id={`monthly-budget-${category.id}`}
                label="Limite mensal"
                value={allocation.limitAmount}
                onChange={(limitAmount) => onChange({ limitAmount })}
                disabled={readOnly}
                selectOnFocus
                className="mb-0 w-48"
              />
              {isRecurring && (
                <label className="mt-2 block text-xs text-gray-400">
                  Aplicar alteração
                  <select
                    value={allocation.recurringChangeScope}
                    disabled={readOnly}
                    onChange={(event) =>
                      onChange({
                        recurringChangeScope: event.target.value as RecurringBudgetChangeScope
                      })
                    }
                    className="mt-1 w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none focus:ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="MONTH_ONLY">Somente em {formatMonthLabel(month)}</option>
                    <option value="FROM_MONTH">Neste e nos próximos meses</option>
                  </select>
                </label>
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={onRemove}
                className="mt-6 rounded-lg border border-gray-700 p-2 text-gray-400 transition-colors hover:border-red-800 hover:bg-red-950/30 hover:text-red-300"
                aria-label={
                  isRecurring
                    ? `Remover ${category.name} somente deste mês`
                    : `Remover ${category.name} do planejamento`
                }
                title={isRecurring ? 'Remover somente deste mês' : 'Remover planejamento'}
              >
                <Trash2 size={18} />
              </button>
            )}
            {!readOnly && onEndRecurring && (
              <button
                type="button"
                onClick={onEndRecurring}
                className="mt-6 rounded-lg border border-gray-700 p-2 text-gray-400 transition-colors hover:border-amber-800 hover:bg-amber-950/30 hover:text-amber-300"
                aria-label={`Encerrar planejamento fixo de ${category.name}`}
                title="Encerrar a partir deste mês"
              >
                <CalendarX2 size={18} />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">
              Utilizado e comprometido: {formatMoney(known)} de {formatMoney(limit)}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${presentation.badge}`}>
              <StatusIcon size={13} />
              {presentation.label}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-800">
            <div className={`h-full rounded-full ${presentation.bar}`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <RowMetric label="Realizado" value={formatMoney(realized)} />
          <RowMetric label="Comprometido" value={formatMoney(committed)} />
          <RowMetric label="Média histórica" value={formatMoney(historicalAverage)} />
          <RowMetric label="Tendência" value={formatMoney(forecast)} />
          <RowMetric
            label={remaining >= 0 ? 'Margem atual' : 'Excesso atual'}
            value={formatMoney(Math.abs(remaining))}
            tone={remaining < 0 ? 'danger' : 'success'}
          />
        </div>
      </div>
    </Card>
  );
}

function SummaryMetric({
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
    <Card>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${valueClass}`}>{value}</p>
    </Card>
  );
}

function RowMetric({
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
      <p className={`mt-1 font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
