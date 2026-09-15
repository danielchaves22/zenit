import { Prisma, PrismaClient, TransactionType } from '@prisma/client';
import FinancialDashboardService from './financial-dashboard.service';

const prisma = new PrismaClient();

type RecurringChangeScope = 'MONTH_ONLY' | 'FROM_MONTH';
type PlanningKind = 'ONE_TIME' | 'FIXED_MONTHLY';
type BudgetOrigin = 'ONE_TIME' | 'FIXED_MONTHLY' | 'FIXED_OVERRIDE';

type AllocationInput = {
  categoryId: number;
  limitAmount: string;
  includeChildren: boolean;
  recurringChangeScope?: RecurringChangeScope;
};

type AccessContext = {
  accessibleAccountIds?: number[];
  accessFilter?: Prisma.FinancialTransactionWhereInput;
};

type ExpenseCategory = {
  id: number;
  name: string;
  color: string;
  icon: string;
  parentId: number | null;
};

type EffectiveAllocation = {
  id: number;
  monthlyBudgetId: number | null;
  recurringBudgetId: number | null;
  category: ExpenseCategory;
  limitAmount: Prisma.Decimal;
  includeChildren: boolean;
  origin: BudgetOrigin;
  baseLimitAmount: Prisma.Decimal | null;
  recurrenceStartMonth: string | null;
};

type MonthlyDashboardCategoryTotal = {
  categoryId: number | null;
  realizedAmount: string;
  pendingAmount: string;
  projectedAmount: string;
};

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function parseReferenceMonth(month: string): Date {
  const [year, monthValue] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthValue - 1, 1, 12, 0, 0, 0));
}

function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthDate(month: string): Date {
  const [year, monthValue] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthValue - 2, 1, 12, 0, 0, 0));
}

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function toDecimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

function toMoneyString(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}

function maxDecimal(left: Prisma.Decimal, right: Prisma.Decimal): Prisma.Decimal {
  return left.greaterThan(right) ? left : right;
}

function getCoveredCategoryIds(
  categoryId: number,
  includeChildren: boolean,
  childrenByParentId: Map<number, number[]>
): number[] {
  if (!includeChildren) return [categoryId];

  const coveredIds: number[] = [];
  const pendingIds = [categoryId];
  const visited = new Set<number>();
  while (pendingIds.length > 0) {
    const nextId = pendingIds.shift();
    if (!nextId || visited.has(nextId)) continue;
    visited.add(nextId);
    coveredIds.push(nextId);
    pendingIds.push(...(childrenByParentId.get(nextId) ?? []));
  }
  return coveredIds;
}

function buildCategoryMaps(categories: ExpenseCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const childrenByParentId = new Map<number, number[]>();
  categories.forEach((category) => {
    if (category.parentId === null) return;
    const siblings = childrenByParentId.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParentId.set(category.parentId, siblings);
  });
  return { categoryById, childrenByParentId };
}

function assertNoCoverageOverlap(
  allocations: Array<{ categoryId: number; includeChildren: boolean }>,
  categoryById: Map<number, ExpenseCategory>,
  childrenByParentId: Map<number, number[]>
) {
  const coverageOwnerByCategoryId = new Map<number, number>();
  for (const allocation of allocations) {
    if (!categoryById.has(allocation.categoryId)) {
      throw new Error('Uma ou mais categorias de despesa não pertencem a esta empresa');
    }
    const coveredCategoryIds = getCoveredCategoryIds(
      allocation.categoryId,
      allocation.includeChildren,
      childrenByParentId
    );
    for (const coveredCategoryId of coveredCategoryIds) {
      const existingOwnerId = coverageOwnerByCategoryId.get(coveredCategoryId);
      if (existingOwnerId !== undefined && existingOwnerId !== allocation.categoryId) {
        const existingOwner = categoryById.get(existingOwnerId);
        const nextOwner = categoryById.get(allocation.categoryId);
        throw new Error(
          `As categorias ${existingOwner?.name ?? existingOwnerId} e ${nextOwner?.name ?? allocation.categoryId} cobrem os mesmos gastos`
        );
      }
      coverageOwnerByCategoryId.set(coveredCategoryId, allocation.categoryId);
    }
  }
}

