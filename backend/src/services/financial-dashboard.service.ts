import {
  AccountType,
  CreditCardInvoiceStatus,
  FinancialAccountPurpose,
  FinancialTransactionEntryKind,
  Prisma,
  PrismaClient,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import FixedTransactionService from './fixed-transaction.service';
import UserVariableProjectionPreferenceService from './user-variable-projection-preference.service';
import { resolveCreditCardInvoiceReference } from '../utils/credit-card';

const prisma = new PrismaClient();

type DashboardSource =
  | 'AD_HOC_MATERIALIZED'
  | 'FIXED_MATERIALIZED'
  | 'FIXED_PROJECTED'
  | 'CREDIT_CARD';

type DashboardTransactionType = 'INCOME' | 'EXPENSE';
type DashboardCategoryAggregationState = 'REALIZED' | 'PENDING' | 'PROJECTED';

type DashboardKnownRow = {
  type: DashboardTransactionType;
  source: DashboardSource;
  amount: Prisma.Decimal;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  isRealized: boolean;
  categoryAggregationState: DashboardCategoryAggregationState;
};

type CategoryTotalAccumulator = {
  categoryId: number | null;
  name: string;
  color: string;
  type: DashboardTransactionType;
  amount: Prisma.Decimal;
  realizedAmount: Prisma.Decimal;
  pendingAmount: Prisma.Decimal;
  projectedAmount: Prisma.Decimal;
};

type VariableProjectionItem = {
  categoryId: number;
  categoryName: string;
  color: string;
  month: string;
  historicalAverage: Prisma.Decimal;
  committedInMonth: Prisma.Decimal;
  remainingProjected: Prisma.Decimal;
};

type MonthlyComputation = {
  month: string;
  isCurrentMonth: boolean;
  carryOverAmount: Prisma.Decimal;
  projectedEndingBalance: Prisma.Decimal;
  knownRows: DashboardKnownRow[];
  variableProjectionItems: VariableProjectionItem[];
};

function parseMonthKey(month: string): Date {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Mês inválido. Use o formato YYYY-MM');
  }

  const [year, monthValue] = month.split('-').map(Number);
  return new Date(year, monthValue - 1, 1, 12, 0, 0, 0);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
}

function buildRelevantMonthWhere(startDate: Date, endDate: Date): Prisma.FinancialTransactionWhereInput {
  return {
    OR: [
      {
        dueDate: {
          gte: startDate,
          lte: endDate
        }
      },
      {
        dueDate: null,
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    ]
  };
}

function buildOperationalTransactionWhere(): Prisma.FinancialTransactionWhereInput {
  return {
    entryKind: FinancialTransactionEntryKind.NORMAL,
    AND: [
      { NOT: { fromAccount: { is: { purpose: FinancialAccountPurpose.BUDGET } } } },
      { NOT: { toAccount: { is: { purpose: FinancialAccountPurpose.BUDGET } } } }
    ]
  };
}

function toDecimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }

  return new Prisma.Decimal(value);
}

function toMoneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function buildCategoryLabel(category?: { name?: string | null } | null): string {
  return category?.name || 'Sem categoria';
}

function buildCategoryColor(category?: { color?: string | null } | null): string {
  return category?.color || '#6B7280';
}

function createCategoryTotalAccumulator(params: {
  categoryId: number | null;
  name: string;
  color: string;
  type: DashboardTransactionType;
}): CategoryTotalAccumulator {
  return {
    categoryId: params.categoryId,
    name: params.name,
    color: params.color,
    type: params.type,
    amount: new Prisma.Decimal(0),
    realizedAmount: new Prisma.Decimal(0),
    pendingAmount: new Prisma.Decimal(0),
    projectedAmount: new Prisma.Decimal(0)
  };
}

function addAmountToCategoryAccumulator(
  accumulator: CategoryTotalAccumulator,
  amount: Prisma.Decimal,
  aggregationState: DashboardCategoryAggregationState
) {
  accumulator.amount = accumulator.amount.plus(amount);

  if (aggregationState === 'REALIZED') {
    accumulator.realizedAmount = accumulator.realizedAmount.plus(amount);
    return;
  }

  if (aggregationState === 'PENDING') {
    accumulator.pendingAmount = accumulator.pendingAmount.plus(amount);
    return;
  }

  accumulator.projectedAmount = accumulator.projectedAmount.plus(amount);
}

function isCompletedStatus(status?: TransactionStatus | null): boolean {
  return status === TransactionStatus.COMPLETED;
}

function isPaidInvoiceStatus(status?: CreditCardInvoiceStatus | null): boolean {
  return status === CreditCardInvoiceStatus.PAID;
}

