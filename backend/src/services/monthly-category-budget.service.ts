import { Prisma, PrismaClient, TransactionType } from '@prisma/client';
import FinancialDashboardService from './financial-dashboard.service';

const prisma = new PrismaClient();

type AllocationInput = {
  categoryId: number;
  limitAmount: string;
  includeChildren: boolean;
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

type MonthlyDashboardCategoryTotal = {
  categoryId: number | null;
  realizedAmount: string;
  pendingAmount: string;
  projectedAmount: string;
};

function parseReferenceMonth(month: string): Date {
  const [year, monthValue] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthValue - 1, 1, 12, 0, 0, 0));
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
  if (!includeChildren) {
    return [categoryId];
  }

  const coveredIds: number[] = [];
  const pendingIds = [categoryId];
  const visited = new Set<number>();

  while (pendingIds.length > 0) {
    const nextId = pendingIds.shift();
    if (!nextId || visited.has(nextId)) {
      continue;
    }

    visited.add(nextId);
    coveredIds.push(nextId);
    pendingIds.push(...(childrenByParentId.get(nextId) ?? []));
  }

  return coveredIds;
}

function buildEmptyResponse(params: {
  month: string;
  allocations: Array<{
    id: number;
    category: ExpenseCategory;
    limitAmount: Prisma.Decimal;
    includeChildren: boolean;
  }>;
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
      id: allocation.id,
      category: allocation.category,
      limitAmount: toMoneyString(allocation.limitAmount),
      includeChildren: allocation.includeChildren,
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
      where: {
        companyId,
        type: TransactionType.EXPENSE
      },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        parentId: true
      }
    });
  }

  static async replacePlan(params: {
    companyId: number;
    month: string;
    allocations: AllocationInput[];
  }): Promise<void> {
    const categories = await this.listExpenseCategories(params.companyId);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const childrenByParentId = new Map<number, number[]>();

    categories.forEach((category) => {
      if (category.parentId === null) {
        return;
      }

      const siblings = childrenByParentId.get(category.parentId) ?? [];
      siblings.push(category.id);
      childrenByParentId.set(category.parentId, siblings);
    });

    for (const allocation of params.allocations) {
      if (!categoryById.has(allocation.categoryId)) {
        throw new Error('Uma ou mais categorias de despesa não pertencem a esta empresa');
      }
    }

    const coverageOwnerByCategoryId = new Map<number, number>();

    for (const allocation of params.allocations) {
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

    const referenceMonth = parseReferenceMonth(params.month);

    await prisma.$transaction(async (transaction) => {
      await transaction.monthlyCategoryBudget.deleteMany({
        where: {
          companyId: params.companyId,
          referenceMonth
        }
      });

      if (params.allocations.length > 0) {
        await transaction.monthlyCategoryBudget.createMany({
          data: params.allocations.map((allocation) => ({
            companyId: params.companyId,
            referenceMonth,
            categoryId: allocation.categoryId,
            limitAmount: new Prisma.Decimal(allocation.limitAmount),
            includeChildren: allocation.includeChildren
          }))
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
    const allocations = await prisma.monthlyCategoryBudget.findMany({
      where: {
        companyId: params.companyId,
        referenceMonth
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            parentId: true
          }
        }
      },
      orderBy: [{ category: { name: 'asc' } }]
    });

    const normalizedAllocations = allocations.map((allocation) => ({
      id: allocation.id,
      category: allocation.category,
      limitAmount: allocation.limitAmount,
      includeChildren: allocation.includeChildren
    }));

    const statsAvailable = !params.planOnly && params.month >= currentMonthKey();
    if (!statsAvailable || normalizedAllocations.length === 0) {
      return buildEmptyResponse({
        month: params.month,
        allocations: normalizedAllocations,
        statsAvailable
      });
    }

    const categories = await this.listExpenseCategories(params.companyId);
    const childrenByParentId = new Map<number, number[]>();
    categories.forEach((category) => {
      if (category.parentId === null) {
        return;
      }

      const siblings = childrenByParentId.get(category.parentId) ?? [];
      siblings.push(category.id);
      childrenByParentId.set(category.parentId, siblings);
    });

    const coveredIdsByAllocationId = new Map<number, number[]>();
    const selectedCategoryIds = new Set<number>();
    normalizedAllocations.forEach((allocation) => {
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
      if (categoryTotal.categoryId !== null) {
        categoryTotalsById.set(categoryTotal.categoryId, categoryTotal);
      }
    });

    const variableProjectionByCategoryId = new Map<number, Prisma.Decimal>();
    monthlyDashboard.variableProjection.categories.forEach((category) => {
      variableProjectionByCategoryId.set(
        category.categoryId,
        toDecimal(category.remainingProjected)
      );
    });

    const historySeriesByCategoryId = new Map(
      historyDashboard.categorySeries.map((series) => [series.categoryId, series])
    );
    const completeHistoryMonths = historyDashboard.monthlyTotals
      .filter((month) => !month.isPartialCurrentMonth)
      .map((month) => month.month)
      .slice(-6);

    const items = normalizedAllocations.map((allocation) => {
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
      completeHistoryMonths.forEach((month) => {
        coveredIds.forEach((categoryId) => {
          const series = historySeriesByCategoryId.get(categoryId);
          const point = series?.points.find((entry) => entry.month === month);
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
        id: allocation.id,
        category: allocation.category,
        limitAmount: toMoneyString(allocation.limitAmount),
        includeChildren: allocation.includeChildren,
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
        totals.forecastVarianceAmount = totals.forecastVarianceAmount.plus(
          item.forecastVarianceAmount
        );
        if (item.status === 'AT_RISK') totals.atRiskCount += 1;
        if (item.status === 'EXCEEDED') totals.exceededCount += 1;
        return totals;
      },
      {
        plannedAmount: new Prisma.Decimal(0),
        realizedAmount: new Prisma.Decimal(0),
        committedAmount: new Prisma.Decimal(0),
        forecastAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(0),
        forecastVarianceAmount: new Prisma.Decimal(0),
        atRiskCount: 0,
        exceededCount: 0
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