async function listEffectiveAllocations(params: {
  client: DatabaseClient;
  companyId: number;
  referenceMonth: Date;
}): Promise<EffectiveAllocation[]> {
  const [recurringBudgets, monthlyBudgets] = await Promise.all([
    params.client.recurringMonthlyCategoryBudget.findMany({
      where: {
        companyId: params.companyId,
        startMonth: { lte: params.referenceMonth },
        OR: [{ endMonth: null }, { endMonth: { gte: params.referenceMonth } }]
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, parentId: true } }
      },
      orderBy: [{ startMonth: 'asc' }]
    }),
    params.client.monthlyCategoryBudget.findMany({
      where: { companyId: params.companyId, referenceMonth: params.referenceMonth },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, parentId: true } }
      }
    })
  ]);

  const recurringByCategoryId = new Map<number, (typeof recurringBudgets)[number]>();
  recurringBudgets.forEach((recurringBudget) => {
    if (recurringByCategoryId.has(recurringBudget.categoryId)) {
      throw new Error(`Há mais de um planejamento fixo vigente para ${recurringBudget.category.name}`);
    }
    recurringByCategoryId.set(recurringBudget.categoryId, recurringBudget);
  });
  const monthlyByCategoryId = new Map(
    monthlyBudgets.map((monthlyBudget) => [monthlyBudget.categoryId, monthlyBudget])
  );
  const allocations: EffectiveAllocation[] = [];

  recurringBudgets.forEach((recurringBudget) => {
    const monthlyBudget = monthlyByCategoryId.get(recurringBudget.categoryId);
    if (monthlyBudget?.isExcluded) return;
    allocations.push({
      id: monthlyBudget?.id ?? -recurringBudget.id,
      monthlyBudgetId: monthlyBudget?.id ?? null,
      recurringBudgetId: recurringBudget.id,
      category: recurringBudget.category,
      limitAmount: monthlyBudget?.limitAmount ?? recurringBudget.limitAmount,
      includeChildren: monthlyBudget?.includeChildren ?? recurringBudget.includeChildren,
      origin: monthlyBudget ? 'FIXED_OVERRIDE' : 'FIXED_MONTHLY',
      baseLimitAmount: recurringBudget.limitAmount,
      recurrenceStartMonth: monthKeyFromDate(recurringBudget.startMonth)
    });
  });

  monthlyBudgets.forEach((monthlyBudget) => {
    if (recurringByCategoryId.has(monthlyBudget.categoryId) || monthlyBudget.isExcluded) return;
    allocations.push({
      id: monthlyBudget.id,
      monthlyBudgetId: monthlyBudget.id,
      recurringBudgetId: null,
      category: monthlyBudget.category,
      limitAmount: monthlyBudget.limitAmount,
      includeChildren: monthlyBudget.includeChildren,
      origin: 'ONE_TIME',
      baseLimitAmount: null,
      recurrenceStartMonth: null
    });
  });

  return allocations.sort((left, right) =>
    left.category.name.localeCompare(right.category.name, 'pt-BR')
  );
}

function serializeAllocation(allocation: EffectiveAllocation) {
  return {
    id: allocation.id,
    monthlyBudgetId: allocation.monthlyBudgetId,
    recurringBudgetId: allocation.recurringBudgetId,
    category: allocation.category,
    limitAmount: toMoneyString(allocation.limitAmount),
    includeChildren: allocation.includeChildren,
    origin: allocation.origin,
    baseLimitAmount: allocation.baseLimitAmount ? toMoneyString(allocation.baseLimitAmount) : null,
    recurrenceStartMonth: allocation.recurrenceStartMonth
  };
}

function buildEmptyResponse(params: {
  month: string;
  allocations: EffectiveAllocation[];
  statsAvailable: boolean;
}) {
  const plannedAmount = params.allocations.reduce(
    (sum, allocation) => sum.plus(allocation.limitAmount),
    new Prisma.Decimal(0)
  );
  return {
    month: params.month,
    statsAvailable: params.statsAvailable,
    historicalMonthsUsed: 0,
    summary: {
      plannedAmount: toMoneyString(plannedAmount),
      realizedAmount: '0.00',
      committedAmount: '0.00',
      forecastAmount: '0.00',
      remainingAmount: toMoneyString(plannedAmount),
      forecastVarianceAmount: toMoneyString(plannedAmount),
      atRiskCount: 0,
      exceededCount: 0
    },
    items: params.allocations.map((allocation) => ({
      ...serializeAllocation(allocation),
      realizedAmount: '0.00',
      committedAmount: '0.00',
      historicalAverageAmount: '0.00',
      forecastAmount: '0.00',
      remainingAmount: toMoneyString(allocation.limitAmount),
      forecastVarianceAmount: toMoneyString(allocation.limitAmount),
      status: 'ON_TRACK' as const
    }))
  };
}

