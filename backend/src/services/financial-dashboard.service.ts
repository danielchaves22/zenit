import FinancialHistoryService from './financial-history.service';
import VariableExpenseProjectionService from './variable-expense-projection.service';
import prisma from '../lib/prisma';
import {
  AccountType,
  FinancialAccountPurpose,
  FinancialProvisionStatus,
  Prisma,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import FixedTransactionService from './fixed-transaction.service';
import WorkspaceFinancialCalendarService from './workspace-financial-calendar.service';
import { resolveCreditCardInvoiceReference } from '../utils/credit-card';
import {
  buildFinancialRecognitionWhere,
  buildOperationalTransactionWhere,
  type FinancialRecognitionPerspective
} from '../utils/financial-transaction-query';
import { getCreditCardInvoiceSignedAmount } from '../utils/financial-transaction-amount';
import {
  type FinancialRecognition,
  recognizeCreditCardTransaction,
  recognizeNonCardTransaction,
  recognizeProjectedAmount
} from '../utils/financial-recognition';
import {
  addFinancialMonths,
  FinancialCalendarContext,
  formatFinancialMonthKey,
  parseFinancialMonthKey
} from '../utils/financial-calendar';
import {
  calculateMonthlyFinancialProjection,
  type MonthlyFinancialProjection,
  type MonthlyProjectionAggregationState,
  type MonthlyProjectionKnownRow,
  type MonthlyProjectionTransactionType
} from '../utils/monthly-financial-projection';
import { resolveMonthlyProjectionCompetence } from '../utils/monthly-projection-competence';
import { calculateProvisionContributionForMonth } from '../utils/financial-provision-calculator';

export { buildHistoricalNonCardDateWhere, buildHistoricalCardDateWhere } from '../utils/financial-history-query';

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}

function isSameMonth(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth()
  );
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