export default class FinancialDashboardService {
  private static buildFixedTemplateAccessWhere(
    accessibleAccountIds?: number[]
  ): Prisma.RecurringTransactionWhereInput {
    if (!accessibleAccountIds) {
      return {};
    }

    if (accessibleAccountIds.length === 0) {
      return {
        OR: [{ fromAccountId: null, toAccountId: null }]
      };
    }

    return {
      OR: [
        { fromAccountId: null, toAccountId: null },
        { type: TransactionType.INCOME, toAccountId: { in: accessibleAccountIds } },
        { type: TransactionType.EXPENSE, fromAccountId: { in: accessibleAccountIds } }
      ]
    };
  }

  private static async getCurrentBalance(params: {
    companyId: number;
    accessibleAccountIds?: number[];
  }): Promise<Prisma.Decimal> {
    const { companyId, accessibleAccountIds } = params;

    if (accessibleAccountIds && accessibleAccountIds.length === 0) {
      return new Prisma.Decimal(0);
    }

    const aggregate = await prisma.financialAccount.aggregate({
      where: {
        companyId,
        isActive: true,
        purpose: FinancialAccountPurpose.GENERAL,
        type: { not: AccountType.CREDIT_CARD },
        ...(accessibleAccountIds ? { id: { in: accessibleAccountIds } } : {})
      },
      _sum: {
        balance: true
      }
    });

    return toDecimal(aggregate._sum.balance);
  }

  private static async getStructuralSummary(params: {
    companyId: number;
    accessibleAccountIds?: number[];
  }) {
    const referenceDate = startOfDay(new Date());
    const activeFixedTemplates = await prisma.recurringTransaction.groupBy({
      by: ['type'],
      where: {
        companyId: params.companyId,
        isActive: true,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
        AND: [
          { startDate: { lte: referenceDate } },
          {
            OR: [{ endDate: null }, { endDate: { gte: referenceDate } }]
          },
          this.buildFixedTemplateAccessWhere(params.accessibleAccountIds)
        ]
      },
      _sum: {
        amount: true
      }
    });

    const activeCreditCards = await prisma.financialAccount.findMany({
      where: {
        companyId: params.companyId,
        isActive: true,
        type: AccountType.CREDIT_CARD,
        ...(params.accessibleAccountIds ? { id: { in: params.accessibleAccountIds } } : {})
      },
      select: {
        balance: true,
        creditLimit: true
      }
    });

    const fixedIncomeTotal =
      activeFixedTemplates.find((item) => item.type === TransactionType.INCOME)?._sum.amount ??
      new Prisma.Decimal(0);
    const fixedExpenseTotal =
      activeFixedTemplates.find((item) => item.type === TransactionType.EXPENSE)?._sum.amount ??
      new Prisma.Decimal(0);

    const creditCardsSummary = activeCreditCards.reduce(
      (accumulator, card) => {
        const balance = toDecimal(card.balance);
        const usedLimit = balance.lt(0) ? balance.abs() : new Prisma.Decimal(0);

        accumulator.totalLimit = accumulator.totalLimit.plus(toDecimal(card.creditLimit));
        accumulator.usedLimit = accumulator.usedLimit.plus(usedLimit);

        if (card.creditLimit !== null) {
          accumulator.availableLimit = accumulator.availableLimit.plus(
            toDecimal(card.creditLimit).minus(usedLimit)
          );
        }

        return accumulator;
      },
      {
        totalLimit: new Prisma.Decimal(0),
        usedLimit: new Prisma.Decimal(0),
        availableLimit: new Prisma.Decimal(0)
      }
    );

    return {
      referenceDate: referenceDate.toISOString(),
      fixed: {
        incomeTotal: toMoneyString(fixedIncomeTotal),
        expenseTotal: toMoneyString(fixedExpenseTotal),
        netTotal: toMoneyString(fixedIncomeTotal.minus(fixedExpenseTotal))
      },
      creditCards: {
        totalLimit: toMoneyString(creditCardsSummary.totalLimit),
        usedLimit: toMoneyString(creditCardsSummary.usedLimit),
        availableLimit: toMoneyString(creditCardsSummary.availableLimit)
      }
    };
  }

  private static async getTrackedExpenseCategories(params: {
    userId: number;
    companyId: number;
  }) {
    const preference = await UserVariableProjectionPreferenceService.getPreference(
      params.userId,
      params.companyId
    );

    if (preference.trackedExpenseCategoryIds.length === 0) {
      return [];
    }

    const categories = await prisma.financialCategory.findMany({
      where: {
        id: { in: preference.trackedExpenseCategoryIds },
        companyId: params.companyId,
        type: TransactionType.EXPENSE
      },
      select: {
        id: true,
        name: true,
        color: true
      }
    });

    const categoryMap = new Map(categories.map((category) => [category.id, category]));

    return preference.trackedExpenseCategoryIds
      .map((categoryId) => categoryMap.get(categoryId))
      .filter((category): category is NonNullable<typeof category> => Boolean(category));
  }