export default class MonthlyCategoryBudgetService {
  private static async listExpenseCategories(companyId: number): Promise<ExpenseCategory[]> {
    return prisma.financialCategory.findMany({
      where: { companyId, type: TransactionType.EXPENSE },
      select: { id: true, name: true, color: true, icon: true, parentId: true }
    });
  }

  private static async assertRecurringCoverageAvailable(params: {
    companyId: number;
    categoryId: number;
    includeChildren: boolean;
    startMonth: Date;
    categories: ExpenseCategory[];
    ignoreRecurringBudgetId?: number;
    replaceSameCategoryRecurrences?: boolean;
  }) {
    const { categoryById, childrenByParentId } = buildCategoryMaps(params.categories);
    const category = categoryById.get(params.categoryId);
    if (!category) throw new Error('A categoria de despesa não pertence a esta empresa');
    const candidateCoverage = new Set(
      getCoveredCategoryIds(params.categoryId, params.includeChildren, childrenByParentId)
    );
    const [recurringBudgets, monthlyBudgets] = await Promise.all([
      prisma.recurringMonthlyCategoryBudget.findMany({
        where: {
          companyId: params.companyId,
          ...(params.ignoreRecurringBudgetId ? { id: { not: params.ignoreRecurringBudgetId } } : {}),
          OR: [{ endMonth: null }, { endMonth: { gte: params.startMonth } }]
        },
        include: { category: { select: { id: true, name: true } } }
      }),
      prisma.monthlyCategoryBudget.findMany({
        where: {
          companyId: params.companyId,
          referenceMonth: { gte: params.startMonth },
          isExcluded: false,
          categoryId: { not: params.categoryId },
          ...(params.ignoreRecurringBudgetId
            ? { OR: [{ recurringBudgetId: null }, { recurringBudgetId: { not: params.ignoreRecurringBudgetId } }] }
            : {})
        },
        include: { category: { select: { id: true, name: true } } }
      })
    ]);

    for (const recurringBudget of recurringBudgets) {
      if (
        params.replaceSameCategoryRecurrences &&
        recurringBudget.categoryId === params.categoryId
      ) continue;
      const overlaps = getCoveredCategoryIds(
        recurringBudget.categoryId,
        recurringBudget.includeChildren,
        childrenByParentId
      ).some((categoryId) => candidateCoverage.has(categoryId));
      if (overlaps) {
        throw new Error(
          `${category.name} conflita com o planejamento fixo de ${recurringBudget.category.name}`
        );
      }
    }
    for (const monthlyBudget of monthlyBudgets) {
      const overlaps = getCoveredCategoryIds(
        monthlyBudget.categoryId,
        monthlyBudget.includeChildren,
        childrenByParentId
      ).some((categoryId) => candidateCoverage.has(categoryId));
      if (overlaps) {
        throw new Error(
          `${category.name} conflita com ${monthlyBudget.category.name} em ${monthKeyFromDate(monthlyBudget.referenceMonth)}`
        );
      }
    }
  }