function toDashboardAggregationState(
  recognition: FinancialRecognition
): MonthlyProjectionAggregationState {
  if (recognition.settlementState === 'SETTLED') {
    return 'REALIZED';
  }

  if (recognition.settlementState === 'PROJECTED') {
    return 'PROJECTED';
  }

  return 'PENDING';
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

  static async getCurrentBalance(params: {
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
    referenceDate: Date;
  }) {
    const referenceDate = params.referenceDate;
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

  static async getStructuralDashboard(params: {
    companyId: number;
    accessibleAccountIds?: number[];
    calendarContext?: FinancialCalendarContext;
    at?: Date;
  }) {
    const calendar =
      params.calendarContext ??
      (await WorkspaceFinancialCalendarService.getContext(params.companyId, params.at));
    return this.getStructuralSummary({
      companyId: params.companyId,
      accessibleAccountIds: params.accessibleAccountIds,
      referenceDate: calendar.businessDate
    });
  }

  static async getKnownMonthlyRows(params: {
    companyId: number;
    monthStart: Date;
    monthEnd: Date;
    currentDate: Date;
    isCurrentMonth: boolean;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
    onlyUnsettled?: boolean;
    includeProjections?: boolean;
  }): Promise<MonthlyProjectionKnownRow[]> {
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
    if (accessibleAccountIds) {
      sharedFilters.push({ OR: [
        { fromAccountId: { in: accessibleAccountIds } },
        { toAccountId: { in: accessibleAccountIds } }
      ] });
    }

    const [materializedNonCard, materializedCard] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          AND: [
            ...sharedFilters,
            {
              creditCardInvoiceId: null,
              ...(params.onlyUnsettled ? { status: TransactionStatus.PENDING } : {})
            },
            buildRelevantMonthWhere(monthStart, monthEnd)
          ]
        },
        select: {
          id: true,
          description: true,
          fromAccountId: true,
          type: true,
          amount: true,
          date: true,
          dueDate: true,
          status: true,
          recurringTransactionId: true,
          installmentNumber: true,
          totalInstallments: true,
          installmentPlanId: true,
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
              creditCardInvoiceId: { not: null },
              OR: [
                { type: TransactionType.EXPENSE },
                {
                  type: TransactionType.INCOME,
                  creditCardCreditKind: { not: null }
                }
              ],
              creditCardInvoice: {
                is: {
                  ...(params.onlyUnsettled ? { status: { not: 'PAID' as const } } : {}),
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
          id: true,
          description: true,
          fromAccountId: true,
          type: true,
          status: true,
          creditCardCreditKind: true,
          amount: true,
          recurringTransactionId: true,
          installmentNumber: true,
          totalInstallments: true,
          purchaseGroupId: true,
          refundOfTransaction: { select: { recurringTransactionId: true, installmentPlanId: true, totalInstallments: true } },
          categoryId: true,
          category: {
            select: {
              name: true,
              color: true
            }
          },
          creditCardInvoice: {
            select: {
              accountId: true,
              status: true,
              dueDate: true
            }
          }
        }
      })
    ]);

    const rows: MonthlyProjectionKnownRow[] = [];

    for (const transaction of materializedNonCard) {
      const recognition = recognizeNonCardTransaction(transaction.status);

      rows.push({
        transactionId: transaction.id,
        recurringTransactionId: transaction.recurringTransactionId,
        description: transaction.description,
        accountId: transaction.fromAccountId,
        variableEligible: !transaction.recurringTransactionId && !transaction.installmentPlanId && !(transaction.totalInstallments && transaction.totalInstallments > 1),
        type: transaction.type as MonthlyProjectionTransactionType,
        source: transaction.recurringTransactionId ? 'FIXED_MATERIALIZED' : 'AD_HOC_MATERIALIZED',
        competence: resolveMonthlyProjectionCompetence({
          kind: 'MATERIALIZED_NON_CARD',
          transactionDate: transaction.date,
          dueDate: transaction.dueDate,
          installmentNumber: transaction.installmentNumber,
          totalInstallments: transaction.totalInstallments,
          installmentPlanId: transaction.installmentPlanId
        }),
        amount: toDecimal(transaction.amount),
        categoryId: transaction.categoryId,
        categoryName: buildCategoryLabel(transaction.category),
        categoryColor: buildCategoryColor(transaction.category),
        isSettled: recognition.settlementState === 'SETTLED',
        categoryAggregationState: toDashboardAggregationState(recognition)
      });
    }

    for (const transaction of materializedCard) {
      if (!transaction.creditCardInvoice) continue;
      const original = transaction.refundOfTransaction;

      const recognition = recognizeCreditCardTransaction(
        transaction.status,
        transaction.creditCardInvoice.status
      );

      rows.push({
        transactionId: transaction.id,
        description: transaction.description,
        accountId: transaction.creditCardInvoice.accountId,
        variableEligible: !transaction.recurringTransactionId && (transaction.totalInstallments ?? 0) <= 1 &&
          !(original && (original.recurringTransactionId || original.installmentPlanId || (original.totalInstallments ?? 0) > 1)),
        type: TransactionType.EXPENSE,
        source: 'CREDIT_CARD',
        competence: resolveMonthlyProjectionCompetence({
          kind: 'MATERIALIZED_CREDIT_CARD',
          invoiceDueDate: transaction.creditCardInvoice.dueDate,
          installmentNumber: transaction.installmentNumber,
          totalInstallments: transaction.totalInstallments,
          purchaseGroupId: transaction.purchaseGroupId
        }),
        amount: getCreditCardInvoiceSignedAmount(transaction),
        categoryId: transaction.categoryId,
        categoryName: buildCategoryLabel(transaction.category),
        categoryColor: buildCategoryColor(transaction.category),
        isSettled: recognition.settlementState === 'SETTLED',
        categoryAggregationState: toDashboardAggregationState(recognition)
      });
    }

    if (params.includeProjections === false) return rows;

    // FixedTransactionService still uses local calendar accessors internally.
    // Noon UTC preserves the intended calendar month across supported hosts.
    const previousMonthStart = addFinancialMonths(monthStart, -1);
    const projectionCutoff = isCurrentMonth
      ? FixedTransactionService.getProjectionCutoffDate(currentDate)
      : monthStart;
    const projectedOccurrences = await FixedTransactionService.listMissingProjectedOccurrences({
      companyId,
      rangeStart: previousMonthStart,
      rangeEnd: monthEnd,
      accessibleAccountIds,
      templateFilter: (template) =>
        !(
          template.type === TransactionType.INCOME &&
          template.toAccount?.type === AccountType.CREDIT_CARD
        ),
      occurrenceFilter: ({ template, occurrenceDate }) => {
        const isCreditCardFixedExpense =
          template.type === TransactionType.EXPENSE &&
          template.fromAccount?.type === AccountType.CREDIT_CARD &&
          template.fromAccount?.statementClosingDay &&
          template.fromAccount?.statementDueDay;

        if (isCreditCardFixedExpense) {
          const statementClosingDay = template.fromAccount?.statementClosingDay;
          const statementDueDay = template.fromAccount?.statementDueDay;

          if (!statementClosingDay || !statementDueDay) {
            return false;
          }

          const invoiceReference = resolveCreditCardInvoiceReference(
            occurrenceDate,
            statementClosingDay,
            statementDueDay
          );

          if (invoiceReference.dueDate < monthStart || invoiceReference.dueDate > monthEnd) {
            return false;
          }

          return invoiceReference.dueDate >= projectionCutoff;
        }

        if (occurrenceDate < monthStart || occurrenceDate > monthEnd) {
          return false;
        }

        return occurrenceDate >= projectionCutoff;
      }
    });

    const projectedRecognition = recognizeProjectedAmount();

    for (const occurrence of projectedOccurrences) {
      const template = occurrence.template;
      const isCreditCardFixedExpense =
        template.type === TransactionType.EXPENSE &&
        template.fromAccount?.type === AccountType.CREDIT_CARD &&
        template.fromAccount?.statementClosingDay &&
        template.fromAccount?.statementDueDay;

      if (isCreditCardFixedExpense) {
        const invoiceReference = resolveCreditCardInvoiceReference(
          occurrence.occurrenceDate,
          template.fromAccount!.statementClosingDay!,
          template.fromAccount!.statementDueDay!
        );

        rows.push({
          description: template.description,
          accountId: template.fromAccountId,
          variableEligible: false,
          type: TransactionType.EXPENSE,
          source: 'CREDIT_CARD',
          competence: resolveMonthlyProjectionCompetence({
            kind: 'PROJECTED_FIXED',
            occurrenceDate: occurrence.occurrenceDate,
            creditCardInvoiceDueDate: invoiceReference.dueDate
          }),
          amount: toDecimal(template.amount),
          categoryId: template.categoryId ?? null,
          categoryName: buildCategoryLabel(template.category),
          categoryColor: buildCategoryColor(template.category),
          isSettled: projectedRecognition.settlementState === 'SETTLED',
          categoryAggregationState: toDashboardAggregationState(projectedRecognition)
        });
        continue;
      }

      rows.push({
        description: template.description,
        recurringTransactionId: template.id,
        accountId: template.fromAccountId,
        variableEligible: false,
        type: template.type as MonthlyProjectionTransactionType,
        source: 'FIXED_PROJECTED',
        competence: resolveMonthlyProjectionCompetence({
          kind: 'PROJECTED_FIXED',
          occurrenceDate: occurrence.occurrenceDate
        }),
        amount: toDecimal(template.amount),
        categoryId: template.categoryId ?? null,
        categoryName: buildCategoryLabel(template.category),
        categoryColor: buildCategoryColor(template.category),
        isSettled: projectedRecognition.settlementState === 'SETTLED',
        categoryAggregationState: toDashboardAggregationState(projectedRecognition)
      });
    }

    return rows;
  }

  static async getPriorPeriodPendingRows(params: {
    companyId: number;
    calendarContext: FinancialCalendarContext;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
  }) {
    return this.getKnownMonthlyRows({
      ...params,
      monthStart: new Date(Date.UTC(1900, 0, 1)),
      monthEnd: new Date(startOfMonth(params.calendarContext.businessDate).getTime() - 1),
      currentDate: params.calendarContext.businessDate,
      isCurrentMonth: false,
      onlyUnsettled: true,
      includeProjections: false
    });
  }

  static async getMonthlyProjection(params: {
    companyId: number;
    userId: number;
    month: string;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
    calendarContext?: FinancialCalendarContext;
    at?: Date;
  }): Promise<MonthlyFinancialProjection> {
    const calendar =
      params.calendarContext ??
      (await WorkspaceFinancialCalendarService.getContext(params.companyId, params.at));
    const currentDate = calendar.businessDate;
    const currentMonthStart = startOfMonth(currentDate);
    const requestedMonthStart = startOfMonth(parseFinancialMonthKey(params.month));
    const requestedMonthEnd = endOfMonth(requestedMonthStart);

    if (requestedMonthStart < currentMonthStart) {
      throw new Error('Não é permitido consultar meses anteriores ao atual');
    }

    const variableContext = await VariableExpenseProjectionService.load({
      ...params, calendar, historyMonths: 6
    });
    const activeProvisions = await prisma.financialProvision.findMany({
      where: {
        companyId: params.companyId,
        status: FinancialProvisionStatus.ACTIVE
      },
      select: {
        id: true,
        name: true,
        expectedAmount: true,
        reservedAmount: true,
        startMonth: true,
        targetDate: true,
        category: {
          select: { id: true, name: true, color: true }
        }
      },
      orderBy: [{ targetDate: 'asc' }, { id: 'asc' }]
    });

    let carryOverAmount = await this.getCurrentBalance({
      companyId: params.companyId,
      accessibleAccountIds: params.accessibleAccountIds
    });

    let monthCursor = new Date(currentMonthStart);
    let targetComputation: MonthlyFinancialProjection | null = null;

    // `addMonths` keeps iteration on a stable first-of-month cursor at noon.
    // Compare with the requested month end so the target future month is included.
    while (monthCursor <= requestedMonthEnd) {
      const monthEnd = endOfMonth(monthCursor);
      const monthKey = formatFinancialMonthKey(monthCursor);
      const knownRows = await this.getKnownMonthlyRows({
        companyId: params.companyId,
        monthStart: monthCursor,
        monthEnd,
        currentDate,
        isCurrentMonth: isSameMonth(monthCursor, currentMonthStart),
        accessibleAccountIds: params.accessibleAccountIds,
        accessFilter: params.accessFilter
      });
      const provisionContributionItems = activeProvisions
        .map((provision) => ({
          provisionId: provision.id,
          provisionName: provision.name,
          categoryId: provision.category.id,
          categoryName: provision.category.name,
          color: provision.category.color,
          month: monthKey,
          targetMonth: formatFinancialMonthKey(provision.targetDate),
          amount: calculateProvisionContributionForMonth(provision, calendar, monthKey)
        }))
        .filter((item) => item.amount.gt(0));
      const computation = calculateMonthlyFinancialProjection({
        month: monthKey,
        isCurrentMonth: isSameMonth(monthCursor, currentDate),
        carryOverAmount,
        knownRows,
        trackedCategories: [],
        historicalAverageByCategoryId: new Map(),
        variableProjectionItems: VariableExpenseProjectionService.estimate({
          context: variableContext, month: monthKey, knownRows
        }),
        provisionContributionItems
      });

      if (isSameMonth(monthCursor, requestedMonthStart)) {
        targetComputation = computation;
      }

      carryOverAmount = computation.projectedEndingBalance;
      monthCursor = startOfMonth(addFinancialMonths(monthCursor, 1));
    }

    if (!targetComputation) {
      throw new Error('Não foi possível calcular o dashboard mensal');
    }

    return { ...targetComputation, historyMonthsUsed: variableContext.history.months.length,
      habitualConfigured: variableContext.preference.configured };
  }

  static async getMonthlyDashboard(params: {
    companyId: number;
    userId: number;
    month: string;
    accessibleAccountIds?: number[];
    accessFilter?: Prisma.FinancialTransactionWhereInput;
    calendarContext?: FinancialCalendarContext;
    at?: Date;
  }) {
    const targetComputation = await this.getMonthlyProjection(params);

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

    for (const row of targetComputation.knownRows) {
      if (row.type === TransactionType.INCOME) {
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

    const variableCategories = new Map<number, MonthlyFinancialProjection['variableProjectionItems'][number]>();
    for (const item of targetComputation.variableProjectionItems) {
      const current = variableCategories.get(item.categoryId);
      variableCategories.set(item.categoryId, current ? {
        ...current, historicalAverage: current.historicalAverage.plus(item.historicalAverage),
        committedInMonth: current.committedInMonth.plus(item.committedInMonth),
        remainingProjected: current.remainingProjected.plus(item.remainingProjected)
      } : { ...item });
    }
    return {
      month: targetComputation.month,
      isCurrentMonth: targetComputation.isCurrentMonth,
      period: {
        month: targetComputation.month,
        startDate: startOfMonth(parseFinancialMonthKey(targetComputation.month)).toISOString(),
        endDate: endOfMonth(parseFinancialMonthKey(targetComputation.month)).toISOString()
      },
      carryOver: {
        amount: toMoneyString(targetComputation.carryOverAmount),
        source: targetComputation.isCurrentMonth ? 'CURRENT_BALANCE' : 'PREVIOUS_PROJECTED'
      },
      monthlyTotals: {
        incomeTotal: toMoneyString(targetComputation.totals.incomeTotal),
        expenseTotal: toMoneyString(targetComputation.totals.expenseTotal),
        committedExpenseTotal: toMoneyString(targetComputation.totals.committedExpenseTotal),
        variableProjectedExpenseTotal: toMoneyString(
          targetComputation.totals.variableProjectedExpenseTotal
        ),
        provisionContributionTotal: toMoneyString(
          targetComputation.totals.provisionContributionTotal
        )
      },
      currentMonthBreakdown: {
        income: {
          realized: toMoneyString(targetComputation.totals.realizedIncomeTotal),
          remaining: toMoneyString(targetComputation.totals.remainingIncomeTotal)
        },
        expense: {
          realizedCommitted: toMoneyString(
            targetComputation.totals.realizedCommittedExpenseTotal
          ),
          remainingCommitted: toMoneyString(
            targetComputation.totals.remainingCommittedExpenseTotal
          ),
          remainingVariableProjected: toMoneyString(
            targetComputation.totals.variableProjectedExpenseTotal
          )
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
        total: toMoneyString(targetComputation.totals.variableProjectedExpenseTotal),
        categories: [...variableCategories.values()]
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
      provisions: {
        total: toMoneyString(targetComputation.totals.provisionContributionTotal),
        items: targetComputation.provisionContributionItems.map((item) => ({
          provisionId: item.provisionId,
          provisionName: item.provisionName,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          color: item.color,
          month: item.month,
          targetMonth: item.targetMonth,
          amount: toMoneyString(item.amount)
        }))
      },
      projectedEndingBalance: toMoneyString(targetComputation.projectedEndingBalance),
      categoryTotals: targetComputation.categoryTotals.map((item) => ({
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
    transactionCategoryIds?: number[];
    excludeRecurringTransactions?: boolean;
    excludeInstallments?: boolean;
    accessFilter?: Prisma.FinancialTransactionWhereInput;
    calendarContext?: FinancialCalendarContext;
    recognitionPerspective?: FinancialRecognitionPerspective;
    at?: Date;
  }) {
    const calendar =
      params.calendarContext ??
      (await WorkspaceFinancialCalendarService.getContext(params.companyId, params.at));
    const currentDate = calendar.businessDate;
    const totalMonths = Math.min(Math.max(params.months ?? 12, 1), 24);
    const currentMonthStart = startOfMonth(currentDate);
    const rangeStart = startOfMonth(
      addFinancialMonths(currentMonthStart, -(totalMonths - 1))
    );
    const rangeEnd = endOfMonth(currentMonthStart);
    const recognitionPerspective = params.recognitionPerspective ?? 'MATERIALIZED';
    const [historyRows, selectedCategories] = await Promise.all([
      FinancialHistoryService.list({
        companyId: params.companyId, accessFilter: params.accessFilter,
        startDate: rangeStart, endDate: rangeEnd, perspective: recognitionPerspective,
        categoryIds: params.transactionCategoryIds,
        excludeRecurring: params.excludeRecurringTransactions,
        excludeInstallments: params.excludeInstallments
      }),
      params.categoryIds?.length
        ? prisma.financialCategory.findMany({
            where: {
              companyId: params.companyId,
              id: { in: params.categoryIds },
              type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] }
            },
            select: { id: true, name: true, color: true, type: true }
          })
        : Promise.resolve([])
    ]);
    const materializedNonCard = historyRows.filter((row) => !row.creditCardInvoice);
    const materializedCard = historyRows.filter((row) => row.creditCardInvoice);

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
      const monthKey = formatFinancialMonthKey(addFinancialMonths(rangeStart, index));
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
      const relevantDate = recognitionPerspective === 'SETTLEMENT'
        ? transaction.effectiveDate || transaction.date
        : recognitionPerspective === 'ECONOMIC'
          ? transaction.date
          : transaction.dueDate || transaction.date;
      const monthKey = formatFinancialMonthKey(relevantDate);
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
      const relevantDate = recognitionPerspective === 'ECONOMIC'
        ? transaction.date
        : recognitionPerspective === 'SETTLEMENT'
          ? transaction.creditCardInvoice?.settledAt || transaction.creditCardInvoice?.dueDate
          : transaction.creditCardInvoice?.dueDate;

      if (!relevantDate) {
        continue;
      }

      const monthKey = formatFinancialMonthKey(relevantDate);
      const totals = monthTotals.get(monthKey);

      if (!totals) {
        continue;
      }

      const amount = getCreditCardInvoiceSignedAmount(transaction);
      totals.expenseTotal = totals.expenseTotal.plus(amount);
      addCategorySeriesAmount(transaction.categoryId, monthKey, amount);
    }

    return {
      months: totalMonths,
      recognitionPerspective,
      monthlyTotals: [...monthTotals.entries()].map(([month, totals]) => ({
        month,
        incomeTotal: toMoneyString(totals.incomeTotal),
        expenseTotal: toMoneyString(totals.expenseTotal),
        isPartialCurrentMonth: month === formatFinancialMonthKey(currentMonthStart)
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
