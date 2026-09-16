import prisma from '../lib/prisma';
import {
  AccountType,
  FinancialPlanningObjectiveKind,
  FinancialPlanningSnapshotStatus,
  FinancialProvisionStatus,
  Prisma,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import PersonalFinancialProfileService from './personal-financial-profile.service';
import { buildOperationalTransactionWhere } from '../utils/financial-transaction-query';


export type FinancialPlanningSourceKind =
  | 'FIXED_INCOME'
  | 'FIXED_EXPENSE'
  | 'INSTALLMENT'
  | 'PROVISION'
  | 'VARIABLE_EXPENSE';

export type FinancialPlanningSourceOrigin =
  | 'RECURRING_TRANSACTION'
  | 'NON_CARD_INSTALLMENT'
  | 'CREDIT_CARD_INSTALLMENT'
  | 'PROVISION'
  | 'HISTORICAL_CATEGORY';

export type FinancialPlanningSource = {
  key: string;
  kind: FinancialPlanningSourceKind;
  origin: FinancialPlanningSourceOrigin;
  label: string;
  detail: string;
  monthlyAmount: string;
  selectedByDefault: boolean;
  metadata: Record<string, string | number | boolean | null>;
};

export class FinancialPlanningAnalysisError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

type AnalysisContext = {
  workspace: { id: number; name: string };
  profile: NonNullable<Awaited<ReturnType<typeof PersonalFinancialProfileService.get>>['profile']>;
};

function money(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function moneyString(value: Prisma.Decimal | string | number): string {
  return money(value).toFixed(2);
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function formatMonthKey(date: Date): string {
  return formatDateKey(date).slice(0, 7);
}

function monthlyRecurringAmount(amount: Prisma.Decimal, frequency: RecurringFrequency): Prisma.Decimal {
  const factors: Record<RecurringFrequency, Prisma.Decimal> = {
    DAILY: new Prisma.Decimal(365).div(12),
    WEEKLY: new Prisma.Decimal(52).div(12),
    MONTHLY: new Prisma.Decimal(1),
    QUARTERLY: new Prisma.Decimal(1).div(3),
    YEARLY: new Prisma.Decimal(1).div(12)
  };
  return amount.mul(factors[frequency]).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function recurringFrequencyLabel(frequency: RecurringFrequency): string {
  const labels: Record<RecurringFrequency, string> = {
    DAILY: 'Diária',
    WEEKLY: 'Semanal',
    MONTHLY: 'Mensal',
    QUARTERLY: 'Trimestral',
    YEARLY: 'Anual'
  };
  return labels[frequency];
}

function monthsAvailable(startMonth: Date, targetDate: Date): number {
  const current = startOfCurrentMonth();
  const effectiveStart = startMonth > current ? startMonth : current;
  const difference =
    (targetDate.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    targetDate.getUTCMonth() -
    effectiveStart.getUTCMonth();
  return Math.max(1, difference);
}

function provisionMonthlyContribution(provision: {
  expectedAmount: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
  startMonth: Date;
  targetDate: Date;
}): Prisma.Decimal {
  const remaining = Prisma.Decimal.max(
    provision.expectedAmount.minus(provision.reservedAmount),
    0
  );
  if (remaining.isZero()) return new Prisma.Decimal(0);
  return remaining
    .div(monthsAvailable(provision.startMonth, provision.targetDate))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

function lastDate(values: Array<Date | null | undefined>): Date | null {
  const valid = values.filter((value): value is Date => value instanceof Date);
  if (valid.length === 0) return null;
  return valid.sort((left, right) => right.getTime() - left.getTime())[0];
}

function calculateTotals(
  sources: FinancialPlanningSource[],
  selectedSourceKeys: string[],
  targetMonthlySavings: Prisma.Decimal | string | number = 0
) {
  const selected = new Set(selectedSourceKeys);
  const totals = {
    monthlyIncome: new Prisma.Decimal(0),
    monthlyCommittedExpenses: new Prisma.Decimal(0),
    monthlyVariableExpenses: new Prisma.Decimal(0),
    monthlyProvisionContribution: new Prisma.Decimal(0)
  };

  sources.forEach((source) => {
    if (!selected.has(source.key)) return;
    const amount = money(source.monthlyAmount);
    if (source.kind === 'FIXED_INCOME') totals.monthlyIncome = totals.monthlyIncome.plus(amount);
    if (source.kind === 'FIXED_EXPENSE' || source.kind === 'INSTALLMENT') {
      totals.monthlyCommittedExpenses = totals.monthlyCommittedExpenses.plus(amount);
    }
    if (source.kind === 'VARIABLE_EXPENSE') {
      totals.monthlyVariableExpenses = totals.monthlyVariableExpenses.plus(amount);
    }
    if (source.kind === 'PROVISION') {
      totals.monthlyProvisionContribution = totals.monthlyProvisionContribution.plus(amount);
    }
  });

  const monthlyAvailableBeforeGoal = totals.monthlyIncome
    .minus(totals.monthlyCommittedExpenses)
    .minus(totals.monthlyVariableExpenses)
    .minus(totals.monthlyProvisionContribution);
  const monthlyBalanceAfterGoal = monthlyAvailableBeforeGoal.minus(targetMonthlySavings);

  return {
    monthlyIncome: moneyString(totals.monthlyIncome),
    monthlyCommittedExpenses: moneyString(totals.monthlyCommittedExpenses),
    monthlyVariableExpenses: moneyString(totals.monthlyVariableExpenses),
    monthlyProvisionContribution: moneyString(totals.monthlyProvisionContribution),
    monthlyAvailableBeforeGoal: moneyString(monthlyAvailableBeforeGoal),
    monthlyBalanceAfterGoal: moneyString(monthlyBalanceAfterGoal)
  };
}

function serializeSnapshot(snapshot: any) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    objectiveKind: snapshot.objectiveKind,
    targetMonthlySavings: moneyString(snapshot.targetMonthlySavings),
    historyMonths: snapshot.historyMonths,
    historyStartDate: formatDateKey(snapshot.historyStartDate),
    historyEndDate: formatDateKey(snapshot.historyEndDate),
    profileVersion: snapshot.profileVersion,
    methodologyVersion: snapshot.methodologyVersion,
    dataQualityScore: snapshot.dataQualityScore,
    dataQuality: snapshot.dataQuality,
    sources: snapshot.sourceSnapshot,
    selectedSourceKeys: snapshot.selectedSourceKeys,
    totals: snapshot.totals,
    status: snapshot.status,
    confirmedAt: snapshot.confirmedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString()
  };
}

export default class FinancialPlanningAnalysisService {
  private static async context(userId: number, companyId: number): Promise<AnalysisContext> {
    const workspace = await prisma.company.findFirst({
      where: {
        id: companyId,
        isPersonalWorkspace: true,
        personalWorkspaceOwnerId: userId
      },
      select: { id: true, name: true }
    });
    if (!workspace) {
      throw new FinancialPlanningAnalysisError(
        'O planejamento orientado está disponível apenas no seu workspace pessoal',
        'PERSONAL_WORKSPACE_REQUIRED',
        403
      );
    }

    const profileResponse = await PersonalFinancialProfileService.get(userId);
    if (
      profileResponse.personalWorkspace.id !== workspace.id ||
      !profileResponse.profile ||
      profileResponse.state !== 'READY'
    ) {
      const outdated = profileResponse.state === 'OUTDATED';
      throw new FinancialPlanningAnalysisError(
        outdated
          ? 'Revise seu perfil de planejamento financeiro antes de preparar uma análise'
          : 'Conclua seu perfil de planejamento financeiro antes de preparar uma análise',
        outdated ? 'FINANCIAL_PROFILE_OUTDATED' : 'FINANCIAL_PROFILE_REQUIRED',
        409
      );
    }

    return { workspace, profile: profileResponse.profile };
  }

  private static async build(params: { userId: number; companyId: number; historyMonths: number }) {
    const { workspace, profile } = await this.context(params.userId, params.companyId);
    const historyEndExclusive = startOfCurrentMonth();
    const historyStart = addMonths(historyEndExclusive, -params.historyMonths);
    const historyEnd = new Date(historyEndExclusive.getTime() - 1);

    const [recurring, installmentPlans, cardInstallments, provisions, history, latestSnapshot] =
      await Promise.all([
        prisma.recurringTransaction.findMany({
          where: {
            companyId: workspace.id,
            isActive: true,
            type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
            OR: [{ endDate: null }, { endDate: { gte: historyEndExclusive } }]
          },
          select: {
            id: true,
            description: true,
            amount: true,
            type: true,
            frequency: true,
            endDate: true,
            category: { select: { id: true, name: true } }
          },
          orderBy: [{ type: 'asc' }, { description: 'asc' }, { id: 'asc' }]
        }),
        prisma.installmentPlan.findMany({
          where: {
            companyId: workspace.id,
            transactions: {
              some: { status: TransactionStatus.PENDING, archivedAt: null }
            }
          },
          select: {
            id: true,
            description: true,
            transactions: {
              where: { status: TransactionStatus.PENDING, archivedAt: null },
              select: {
                amount: true,
                dueDate: true,
                installmentNumber: true,
                fromAccount: { select: { id: true, name: true } },
                category: { select: { id: true, name: true } }
              },
              orderBy: [{ installmentNumber: 'asc' }, { id: 'asc' }]
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
        }),
        prisma.financialTransaction.findMany({
          where: {
            companyId: workspace.id,
            type: TransactionType.EXPENSE,
            purchaseGroupId: { not: null },
            status: { not: TransactionStatus.CANCELED },
            fromAccount: { is: { type: AccountType.CREDIT_CARD } },
            AND: [
              buildOperationalTransactionWhere(),
              {
                OR: [
                  { creditCardInvoice: { is: { status: { not: 'PAID' } } } },
                  { creditCardInvoiceId: null, dueDate: { gte: historyEndExclusive } },
                  { creditCardInvoiceId: null, scheduledDate: { gte: historyEndExclusive } },
                  { creditCardInvoiceId: null, date: { gte: historyEndExclusive } }
                ]
              }
            ]
          },
          select: {
            id: true,
            purchaseGroupId: true,
            description: true,
            amount: true,
            installmentNumber: true,
            dueDate: true,
            scheduledDate: true,
            date: true,
            fromAccount: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            creditCardInvoice: { select: { dueDate: true, status: true } }
          },
          orderBy: [{ purchaseGroupId: 'asc' }, { installmentNumber: 'asc' }, { id: 'asc' }]
        }),
        prisma.financialProvision.findMany({
          where: { companyId: workspace.id, status: FinancialProvisionStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            expectedAmount: true,
            reservedAmount: true,
            startMonth: true,
            targetDate: true,
            category: { select: { id: true, name: true } }
          },
          orderBy: [{ targetDate: 'asc' }, { id: 'asc' }]
        }),
        prisma.financialTransaction.findMany({
          where: {
            companyId: workspace.id,
            type: { in: [TransactionType.INCOME, TransactionType.EXPENSE] },
            status: TransactionStatus.COMPLETED,
            date: { gte: historyStart, lt: historyEndExclusive },
            ...buildOperationalTransactionWhere()
          },
          select: {
            id: true,
            type: true,
            date: true,
            amount: true,
            paidAmount: true,
            categoryId: true,
            recurringTransactionId: true,
            installmentPlanId: true,
            purchaseGroupId: true,
            totalInstallments: true,
            category: { select: { id: true, name: true } }
          },
          orderBy: [{ date: 'asc' }, { id: 'asc' }]
        }),
        prisma.financialPlanningSnapshot.findFirst({
          where: { ownerUserId: params.userId, personalWorkspaceId: workspace.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        })
      ]);

    const preferenceByCategory = new Map<number, string>(
      profile.categoryPreferences.map(
        (preference: { categoryId: number; flexibility: string }) => [
          preference.categoryId,
          preference.flexibility
        ]
      )
    );
    const sources: FinancialPlanningSource[] = recurring.map((item) => ({
      key: `RECURRING_TRANSACTION:${item.id}`,
      kind: item.type === TransactionType.INCOME ? 'FIXED_INCOME' : 'FIXED_EXPENSE',
      origin: 'RECURRING_TRANSACTION',
      label: item.description,
      detail: `${recurringFrequencyLabel(item.frequency)}${
        item.frequency === 'MONTHLY' ? '' : ' · valor mensal equivalente'
      }${
        item.category ? ` · ${item.category.name}` : ''
      }`,
      monthlyAmount: moneyString(monthlyRecurringAmount(item.amount.abs(), item.frequency)),
      selectedByDefault: true,
      metadata: {
        recurringTransactionId: item.id,
        frequency: item.frequency,
        categoryId: item.category?.id ?? null,
        categoryName: item.category?.name ?? null,
        flexibility: item.category ? preferenceByCategory.get(item.category.id) ?? null : null,
        endDate: item.endDate ? formatDateKey(item.endDate) : null
      }
    }));

    installmentPlans.forEach((plan) => {
      if (plan.transactions.length === 0) return;
      const total = plan.transactions.reduce(
        (sum, transaction) => sum.plus(transaction.amount.abs()),
        new Prisma.Decimal(0)
      );
      const average = total.div(plan.transactions.length);
      const representative = plan.transactions[0];
      const endingAt = lastDate(plan.transactions.map((transaction) => transaction.dueDate));
      sources.push({
        key: `NON_CARD_INSTALLMENT:${plan.id}`,
        kind: 'INSTALLMENT',
        origin: 'NON_CARD_INSTALLMENT',
        label: plan.description,
        detail: `${plan.transactions.length} parcela(s) pendente(s)${
          endingAt ? ` · até ${formatMonthKey(endingAt)}` : ''
        }`,
        monthlyAmount: moneyString(average),
        selectedByDefault: true,
        metadata: {
          installmentPlanId: plan.id,
          remainingInstallments: plan.transactions.length,
          endingAt: endingAt ? formatDateKey(endingAt) : null,
          accountId: representative.fromAccount?.id ?? null,
          accountName: representative.fromAccount?.name ?? null,
          categoryId: representative.category?.id ?? null,
          categoryName: representative.category?.name ?? null,
          flexibility: representative.category
            ? preferenceByCategory.get(representative.category.id) ?? null
            : null
        }
      });
    });

    const cardGroups = new Map<string, typeof cardInstallments>();
    cardInstallments.forEach((transaction) => {
      if (!transaction.purchaseGroupId) return;
      const items = cardGroups.get(transaction.purchaseGroupId) ?? [];
      items.push(transaction);
      cardGroups.set(transaction.purchaseGroupId, items);
    });
    cardGroups.forEach((transactions, purchaseGroupId) => {
      const total = transactions.reduce(
        (sum, transaction) => sum.plus(transaction.amount.abs()),
        new Prisma.Decimal(0)
      );
      const representative = transactions[0];
      if (!representative.fromAccount) return;
      const endingAt = lastDate(
        transactions.flatMap((transaction) => [
          transaction.creditCardInvoice?.dueDate,
          transaction.dueDate,
          transaction.scheduledDate,
          transaction.date
        ])
      );
      sources.push({
        key: `CREDIT_CARD_INSTALLMENT:${purchaseGroupId}`,
        kind: 'INSTALLMENT',
        origin: 'CREDIT_CARD_INSTALLMENT',
        label: representative.description,
        detail: `${representative.fromAccount.name} · ${transactions.length} parcela(s) ainda não paga(s)`,
        monthlyAmount: moneyString(total.div(transactions.length)),
        selectedByDefault: true,
        metadata: {
          purchaseGroupId,
          remainingInstallments: transactions.length,
          endingAt: endingAt ? formatDateKey(endingAt) : null,
          accountId: representative.fromAccount.id,
          accountName: representative.fromAccount.name,
          categoryId: representative.category?.id ?? null,
          categoryName: representative.category?.name ?? null,
          flexibility: representative.category
            ? preferenceByCategory.get(representative.category.id) ?? null
            : null
        }
      });
    });

    provisions.forEach((provision) => {
      const contribution = provisionMonthlyContribution(provision);
      if (contribution.isZero()) return;
      sources.push({
        key: `PROVISION:${provision.id}`,
        kind: 'PROVISION',
        origin: 'PROVISION',
        label: provision.name,
        detail: `${provision.category.name} · objetivo em ${formatMonthKey(provision.targetDate)}`,
        monthlyAmount: moneyString(contribution),
        selectedByDefault: true,
        metadata: {
          provisionId: provision.id,
          categoryId: provision.category.id,
          categoryName: provision.category.name,
          flexibility: preferenceByCategory.get(provision.category.id) ?? null,
          targetDate: formatDateKey(provision.targetDate),
          expectedAmount: moneyString(provision.expectedAmount),
          reservedAmount: moneyString(provision.reservedAmount)
        }
      });
    });

    const coveredMonths = new Set(history.map((transaction) => formatMonthKey(transaction.date)));
    const variableByCategory = new Map<
      number | null,
      { category: { id: number; name: string } | null; total: Prisma.Decimal; transactions: number }
    >();
    history.forEach((transaction) => {
      if (transaction.type !== TransactionType.EXPENSE) return;
      if (
        transaction.recurringTransactionId ||
        transaction.installmentPlanId ||
        transaction.purchaseGroupId ||
        (transaction.totalInstallments ?? 0) > 1
      ) {
        return;
      }
      const current = variableByCategory.get(transaction.categoryId) ?? {
        category: transaction.category,
        total: new Prisma.Decimal(0),
        transactions: 0
      };
      current.total = current.total.plus((transaction.paidAmount ?? transaction.amount).abs());
      current.transactions += 1;
      variableByCategory.set(transaction.categoryId, current);
    });
    const averagingMonths = Math.max(1, coveredMonths.size);
    Array.from(variableByCategory.entries())
      .sort((left, right) => right[1].total.comparedTo(left[1].total))
      .forEach(([categoryId, item]) => {
        sources.push({
          key: `HISTORICAL_CATEGORY:${categoryId ?? 'UNCATEGORIZED'}`,
          kind: 'VARIABLE_EXPENSE',
          origin: 'HISTORICAL_CATEGORY',
          label: item.category?.name ?? 'Despesas sem categoria',
          detail: `Média de ${item.transactions} lançamento(s) em ${averagingMonths} mês(es) com dados`,
          monthlyAmount: moneyString(item.total.div(averagingMonths)),
          selectedByDefault: true,
          metadata: {
            categoryId,
            categoryName: item.category?.name ?? null,
            flexibility: categoryId ? preferenceByCategory.get(categoryId) ?? null : null,
            transactionCount: item.transactions,
            averagingMonths
          }
        });
      });

    const expenseHistory = history.filter((transaction) => transaction.type === TransactionType.EXPENSE);
    const categorizedExpenses = expenseHistory.filter((transaction) => transaction.categoryId !== null);
    const coverageRatio = Math.min(coveredMonths.size / params.historyMonths, 1);
    const categorizationRatio =
      expenseHistory.length > 0 ? categorizedExpenses.length / expenseHistory.length : 0;
    const previousMonthKey = formatMonthKey(addMonths(historyEndExclusive, -1));
    const hasRecentData = coveredMonths.has(previousMonthKey);
    const coverageDeclaredFull = profile.financialDataCoverage === 'FULL';
    const breakdown = [
      { key: 'PROFILE', label: 'Perfil financeiro', points: 20, maximum: 20 },
      {
        key: 'DECLARED_COVERAGE',
        label: 'Cobertura declarada',
        points: coverageDeclaredFull ? 15 : 8,
        maximum: 15
      },
      {
        key: 'HISTORY',
        label: 'Histórico disponível',
        points: Math.round(coverageRatio * 25),
        maximum: 25
      },
      {
        key: 'CATEGORIZATION',
        label: 'Categorização dos gastos',
        points: Math.round(categorizationRatio * 25),
        maximum: 25
      },
      {
        key: 'RECENCY',
        label: 'Atualidade dos dados',
        points: hasRecentData ? 15 : coveredMonths.size > 0 ? 7 : 0,
        maximum: 15
      }
    ];
    const score = breakdown.reduce((sum, item) => sum + item.points, 0);
    const issues: Array<{ code: string; severity: 'INFO' | 'WARNING'; message: string }> = [];
    if (!coverageDeclaredFull) {
      issues.push({
        code: 'PARTIAL_COVERAGE',
        severity: 'WARNING',
        message: 'O perfil informa que o Zenit representa apenas parte da vida financeira.'
      });
    }
    if (coveredMonths.size < params.historyMonths) {
      issues.push({
        code: 'INCOMPLETE_HISTORY',
        severity: 'WARNING',
        message: `Há movimentação em ${coveredMonths.size} dos ${params.historyMonths} meses solicitados.`
      });
    }
    if (expenseHistory.length > categorizedExpenses.length) {
      issues.push({
        code: 'UNCATEGORIZED_EXPENSES',
        severity: 'WARNING',
        message: `${expenseHistory.length - categorizedExpenses.length} gasto(s) do período estão sem categoria.`
      });
    }
    if (!sources.some((source) => source.kind === 'FIXED_INCOME')) {
      issues.push({
        code: 'NO_FIXED_INCOME',
        severity: 'WARNING',
        message: 'Nenhuma receita fixa ativa foi encontrada para sustentar o objetivo mensal.'
      });
    }
    if (!sources.some((source) => source.kind === 'VARIABLE_EXPENSE')) {
      issues.push({
        code: 'NO_VARIABLE_HISTORY',
        severity: 'INFO',
        message: 'Não há gastos variáveis históricos suficientes para formar médias por categoria.'
      });
    }
    const dataQuality = {
      score,
      rating: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
      requestedMonths: params.historyMonths,
      monthsWithData: coveredMonths.size,
      historyTransactionCount: history.length,
      expenseTransactionCount: expenseHistory.length,
      categorizedExpenseCount: categorizedExpenses.length,
      breakdown,
      issues
    };
    const defaultSelectedSourceKeys = sources
      .filter((source) => source.selectedByDefault)
      .map((source) => source.key);

    return {
      workspace,
      profile: {
        version: profile.version,
        financialDataCoverage: profile.financialDataCoverage,
        lastReviewedAt: profile.lastReviewedAt
      },
      period: {
        historyMonths: params.historyMonths,
        startDate: formatDateKey(historyStart),
        endDate: formatDateKey(historyEnd)
      },
      dataQuality,
      sources,
      defaultSelectedSourceKeys,
      defaultTotals: calculateTotals(sources, defaultSelectedSourceKeys),
      latestSnapshot: serializeSnapshot(latestSnapshot),
      rawPeriod: { historyStart, historyEnd }
    };
  }

  static async preview(params: { userId: number; companyId: number; historyMonths: number }) {
    const { rawPeriod: _rawPeriod, ...response } = await this.build(params);
    return response;
  }

  static async confirm(params: {
    userId: number;
    companyId: number;
    historyMonths: number;
    targetMonthlySavings: string;
    selectedSourceKeys: string[];
  }) {
    const prepared = await this.build(params);
    const availableKeys = new Set(prepared.sources.map((source) => source.key));
    if (params.selectedSourceKeys.some((key) => !availableKeys.has(key))) {
      throw new FinancialPlanningAnalysisError(
        'Uma ou mais fontes selecionadas não estão mais disponíveis',
        'INVALID_SOURCE_SELECTION',
        400
      );
    }
    const hasFixedIncome = prepared.sources.some(
      (source) =>
        source.kind === 'FIXED_INCOME' && params.selectedSourceKeys.includes(source.key)
    );
    if (!hasFixedIncome) {
      throw new FinancialPlanningAnalysisError(
        'Selecione ao menos uma receita fixa para confirmar o diagnóstico',
        'INCOME_SOURCE_REQUIRED',
        400
      );
    }

    const target = money(params.targetMonthlySavings);
    const totals = calculateTotals(prepared.sources, params.selectedSourceKeys, target);
    const selected = new Set(params.selectedSourceKeys);
    const sourceSnapshot = prepared.sources.map((source) => ({
      ...source,
      selected: selected.has(source.key)
    }));

    const snapshot = await prisma.financialPlanningSnapshot.create({
      data: {
        ownerUserId: params.userId,
        personalWorkspaceId: params.companyId,
        objectiveKind: FinancialPlanningObjectiveKind.MONTHLY_SAVINGS,
        targetMonthlySavings: target,
        historyMonths: params.historyMonths,
        historyStartDate: prepared.rawPeriod.historyStart,
        historyEndDate: prepared.rawPeriod.historyEnd,
        profileVersion: prepared.profile.version,
        methodologyVersion: 1,
        dataQualityScore: prepared.dataQuality.score,
        dataQuality: prepared.dataQuality as Prisma.InputJsonValue,
        sourceSnapshot: sourceSnapshot as Prisma.InputJsonValue,
        selectedSourceKeys: params.selectedSourceKeys as Prisma.InputJsonValue,
        totals: totals as Prisma.InputJsonValue,
        monthlyIncome: totals.monthlyIncome,
        monthlyCommittedExpenses: totals.monthlyCommittedExpenses,
        monthlyVariableExpenses: totals.monthlyVariableExpenses,
        monthlyProvisionContribution: totals.monthlyProvisionContribution,
        monthlyAvailableBeforeGoal: totals.monthlyAvailableBeforeGoal,
        monthlyBalanceAfterGoal: totals.monthlyBalanceAfterGoal,
        status: FinancialPlanningSnapshotStatus.CONFIRMED
      }
    });

    return serializeSnapshot(snapshot);
  }
}

export const __private__ = {
  calculateTotals,
  monthlyRecurringAmount,
  provisionMonthlyContribution
};