  static async createPlanning(params: {
    companyId: number;
    month: string;
    categoryId: number;
    limitAmount: string;
    includeChildren: boolean;
    kind: PlanningKind;
  }): Promise<void> {
    const categories = await this.listExpenseCategories(params.companyId);
    const { categoryById, childrenByParentId } = buildCategoryMaps(categories);
    if (!categoryById.has(params.categoryId)) {
      throw new Error('A categoria de despesa não pertence a esta empresa');
    }
    const referenceMonth = parseReferenceMonth(params.month);
    const effectiveAllocations = await listEffectiveAllocations({
      client: prisma,
      companyId: params.companyId,
      referenceMonth
    });
    if (
      effectiveAllocations.some((allocation) => allocation.category.id === params.categoryId)
    ) {
      throw new Error('Esta categoria já possui planejamento no mês escolhido');
    }
    assertNoCoverageOverlap(
      [
        ...effectiveAllocations.map((allocation) => ({
          categoryId: allocation.category.id,
          includeChildren: allocation.includeChildren
        })),
        { categoryId: params.categoryId, includeChildren: params.includeChildren }
      ],
      categoryById,
      childrenByParentId
    );

    if (params.kind === 'ONE_TIME') {
      const activeRecurringBudget = await prisma.recurringMonthlyCategoryBudget.findFirst({
        where: {
          companyId: params.companyId,
          categoryId: params.categoryId,
          startMonth: { lte: referenceMonth },
          OR: [{ endMonth: null }, { endMonth: { gte: referenceMonth } }]
        }
      });
      await prisma.monthlyCategoryBudget.upsert({
        where: {
          unique_monthly_category_budget: {
            companyId: params.companyId,
            referenceMonth,
            categoryId: params.categoryId
          }
        },
        update: {
          limitAmount: new Prisma.Decimal(params.limitAmount),
          includeChildren: params.includeChildren,
          isExcluded: false,
          recurringBudgetId: activeRecurringBudget?.id ?? null
        },
        create: {
          companyId: params.companyId,
          referenceMonth,
          categoryId: params.categoryId,
          limitAmount: new Prisma.Decimal(params.limitAmount),
          includeChildren: params.includeChildren,
          isExcluded: false,
          recurringBudgetId: activeRecurringBudget?.id ?? null
        }
      });
      return;
    }

    await this.assertRecurringCoverageAvailable({
      companyId: params.companyId,
      categoryId: params.categoryId,
      includeChildren: params.includeChildren,
      startMonth: referenceMonth,
      categories
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.monthlyCategoryBudget.deleteMany({
        where: {
          companyId: params.companyId,
          categoryId: params.categoryId,
          referenceMonth,
          isExcluded: true
        }
      });
      const recurringBudget = await transaction.recurringMonthlyCategoryBudget.create({
        data: {
          companyId: params.companyId,
          categoryId: params.categoryId,
          limitAmount: new Prisma.Decimal(params.limitAmount),
          includeChildren: params.includeChildren,
          startMonth: referenceMonth
        }
      });
      await transaction.monthlyCategoryBudget.updateMany({
        where: {
          companyId: params.companyId,
          categoryId: params.categoryId,
          referenceMonth: { gt: referenceMonth },
          recurringBudgetId: null
        },
        data: { recurringBudgetId: recurringBudget.id }
      });
    });
  }