  private static async buildHistoricalAverageMap(params: {
    companyId: number;
    trackedCategoryIds: number[];
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
    referenceDate?: Date;
  }): Promise<Map<number, Prisma.Decimal>> {
    const {
      companyId,
      trackedCategoryIds,
      accessibleAccountIds,
      accessFilter,
      referenceDate = new Date()
    } = params;

    const result = new Map<number, Prisma.Decimal>();

    trackedCategoryIds.forEach((categoryId) => {
      result.set(categoryId, new Prisma.Decimal(0));
    });

    if (trackedCategoryIds.length === 0) {
      return result;
    }

    const currentMonthStart = startOfMonth(referenceDate);
    const historyStart = startOfMonth(addMonths(currentMonthStart, -6));
    const historyEnd = endOfMonth(addMonths(currentMonthStart, -1));

    const baseWhere: Prisma.FinancialTransactionWhereInput = {
      companyId,
      type: TransactionType.EXPENSE,
      status: { not: TransactionStatus.CANCELED },
      categoryId: { in: trackedCategoryIds },
      recurringTransactionId: null,
      ...buildOperationalTransactionWhere()
    };

    const accessibleWhere: Prisma.FinancialTransactionWhereInput[] = [];
    if (accessFilter) {
      accessibleWhere.push(accessFilter);
    }

    const nonCardAggregates = await prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        AND: [
          baseWhere,
          {
            creditCardInvoiceId: null
          },
          buildRelevantMonthWhere(historyStart, historyEnd),
          ...accessibleWhere
        ]
      },
      _sum: {
        amount: true
      }
    });

    const cardAggregates = await prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        AND: [
          baseWhere,
          {
            creditCardInvoiceId: { not: null },
            creditCardInvoice: {
              is: {
                dueDate: {
                  gte: historyStart,
                  lte: historyEnd
                }
              }
            }
          },
          ...accessibleWhere
        ]
      },
      _sum: {
        amount: true
      }
    });

    for (const aggregate of [...nonCardAggregates, ...cardAggregates]) {
      if (!aggregate.categoryId) {
        continue;
      }

      const currentValue = result.get(aggregate.categoryId) ?? new Prisma.Decimal(0);
      result.set(aggregate.categoryId, currentValue.plus(toDecimal(aggregate._sum.amount)));
    }

    for (const [categoryId, total] of result.entries()) {
      result.set(categoryId, total.div(6));
    }

    return result;
  }

  private static async getExistingOccurrenceKeys(params: {
    companyId: number;
    startDate: Date;
    endDate: Date;
    accessFilter?: Prisma.FinancialTransactionWhereInput;
  }): Promise<Set<string>> {
    const whereFilters: Prisma.FinancialTransactionWhereInput[] = [
      {
        companyId: params.companyId,
        recurringTransactionId: { not: null }
      },
      {
        OR: [
          {
            dueDate: {
              gte: params.startDate,
              lte: params.endDate
            }
          },
          {
            date: {
              gte: params.startDate,
              lte: params.endDate
            }
          }
        ]
      }
    ];

    if (params.accessFilter) {
      whereFilters.push(params.accessFilter);
    }

    const occurrences = await prisma.financialTransaction.findMany({
      where: {
        AND: whereFilters
      },
      select: {
        occurrenceKey: true
      }
    });

    return new Set(
      occurrences
        .map((item) => item.occurrenceKey)
        .filter((item): item is string => Boolean(item))
    );
  }

  private static async getKnownMonthlyRows(params: {
    companyId: number;
    monthStart: Date;
    monthEnd: Date;
    currentDate: Date;
    isCurrentMonth: boolean;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
  }): Promise<DashboardKnownRow[]> {
    const {
      companyId,
      monthStart,
      monthEnd,
      currentDate,
      isCurrentMonth,
      accessibleAccountIds,
      accessFilter
    } = params;

    const operationalWhere = buildOperationalTransactionWhere();
    const sharedFilters: Prisma.FinancialTransactionWhereInput[] = [
      { companyId },
      {
        type: {
          in: [TransactionType.INCOME, TransactionType.EXPENSE]
        }
      },
      {
        status: {
          not: TransactionStatus.CANCELED
        }
      },
      operationalWhere
    ];

    if (accessFilter) {
      sharedFilters.push(accessFilter);
    }

    const [materializedNonCard, materializedCard] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          AND: [
            ...sharedFilters,
            {
              creditCardInvoiceId: null
            },
            buildRelevantMonthWhere(monthStart, monthEnd)
          ]
        },
        select: {
          type: true,
          amount: true,
          status: true,
          recurringTransactionId: true,
          categoryId: true,
          category: {
            select: {
              name: true,
              color: true
            }
          }
        }
      }),
      prisma.financialTransaction.findMany({
        where: {
          AND: [
            ...sharedFilters,
            {
              type: TransactionType.EXPENSE,
              creditCardInvoiceId: { not: null },
              creditCardInvoice: {
                is: {
                  dueDate: {
                    gte: monthStart,
                    lte: monthEnd
                  }
                }
              }
            }
          ]
        },
        select: {
          amount: true,
          recurringTransactionId: true,
          categoryId: true,
          category: {
            select: {
              name: true,
              color: true
            }
          },
          creditCardInvoice: {
            select: {
              status: true
            }
          }
        }
      })
    ]);

    const rows: DashboardKnownRow[] = [];

    for (const transaction of materializedNonCard) {
      const categoryAggregationState = isCompletedStatus(transaction.status)
        ? 'REALIZED'
        : 'PENDING';

      rows.push({
        type: transaction.type as DashboardTransactionType,
        source: transaction.recurringTransactionId ? 'FIXED_MATERIALIZED' : 'AD_HOC_MATERIALIZED',
        amount: toDecimal(transaction.amount),
        categoryId: transaction.categoryId,
        categoryName: buildCategoryLabel(transaction.category),
        categoryColor: buildCategoryColor(transaction.category),
        isRealized: !isCurrentMonth || isCompletedStatus(transaction.status),
        categoryAggregationState
      });
    }

    for (const transaction of materializedCard) {
      const categoryAggregationState = isPaidInvoiceStatus(transaction.creditCardInvoice?.status)
        ? 'REALIZED'
        : 'PENDING';

      rows.push({
        type: TransactionType.EXPENSE,
        source: 'CREDIT_CARD',
        amount: toDecimal(transaction.amount),
        categoryId: transaction.categoryId,
        categoryName: buildCategoryLabel(transaction.category),
        categoryColor: buildCategoryColor(transaction.category),
        isRealized: !isCurrentMonth || isPaidInvoiceStatus(transaction.creditCardInvoice?.status),
        categoryAggregationState
      });
    }

    const previousMonthStart = startOfMonth(addMonths(monthStart, -1));
    const templates = await FixedTransactionService.getTemplatesForProjection({
      companyId,
      rangeStart: previousMonthStart,
      rangeEnd: monthEnd,
      accessibleAccountIds
    });

    const existingOccurrenceKeys = await this.getExistingOccurrenceKeys({
      companyId,
      startDate: previousMonthStart,
      endDate: monthEnd,
      accessFilter
    });

    const startCursor = new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth(), 1, 12, 0, 0, 0);
    const endCursor = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1, 12, 0, 0, 0);

    for (const template of templates as any[]) {
      if (
        template.type === TransactionType.INCOME &&
        template.toAccount?.type === AccountType.CREDIT_CARD
      ) {
        continue;
      }

      let cursor = new Date(startCursor);

      while (cursor <= endCursor) {
        const occurrenceDate = FixedTransactionService.buildVirtualDateForMonth(
          template,
          cursor.getFullYear(),
          cursor.getMonth()
        );

        if (template.startDate > occurrenceDate || (template.endDate && template.endDate < occurrenceDate)) {
          cursor = addMonths(cursor, 1);
          continue;
        }

        const occurrenceKey = FixedTransactionService.buildOccurrenceKey(
          template.id,
          occurrenceDate
        );
        if (existingOccurrenceKeys.has(occurrenceKey)) {
          cursor = addMonths(cursor, 1);
          continue;
        }

        const isCreditCardFixedExpense =
          template.type === TransactionType.EXPENSE &&
          template.fromAccount?.type === AccountType.CREDIT_CARD &&
          template.fromAccount?.statementClosingDay &&
          template.fromAccount?.statementDueDay;

        if (isCreditCardFixedExpense) {
          const invoiceReference = resolveCreditCardInvoiceReference(
            occurrenceDate,
            template.fromAccount.statementClosingDay,
            template.fromAccount.statementDueDay
          );

          if (invoiceReference.dueDate >= monthStart && invoiceReference.dueDate <= monthEnd) {
            rows.push({
              type: TransactionType.EXPENSE,
              source: 'CREDIT_CARD',
              amount: toDecimal(template.amount),
              categoryId: template.categoryId ?? null,
              categoryName: buildCategoryLabel(template.category),
              categoryColor: buildCategoryColor(template.category),
              isRealized: false,
              categoryAggregationState: 'PROJECTED'
            });
          }

          cursor = addMonths(cursor, 1);
          continue;
        }

        if (occurrenceDate >= monthStart && occurrenceDate <= monthEnd) {
          rows.push({
            type: template.type as DashboardTransactionType,
            source: 'FIXED_PROJECTED',
            amount: toDecimal(template.amount),
            categoryId: template.categoryId ?? null,
            categoryName: buildCategoryLabel(template.category),
            categoryColor: buildCategoryColor(template.category),
            isRealized: false,
            categoryAggregationState: 'PROJECTED'
          });
        }

        cursor = addMonths(cursor, 1);
      }
    }

    return rows;
  }

  private static buildVariableProjectionItems(params: {
    monthKey: string;
    trackedCategories: Array<{ id: number; name: string; color: string }>;
    historicalAverageByCategoryId: Map<number, Prisma.Decimal>;
    knownRows: DashboardKnownRow[];
  }): VariableProjectionItem[] {
    const committedByCategoryId = new Map<number, Prisma.Decimal>();

    for (const row of params.knownRows) {
      if (row.type !== TransactionType.EXPENSE || row.categoryId === null) {
        continue;
      }

      const currentValue = committedByCategoryId.get(row.categoryId) ?? new Prisma.Decimal(0);
      committedByCategoryId.set(row.categoryId, currentValue.plus(row.amount));
    }

    return params.trackedCategories.map((category) => {
      const historicalAverage =
        params.historicalAverageByCategoryId.get(category.id) ?? new Prisma.Decimal(0);
      const committedInMonth = committedByCategoryId.get(category.id) ?? new Prisma.Decimal(0);
      const projectedDifference = historicalAverage.minus(committedInMonth);
      const remainingProjected = projectedDifference.gt(0)
        ? projectedDifference
        : new Prisma.Decimal(0);

      return {
        categoryId: category.id,
        categoryName: category.name,
        color: category.color,
        month: params.monthKey,
        historicalAverage,
        committedInMonth,
        remainingProjected
      };
    });
  }

  private static buildMonthlyComputation(params: {
    monthStart: Date;
    currentDate: Date;
    carryOverAmount: Prisma.Decimal;
    knownRows: DashboardKnownRow[];
    variableProjectionItems: VariableProjectionItem[];
  }): MonthlyComputation {
    const monthKey = formatMonthKey(params.monthStart);
    const isCurrentMonth = isSameMonth(params.monthStart, params.currentDate);
    let incomeTotal = new Prisma.Decimal(0);
    let realizedIncome = new Prisma.Decimal(0);
    let remainingIncome = new Prisma.Decimal(0);
    let realizedCommittedExpense = new Prisma.Decimal(0);
    let remainingCommittedExpense = new Prisma.Decimal(0);

    for (const row of params.knownRows) {
      if (row.type === TransactionType.INCOME) {
        incomeTotal = incomeTotal.plus(row.amount);
        if (row.isRealized) {
          realizedIncome = realizedIncome.plus(row.amount);
        } else {
          remainingIncome = remainingIncome.plus(row.amount);
        }
        continue;
      }

      if (row.isRealized) {
        realizedCommittedExpense = realizedCommittedExpense.plus(row.amount);
      } else {
        remainingCommittedExpense = remainingCommittedExpense.plus(row.amount);
      }
    }

    const variableProjectedExpenseTotal = params.variableProjectionItems.reduce(
      (sum, item) => sum.plus(item.remainingProjected),
      new Prisma.Decimal(0)
    );

    const committedExpenseTotal = realizedCommittedExpense.plus(remainingCommittedExpense);
    const expenseTotal = committedExpenseTotal.plus(variableProjectedExpenseTotal);
    const projectedEndingBalance = isCurrentMonth
      ? params.carryOverAmount.plus(remainingIncome).minus(remainingCommittedExpense).minus(
          variableProjectedExpenseTotal
        )
      : params.carryOverAmount.plus(incomeTotal).minus(committedExpenseTotal).minus(
          variableProjectedExpenseTotal
        );

    return {
      month: monthKey,
      isCurrentMonth,
      carryOverAmount: params.carryOverAmount,
      projectedEndingBalance,
      knownRows: params.knownRows,
      variableProjectionItems: params.variableProjectionItems
    };
  }

  static async getMonthlyDashboard(params: {
    companyId: number;
    userId: number;
    month: string;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
  }) {
    const currentDate = new Date();
    const currentMonthStart = startOfMonth(currentDate);
    const requestedMonthStart = startOfMonth(parseMonthKey(params.month));

    if (requestedMonthStart < currentMonthStart) {
      throw new Error('Não é permitido consultar meses anteriores ao atual');
    }

    const trackedCategories = await this.getTrackedExpenseCategories({
      userId: params.userId,
      companyId: params.companyId
    });
    const historicalAverageByCategoryId = await this.buildHistoricalAverageMap({
      companyId: params.companyId,
      trackedCategoryIds: trackedCategories.map((category) => category.id),
      accessibleAccountIds: params.accessibleAccountIds,
      accessFilter: params.accessFilter,
      referenceDate: currentDate
    });

    let carryOverAmount = await this.getCurrentBalance({
      companyId: params.companyId,
      accessibleAccountIds: params.accessibleAccountIds
    });

    let monthCursor = new Date(currentMonthStart);
    let targetComputation: MonthlyComputation | null = null;

    while (monthCursor <= requestedMonthStart) {
      const monthEnd = endOfMonth(monthCursor);
      const knownRows = await this.getKnownMonthlyRows({
        companyId: params.companyId,
        monthStart: monthCursor,
        monthEnd,
        currentDate,
        isCurrentMonth: isSameMonth(monthCursor, currentMonthStart),
        accessibleAccountIds: params.accessibleAccountIds,
        accessFilter: params.accessFilter
      });
      const variableProjectionItems = this.buildVariableProjectionItems({
        monthKey: formatMonthKey(monthCursor),
        trackedCategories,
        historicalAverageByCategoryId,
        knownRows
      });
      const computation = this.buildMonthlyComputation({
        monthStart: monthCursor,
        currentDate,
        carryOverAmount,
        knownRows,
        variableProjectionItems
      });

      if (isSameMonth(monthCursor, requestedMonthStart)) {
        targetComputation = computation;
      }

      carryOverAmount = computation.projectedEndingBalance;
      monthCursor = addMonths(monthCursor, 1);
    }

    if (!targetComputation) {
      throw new Error('Não foi possível calcular o dashboard mensal');
    }
    const structuralSummary = await this.getStructuralSummary({
      companyId: params.companyId,
      accessibleAccountIds: params.accessibleAccountIds
    });

    const categoryTotalsMap = new Map<
      string,
      CategoryTotalAccumulator
    >();

    const committedBreakdown = {
      income: {
        adHocMaterializedTotal: new Prisma.Decimal(0),
        fixedMaterializedTotal: new Prisma.Decimal(0),
        fixedProjectedTotal: new Prisma.Decimal(0)
      },
      expense: {
        adHocMaterializedTotal: new Prisma.Decimal(0),
        fixedMaterializedTotal: new Prisma.Decimal(0),
        fixedProjectedTotal: new Prisma.Decimal(0),
        creditCardTotal: new Prisma.Decimal(0)
      }
    };

    let monthlyIncomeTotal = new Prisma.Decimal(0);
    let realizedIncomeTotal = new Prisma.Decimal(0);
    let remainingIncomeTotal = new Prisma.Decimal(0);
    let realizedCommittedExpenseTotal = new Prisma.Decimal(0);
    let remainingCommittedExpenseTotal = new Prisma.Decimal(0);

    for (const row of targetComputation.knownRows) {
      const categoryKey = `${row.type}:${row.categoryId ?? 'uncategorized'}`;
      const existingCategory =
        categoryTotalsMap.get(categoryKey) ??
        createCategoryTotalAccumulator({
          categoryId: row.categoryId,
          name: row.categoryName,
          color: row.categoryColor,
          type: row.type
        });
      addAmountToCategoryAccumulator(
        existingCategory,
        row.amount,
        row.categoryAggregationState
      );
      categoryTotalsMap.set(categoryKey, existingCategory);

      if (row.type === TransactionType.INCOME) {
        monthlyIncomeTotal = monthlyIncomeTotal.plus(row.amount);
        if (row.isRealized) {
          realizedIncomeTotal = realizedIncomeTotal.plus(row.amount);
        } else {
          remainingIncomeTotal = remainingIncomeTotal.plus(row.amount);
        }

        if (row.source === 'AD_HOC_MATERIALIZED') {
          committedBreakdown.income.adHocMaterializedTotal =
            committedBreakdown.income.adHocMaterializedTotal.plus(row.amount);
        } else if (row.source === 'FIXED_MATERIALIZED') {
          committedBreakdown.income.fixedMaterializedTotal =
            committedBreakdown.income.fixedMaterializedTotal.plus(row.amount);
        } else if (row.source === 'FIXED_PROJECTED') {
          committedBreakdown.income.fixedProjectedTotal =
            committedBreakdown.income.fixedProjectedTotal.plus(row.amount);
        }

        continue;
      }

      if (row.isRealized) {
        realizedCommittedExpenseTotal = realizedCommittedExpenseTotal.plus(row.amount);
      } else {
        remainingCommittedExpenseTotal = remainingCommittedExpenseTotal.plus(row.amount);
      }

      if (row.source === 'AD_HOC_MATERIALIZED') {
        committedBreakdown.expense.adHocMaterializedTotal =
          committedBreakdown.expense.adHocMaterializedTotal.plus(row.amount);
      } else if (row.source === 'FIXED_MATERIALIZED') {
        committedBreakdown.expense.fixedMaterializedTotal =
          committedBreakdown.expense.fixedMaterializedTotal.plus(row.amount);
      } else if (row.source === 'FIXED_PROJECTED') {
        committedBreakdown.expense.fixedProjectedTotal =
          committedBreakdown.expense.fixedProjectedTotal.plus(row.amount);
      } else if (row.source === 'CREDIT_CARD') {
        committedBreakdown.expense.creditCardTotal =
          committedBreakdown.expense.creditCardTotal.plus(row.amount);
      }
    }

    for (const item of targetComputation.variableProjectionItems) {
      if (item.remainingProjected.lte(0)) {
        continue;
      }

      const categoryKey = `${TransactionType.EXPENSE}:${item.categoryId}`;
      const existingCategory =
        categoryTotalsMap.get(categoryKey) ??
        createCategoryTotalAccumulator({
          categoryId: item.categoryId,
          name: item.categoryName,
          color: item.color,
          type: TransactionType.EXPENSE
        });
      addAmountToCategoryAccumulator(existingCategory, item.remainingProjected, 'PROJECTED');
      categoryTotalsMap.set(categoryKey, existingCategory);
    }

    const variableProjectedExpenseTotal = targetComputation.variableProjectionItems.reduce(
      (sum, item) => sum.plus(item.remainingProjected),
      new Prisma.Decimal(0)
    );
    const committedExpenseTotal = realizedCommittedExpenseTotal.plus(remainingCommittedExpenseTotal);
    const monthlyExpenseTotal = committedExpenseTotal.plus(variableProjectedExpenseTotal);

    return {
      month: targetComputation.month,
      isCurrentMonth: targetComputation.isCurrentMonth,
      period: {
        month: targetComputation.month,
        startDate: startOfMonth(parseMonthKey(targetComputation.month)).toISOString(),
        endDate: endOfMonth(parseMonthKey(targetComputation.month)).toISOString()
      },
      structuralSummary,
      carryOver: {
        amount: toMoneyString(targetComputation.carryOverAmount),
        source: targetComputation.isCurrentMonth ? 'CURRENT_BALANCE' : 'PREVIOUS_PROJECTED'
      },
      monthlyTotals: {
        incomeTotal: toMoneyString(monthlyIncomeTotal),
        expenseTotal: toMoneyString(monthlyExpenseTotal),
        committedExpenseTotal: toMoneyString(committedExpenseTotal),
        variableProjectedExpenseTotal: toMoneyString(variableProjectedExpenseTotal)
      },
      currentMonthBreakdown: {
        income: {
          realized: toMoneyString(realizedIncomeTotal),
          remaining: toMoneyString(remainingIncomeTotal)
        },
        expense: {
          realizedCommitted: toMoneyString(realizedCommittedExpenseTotal),
          remainingCommitted: toMoneyString(remainingCommittedExpenseTotal),
          remainingVariableProjected: toMoneyString(variableProjectedExpenseTotal)
        }
      },
      committedBreakdown: {
        income: {
          adHocMaterializedTotal: toMoneyString(committedBreakdown.income.adHocMaterializedTotal),
          fixedMaterializedTotal: toMoneyString(committedBreakdown.income.fixedMaterializedTotal),
          fixedProjectedTotal: toMoneyString(committedBreakdown.income.fixedProjectedTotal)
        },
        expense: {
          adHocMaterializedTotal: toMoneyString(committedBreakdown.expense.adHocMaterializedTotal),
          fixedMaterializedTotal: toMoneyString(committedBreakdown.expense.fixedMaterializedTotal),
          fixedProjectedTotal: toMoneyString(committedBreakdown.expense.fixedProjectedTotal),
          creditCardTotal: toMoneyString(committedBreakdown.expense.creditCardTotal)
        }
      },
      variableProjection: {
        total: toMoneyString(variableProjectedExpenseTotal),
        categories: targetComputation.variableProjectionItems
          .filter((item) => item.remainingProjected.gt(0))
          .map((item) => ({
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            color: item.color,
            month: item.month,
            historicalAverage: toMoneyString(item.historicalAverage),
            committedInMonth: toMoneyString(item.committedInMonth),
            remainingProjected: toMoneyString(item.remainingProjected)
          }))
      },
      projectedEndingBalance: toMoneyString(targetComputation.projectedEndingBalance),
      categoryTotals: [...categoryTotalsMap.values()].map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        color: item.color,
        type: item.type,
        amount: toMoneyString(item.amount),
        realizedAmount: toMoneyString(item.realizedAmount),
        pendingAmount: toMoneyString(item.pendingAmount),
        projectedAmount: toMoneyString(item.projectedAmount)
      }))
    };
  }

  static async getHistoryDashboard(params: {
    companyId: number;
    months?: number;
    categoryIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
  }) {
    const currentDate = new Date();
    const totalMonths = Math.min(Math.max(params.months ?? 12, 1), 24);
    const currentMonthStart = startOfMonth(currentDate);
    const rangeStart = startOfMonth(addMonths(currentMonthStart, -(totalMonths - 1)));
    const rangeEnd = endOfMonth(currentMonthStart);
    const operationalWhere = buildOperationalTransactionWhere();
    const sharedFilters: Prisma.FinancialTransactionWhereInput[] = [
      { companyId: params.companyId },
      {
        type: {
          in: [TransactionType.INCOME, TransactionType.EXPENSE]
        }
      },
      {
        status: {
          not: TransactionStatus.CANCELED
        }
      },
      operationalWhere
    ];

    if (params.accessFilter) {
      sharedFilters.push(params.accessFilter);
    }

    const [materializedNonCard, materializedCard, selectedCategories] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          AND: [
            ...sharedFilters,
            {
              creditCardInvoiceId: null
            },
            buildRelevantMonthWhere(rangeStart, rangeEnd)
          ]
        },
        select: {
          type: true,
          amount: true,
          categoryId: true,
          category: {
            select: {
              name: true,
              color: true,
              type: true
            }
          },
          dueDate: true,
          date: true
        }
      }),
      prisma.financialTransaction.findMany({
        where: {
          AND: [
            ...sharedFilters,
            {
              type: TransactionType.EXPENSE,
              creditCardInvoiceId: { not: null },
              creditCardInvoice: {
                is: {
                  dueDate: {
                    gte: rangeStart,
                    lte: rangeEnd
                  }
                }
              }
            }
          ]
        },
        select: {
          amount: true,
          categoryId: true,
          category: {
            select: {
              name: true,
              color: true,
              type: true
            }
          },
          creditCardInvoice: {
            select: {
              dueDate: true
            }
          }
        }
      }),
      params.categoryIds && params.categoryIds.length > 0
        ? prisma.financialCategory.findMany({
            where: {
              companyId: params.companyId,
              id: {
                in: params.categoryIds
              },
              type: {
                in: [TransactionType.INCOME, TransactionType.EXPENSE]
              }
            },
            select: {
              id: true,
              name: true,
              color: true,
              type: true
            }
          })
        : Promise.resolve([])
    ]);

    const monthTotals = new Map<
      string,
      {
        incomeTotal: Prisma.Decimal;
        expenseTotal: Prisma.Decimal;
      }
    >();

    const categorySeriesTotals = new Map<string, Prisma.Decimal>();

    const selectedCategoryMap = new Map(selectedCategories.map((category) => [category.id, category]));

    for (let index = 0; index < totalMonths; index += 1) {
      const monthKey = formatMonthKey(addMonths(rangeStart, index));
      monthTotals.set(monthKey, {
        incomeTotal: new Prisma.Decimal(0),
        expenseTotal: new Prisma.Decimal(0)
      });
    }

    const addCategorySeriesAmount = (
      categoryId: number | null,
      monthKey: string,
      amount: Prisma.Decimal
    ) => {
      if (!categoryId || !selectedCategoryMap.has(categoryId)) {
        return;
      }

      const key = `${categoryId}:${monthKey}`;
      categorySeriesTotals.set(key, (categorySeriesTotals.get(key) ?? new Prisma.Decimal(0)).plus(amount));
    };

    for (const transaction of materializedNonCard) {
      const relevantDate = transaction.dueDate || transaction.date;
      const monthKey = formatMonthKey(relevantDate);
      const totals = monthTotals.get(monthKey);

      if (!totals) {
        continue;
      }

      const amount = toDecimal(transaction.amount);
      if (transaction.type === TransactionType.INCOME) {
        totals.incomeTotal = totals.incomeTotal.plus(amount);
      } else {
        totals.expenseTotal = totals.expenseTotal.plus(amount);
      }

      addCategorySeriesAmount(transaction.categoryId, monthKey, amount);
    }

    for (const transaction of materializedCard) {
      if (!transaction.creditCardInvoice?.dueDate) {
        continue;
      }

      const monthKey = formatMonthKey(transaction.creditCardInvoice.dueDate);
      const totals = monthTotals.get(monthKey);

      if (!totals) {
        continue;
      }

      const amount = toDecimal(transaction.amount);
      totals.expenseTotal = totals.expenseTotal.plus(amount);
      addCategorySeriesAmount(transaction.categoryId, monthKey, amount);
    }

    return {
      months: totalMonths,
      monthlyTotals: [...monthTotals.entries()].map(([month, totals]) => ({
        month,
        incomeTotal: toMoneyString(totals.incomeTotal),
        expenseTotal: toMoneyString(totals.expenseTotal),
        isPartialCurrentMonth: month === formatMonthKey(currentMonthStart)
      })),
      categorySeries: selectedCategories.map((category) => ({
        categoryId: category.id,
        name: category.name,
        color: category.color,
        type: category.type,
        points: [...monthTotals.keys()].map((month) => ({
          month,
          amount: toMoneyString(
            categorySeriesTotals.get(`${category.id}:${month}`) ?? new Prisma.Decimal(0)
          )
        }))
      }))
    };
  }
}
