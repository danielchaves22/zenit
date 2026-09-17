import type {
  MonthlyCategoryBudgetItem,
  RecurringBudgetChangeScope,
} from "@/lib/monthly-category-budgets";

export interface MonthlyCategoryBudgetDraftAllocation {
  categoryId: number;
  limitAmount: string;
  includeChildren: boolean;
  recurringBudgetId: number | null;
  origin: MonthlyCategoryBudgetItem["origin"];
  baseLimitAmount: string | null;
  recurrenceStartMonth: string | null;
  recurringChangeScope: RecurringBudgetChangeScope;
}

export interface FinancialPlanningBudgetDraftProposal {
  id: string;
  sourceSnapshotId: number;
  sourceScenarioId: "PRESERVE_PRIORITIES" | "BALANCED";
  sourceScenarioLabel: string;
  targetMonth: string;
  adjustments: Array<{
    categoryId: number;
    categoryName: string;
    suggestedMonthlyLimit: string;
  }>;
}

export interface BudgetDraftCategory {
  id: number;
  parentId?: number | null;
}

export interface SkippedBudgetDraftAdjustment {
  categoryId: number;
  categoryName: string;
  reason:
    | "CATEGORY_NOT_FOUND"
    | "COVERED_BY_PARENT"
    | "EXISTING_GROUP_SCOPE"
    | "INVALID_AMOUNT";
}

export function draftAllocationFromItem(
  item: MonthlyCategoryBudgetItem,
): MonthlyCategoryBudgetDraftAllocation {
  return {
    categoryId: item.category.id,
    limitAmount: item.limitAmount,
    includeChildren: item.includeChildren,
    recurringBudgetId: item.recurringBudgetId,
    origin: item.origin,
    baseLimitAmount: item.baseLimitAmount,
    recurrenceStartMonth: item.recurrenceStartMonth,
    recurringChangeScope: "MONTH_ONLY",
  };
}

function normalizeAmount(value: string): string | null {
  if (value.trim() === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999.99)
    return null;
  return amount.toFixed(2);
}

function ancestorIds(
  categoryId: number,
  categoryById: Map<number, BudgetDraftCategory>,
): number[] {
  const result: number[] = [];
  const visited = new Set<number>();
  let parentId = categoryById.get(categoryId)?.parentId ?? null;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    result.push(parentId);
    parentId = categoryById.get(parentId)?.parentId ?? null;
  }
  return result;
}

export function applyFinancialPlanningProposalToDraft(params: {
  allocations: MonthlyCategoryBudgetDraftAllocation[];
  categories: BudgetDraftCategory[];
  proposal: FinancialPlanningBudgetDraftProposal;
}): {
  allocations: MonthlyCategoryBudgetDraftAllocation[];
  appliedCategoryIds: number[];
  unchangedCategoryIds: number[];
  skipped: SkippedBudgetDraftAdjustment[];
} {
  const categoryById = new Map(
    params.categories.map((category) => [category.id, category]),
  );
  const parentCategoryIds = new Set(
    params.categories.flatMap((category) =>
      category.parentId === null || category.parentId === undefined
        ? []
        : [category.parentId],
    ),
  );
  const next = params.allocations.map((allocation) => ({ ...allocation }));
  const allocationByCategoryId = new Map(
    next.map((allocation) => [allocation.categoryId, allocation]),
  );
  const appliedCategoryIds: number[] = [];
  const unchangedCategoryIds: number[] = [];
  const skipped: SkippedBudgetDraftAdjustment[] = [];

  params.proposal.adjustments.forEach((adjustment) => {
    const category = categoryById.get(adjustment.categoryId);
    if (!category) {
      skipped.push({ ...adjustment, reason: "CATEGORY_NOT_FOUND" });
      return;
    }
    const amount = normalizeAmount(adjustment.suggestedMonthlyLimit);
    if (amount === null) {
      skipped.push({ ...adjustment, reason: "INVALID_AMOUNT" });
      return;
    }

    const existing = allocationByCategoryId.get(adjustment.categoryId);
    if (existing) {
      if (
        existing.includeChildren &&
        parentCategoryIds.has(adjustment.categoryId)
      ) {
        skipped.push({ ...adjustment, reason: "EXISTING_GROUP_SCOPE" });
        return;
      }
      if (normalizeAmount(existing.limitAmount) === amount) {
        unchangedCategoryIds.push(adjustment.categoryId);
        return;
      }
      existing.limitAmount = amount;
      existing.recurringChangeScope = "MONTH_ONLY";
      appliedCategoryIds.push(adjustment.categoryId);
      return;
    }

    const coveringParent = ancestorIds(
      adjustment.categoryId,
      categoryById,
    ).find(
      (ancestorId) => allocationByCategoryId.get(ancestorId)?.includeChildren,
    );
    if (coveringParent) {
      skipped.push({ ...adjustment, reason: "COVERED_BY_PARENT" });
      return;
    }

    const allocation: MonthlyCategoryBudgetDraftAllocation = {
      categoryId: adjustment.categoryId,
      limitAmount: amount,
      includeChildren: false,
      recurringBudgetId: null,
      origin: "ONE_TIME",
      baseLimitAmount: null,
      recurrenceStartMonth: null,
      recurringChangeScope: "MONTH_ONLY",
    };
    next.push(allocation);
    allocationByCategoryId.set(allocation.categoryId, allocation);
    appliedCategoryIds.push(adjustment.categoryId);
  });

  return {
    allocations: next,
    appliedCategoryIds,
    unchangedCategoryIds,
    skipped,
  };
}