  static async replacePlan(params: {
    companyId: number;
    month: string;
    allocations: AllocationInput[];
  }): Promise<void> {
    const categories = await this.listExpenseCategories(params.companyId);
    const { categoryById, childrenByParentId } = buildCategoryMaps(categories);
    assertNoCoverageOverlap(params.allocations, categoryById, childrenByParentId);
    const referenceMonth = parseReferenceMonth(params.month);
    const activeRecurringBudgets = await prisma.recurringMonthlyCategoryBudget.findMany({
      where: {
        companyId: params.companyId,
        startMonth: { lte: referenceMonth },
        OR: [{ endMonth: null }, { endMonth: { gte: referenceMonth } }]
      }
    });
    const recurringByCategoryId = new Map(
      activeRecurringBudgets.map((recurringBudget) => [recurringBudget.categoryId, recurringBudget])
    );

    for (const allocation of params.allocations) {
      const recurringBudget = recurringByCategoryId.get(allocation.categoryId);
      if (!recurringBudget || allocation.recurringChangeScope !== 'FROM_MONTH') continue;
      const hasChange =
        !recurringBudget.limitAmount.equals(new Prisma.Decimal(allocation.limitAmount)) ||
        recurringBudget.includeChildren !== allocation.includeChildren;
      if (!hasChange) continue;
      await this.assertRecurringCoverageAvailable({
        companyId: params.companyId,
        categoryId: allocation.categoryId,
        includeChildren: allocation.includeChildren,
        startMonth: referenceMonth,
        categories,
        ignoreRecurringBudgetId: recurringBudget.id,
        replaceSameCategoryRecurrences: true
      });
    }

    await prisma.$transaction(async (transaction) => {
      for (const allocation of params.allocations) {
        const recurringBudget = recurringByCategoryId.get(allocation.categoryId);
        if (!recurringBudget || allocation.recurringChangeScope !== 'FROM_MONTH') continue;
        const nextAmount = new Prisma.Decimal(allocation.limitAmount);
        const hasChange =
          !recurringBudget.limitAmount.equals(nextAmount) ||
          recurringBudget.includeChildren !== allocation.includeChildren;
        if (!hasChange) continue;

        const futureRecurringBudgets = await transaction.recurringMonthlyCategoryBudget.findMany({
          where: {
            companyId: params.companyId,
            categoryId: allocation.categoryId,
            id: { not: recurringBudget.id },
            startMonth: { gte: referenceMonth }
          }
        });
        const futureRecurringIds = futureRecurringBudgets.map((item) => item.id);
        const possibleEndMonths = [recurringBudget, ...futureRecurringBudgets].map(
          (item) => item.endMonth
        );
        const nextEndMonth = possibleEndMonths.some((endMonth) => endMonth === null)
          ? null
          : possibleEndMonths.reduce<Date | null>(
              (latest, endMonth) =>
                endMonth && (!latest || endMonth > latest) ? endMonth : latest,
              null
            );

        if (futureRecurringIds.length > 0) {
          await transaction.recurringMonthlyCategoryBudget.deleteMany({
            where: { id: { in: futureRecurringIds } }
          });
        }

        if (recurringBudget.startMonth.getTime() === referenceMonth.getTime()) {
          const updated = await transaction.recurringMonthlyCategoryBudget.update({
            where: { id: recurringBudget.id },
            data: {
              limitAmount: nextAmount,
              includeChildren: allocation.includeChildren,
              endMonth: nextEndMonth
            }
          });
          await transaction.monthlyCategoryBudget.updateMany({
            where: {
              companyId: params.companyId,
              categoryId: allocation.categoryId,
              referenceMonth: { gte: referenceMonth },
              recurringBudgetId: null
            },
            data: { recurringBudgetId: updated.id }
          });
          recurringByCategoryId.set(allocation.categoryId, updated);
          continue;
        }

        await transaction.recurringMonthlyCategoryBudget.update({
          where: { id: recurringBudget.id },
          data: { endMonth: previousMonthDate(params.month) }
        });
        const nextRecurringBudget = await transaction.recurringMonthlyCategoryBudget.create({
          data: {
            companyId: params.companyId,
            categoryId: allocation.categoryId,
            limitAmount: nextAmount,
            includeChildren: allocation.includeChildren,
            startMonth: referenceMonth,
            endMonth: nextEndMonth
          }
        });
        await transaction.monthlyCategoryBudget.updateMany({
          where: {
            companyId: params.companyId,
            categoryId: allocation.categoryId,
            referenceMonth: { gte: referenceMonth },
            OR: [{ recurringBudgetId: recurringBudget.id }, { recurringBudgetId: null }]
          },
          data: { recurringBudgetId: nextRecurringBudget.id }
        });
        recurringByCategoryId.set(allocation.categoryId, nextRecurringBudget);
      }

      await transaction.monthlyCategoryBudget.deleteMany({
        where: { companyId: params.companyId, referenceMonth }
      });
      const allocationByCategoryId = new Map(
        params.allocations.map((allocation) => [allocation.categoryId, allocation])
      );
      const monthlyRows: Prisma.MonthlyCategoryBudgetCreateManyInput[] = [];
      params.allocations.forEach((allocation) => {
        const recurringBudget = recurringByCategoryId.get(allocation.categoryId);
        const limitAmount = new Prisma.Decimal(allocation.limitAmount);
        if (
          recurringBudget &&
          recurringBudget.limitAmount.equals(limitAmount) &&
          recurringBudget.includeChildren === allocation.includeChildren
        ) return;
        monthlyRows.push({
          companyId: params.companyId,
          referenceMonth,
          categoryId: allocation.categoryId,
          limitAmount,
          includeChildren: allocation.includeChildren,
          isExcluded: false,
          recurringBudgetId: recurringBudget?.id ?? null
        });
      });
      recurringByCategoryId.forEach((recurringBudget, categoryId) => {
        if (allocationByCategoryId.has(categoryId)) return;
        monthlyRows.push({
          companyId: params.companyId,
          referenceMonth,
          categoryId,
          limitAmount: new Prisma.Decimal(0),
          includeChildren: recurringBudget.includeChildren,
          isExcluded: true,
          recurringBudgetId: recurringBudget.id
        });
      });
      if (monthlyRows.length > 0) {
        await transaction.monthlyCategoryBudget.createMany({ data: monthlyRows });
      }
    });
  }

  static async endRecurringPlanning(params: {
    companyId: number;
    recurringBudgetId: number;
    month: string;
  }): Promise<void> {
    const referenceMonth = parseReferenceMonth(params.month);
    const recurringBudget = await prisma.recurringMonthlyCategoryBudget.findFirst({
      where: { id: params.recurringBudgetId, companyId: params.companyId }
    });
    if (!recurringBudget) throw new Error('Planejamento fixo não encontrado');
    if (
      referenceMonth < recurringBudget.startMonth ||
      (recurringBudget.endMonth && referenceMonth > recurringBudget.endMonth)
    ) {
      throw new Error('O planejamento fixo não está vigente no mês informado');
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.monthlyCategoryBudget.deleteMany({
        where: { recurringBudgetId: recurringBudget.id, referenceMonth: { gte: referenceMonth } }
      });
      if (referenceMonth.getTime() === recurringBudget.startMonth.getTime()) {
        await transaction.recurringMonthlyCategoryBudget.delete({ where: { id: recurringBudget.id } });
      } else {
        await transaction.recurringMonthlyCategoryBudget.update({
          where: { id: recurringBudget.id },
          data: { endMonth: previousMonthDate(params.month) }
        });
      }
    });
  }

  static async getPlan(params: {
    companyId: number;
    userId: number;
    month: string;
    planOnly?: boolean;
  } & AccessContext) {
    const referenceMonth = parseReferenceMonth(params.month);
    const allocations = await listEffectiveAllocations({
      client: prisma,
      companyId: params.companyId,
      referenceMonth
    });
    const statsAvailable = !params.planOnly && params.month >= currentMonthKey();
    if (!statsAvailable || allocations.length === 0) {
      return buildEmptyResponse({ month: params.month, allocations, statsAvailable });
    }

    const categories = await this.listExpenseCategories(params.companyId);
    const { childrenByParentId } = buildCategoryMaps(categories);
    const coveredIdsByAllocationId = new Map<number, number[]>();
    const selectedCategoryIds = new Set<number>();
    allocations.forEach((allocation) => {
      const coveredIds = getCoveredCategoryIds(
        allocation.category.id,
        allocation.includeChildren,
        childrenByParentId
      );
      coveredIdsByAllocationId.set(allocation.id, coveredIds);
      coveredIds.forEach((categoryId) => selectedCategoryIds.add(categoryId));
    });

    const [monthlyDashboard, historyDashboard] = await Promise.all([
      FinancialDashboardService.getMonthlyDashboard({
        companyId: params.companyId,
        userId: params.userId,
        month: params.month,
        accessibleAccountIds: params.accessibleAccountIds,
        accessFilter: params.accessFilter
      }),
      FinancialDashboardService.getHistoryDashboard({
        companyId: params.companyId,
        months: 7,
        categoryIds: [...selectedCategoryIds],
        accessFilter: params.accessFilter
      })
    ]);

    const categoryTotalsById = new Map<number, MonthlyDashboardCategoryTotal>();
    monthlyDashboard.categoryTotals.forEach((categoryTotal) => {
      if (categoryTotal.categoryId !== null) categoryTotalsById.set(categoryTotal.categoryId, categoryTotal);
    });
    const variableProjectionByCategoryId = new Map<number, Prisma.Decimal>();
    monthlyDashboard.variableProjection.categories.forEach((category) => {
      variableProjectionByCategoryId.set(category.categoryId, toDecimal(category.remainingProjected));
    });
    const historySeriesByCategoryId = new Map(
      historyDashboard.categorySeries.map((series) => [series.categoryId, series])
    );
    const completeHistoryMonths = historyDashboard.monthlyTotals
      .filter((historyMonth) => !historyMonth.isPartialCurrentMonth)
      .map((historyMonth) => historyMonth.month)
      .slice(-6);

    const items = allocations.map((allocation) => {
      const coveredIds = coveredIdsByAllocationId.get(allocation.id) ?? [allocation.category.id];
      let realizedAmount = new Prisma.Decimal(0);
      let pendingAmount = new Prisma.Decimal(0);
      let projectedAmount = new Prisma.Decimal(0);
      let variableProjectionAmount = new Prisma.Decimal(0);
      coveredIds.forEach((categoryId) => {
        const totals = categoryTotalsById.get(categoryId);
        realizedAmount = realizedAmount.plus(toDecimal(totals?.realizedAmount));
        pendingAmount = pendingAmount.plus(toDecimal(totals?.pendingAmount));
        projectedAmount = projectedAmount.plus(toDecimal(totals?.projectedAmount));
        variableProjectionAmount = variableProjectionAmount.plus(
          variableProjectionByCategoryId.get(categoryId) ?? 0
        );
      });
      const fixedProjectedAmount = maxDecimal(
        projectedAmount.minus(variableProjectionAmount),
        new Prisma.Decimal(0)
      );
      const committedAmount = pendingAmount.plus(fixedProjectedAmount);
      const knownAmount = realizedAmount.plus(committedAmount);
      let historicalTotal = new Prisma.Decimal(0);
      completeHistoryMonths.forEach((historyMonth) => {
        coveredIds.forEach((categoryId) => {
          const series = historySeriesByCategoryId.get(categoryId);
          const point = series?.points.find((entry) => entry.month === historyMonth);
          historicalTotal = historicalTotal.plus(toDecimal(point?.amount));
        });
      });
      const historicalAverageAmount = completeHistoryMonths.length
        ? historicalTotal.div(completeHistoryMonths.length)
        : new Prisma.Decimal(0);
      const forecastAmount = maxDecimal(knownAmount, historicalAverageAmount);
      const remainingAmount = allocation.limitAmount.minus(knownAmount);
      const forecastVarianceAmount = allocation.limitAmount.minus(forecastAmount);
      const status = knownAmount.greaterThan(allocation.limitAmount)
        ? ('EXCEEDED' as const)
        : forecastAmount.greaterThan(allocation.limitAmount)
          ? ('AT_RISK' as const)
          : ('ON_TRACK' as const);
      return {
        ...serializeAllocation(allocation),
        realizedAmount: toMoneyString(realizedAmount),
        committedAmount: toMoneyString(committedAmount),
        historicalAverageAmount: toMoneyString(historicalAverageAmount),
        forecastAmount: toMoneyString(forecastAmount),
        remainingAmount: toMoneyString(remainingAmount),
        forecastVarianceAmount: toMoneyString(forecastVarianceAmount),
        status
      };
    });

    const summary = items.reduce(
      (totals, item) => {
        totals.plannedAmount = totals.plannedAmount.plus(item.limitAmount);
        totals.realizedAmount = totals.realizedAmount.plus(item.realizedAmount);
        totals.committedAmount = totals.committedAmount.plus(item.committedAmount);
        totals.forecastAmount = totals.forecastAmount.plus(item.forecastAmount);
        totals.remainingAmount = totals.remainingAmount.plus(item.remainingAmount);
        totals.forecastVarianceAmount = totals.forecastVarianceAmount.plus(item.forecastVarianceAmount);
        if (item.status === 'AT_RISK') totals.atRiskCount += 1;
        if (item.status === 'EXCEEDED') totals.exceededCount += 1;
        return totals;
      },
      {
        plannedAmount: new Prisma.Decimal(0), realizedAmount: new Prisma.Decimal(0),
        committedAmount: new Prisma.Decimal(0), forecastAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(0), forecastVarianceAmount: new Prisma.Decimal(0),
        atRiskCount: 0, exceededCount: 0
      }
    );
    return {
      month: params.month,
      statsAvailable: true,
      historicalMonthsUsed: completeHistoryMonths.length,
      summary: {
        plannedAmount: toMoneyString(summary.plannedAmount),
        realizedAmount: toMoneyString(summary.realizedAmount),
        committedAmount: toMoneyString(summary.committedAmount),
        forecastAmount: toMoneyString(summary.forecastAmount),
        remainingAmount: toMoneyString(summary.remainingAmount),
        forecastVarianceAmount: toMoneyString(summary.forecastVarianceAmount),
        atRiskCount: summary.atRiskCount,
        exceededCount: summary.exceededCount
      },
      items
    };
  }
}
