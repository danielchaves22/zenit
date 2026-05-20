import {
  AccountType,
  Budget,
  BudgetEntry,
  BudgetEntryAllocationMode,
  BudgetEntryType,
  BudgetKind,
  BudgetStatus,
  Company,
  FinancialAccountPurpose,
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import cacheService from './cache.service';
import FinancialStructureService from './financial-structure.service';
import FinancialTransactionService from './financial-transaction.service';
import {
  buildCanonicalBusinessDate,
  diffBusinessDays,
  extractCalendarDateInTimeZone,
  getBusinessDateInTimeZone,
  resolveTimeZone
} from '../utils/time-zone';

const prisma = new PrismaClient();

type BudgetEntrySyncInput = {
  clientKey: string;
  entryType: BudgetEntryType;
  allocationMode?: BudgetEntryAllocationMode | null;
  amountCents: number;
  principalImpactAmountCents: number;
  occurredAt: string;
  description?: string | null;
  affectsBudgetBalance?: boolean;
  createdAt: string;
  updatedAt: string;
};

type BudgetSyncInput = {
  clientKey: string;
  code: string;
  kind: BudgetKind;
  status: BudgetStatus;
  initialBalanceCents: number;
  currentBalanceCents: number;
  targetEndingBalanceCents: number;
  dailyBudgetInitialCents: number;
  dailyBudgetCurrentCents: number;
  dayExtraBalanceCents: number;
  startDate: string;
  endDate: string;
  lastDailyBudgetDate: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  entries: BudgetEntrySyncInput[];
};

type BudgetSyncConflict = {
  scope: 'budget' | 'entry';
  budgetClientKey: string;
  entryClientKey?: string;
};

type SerializedBudget = {
  clientKey: string;
  code: string;
  kind: BudgetKind;
  status: BudgetStatus;
  initialBalanceCents: number;
  currentBalanceCents: number;
  targetEndingBalanceCents: number;
  dailyBudgetInitialCents: number;
  dailyBudgetCurrentCents: number;
  dayExtraBalanceCents: number;
  startDate: string;
  endDate: string;
  lastDailyBudgetDate: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  entries: Array<{
    clientKey: string;
    entryType: BudgetEntryType;
    allocationMode: BudgetEntryAllocationMode | null;
    amountCents: number;
    principalImpactAmountCents: number;
    occurredAt: string;
    description: string | null;
    affectsBudgetBalance: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
};

type BudgetListResult = {
  timeZone: string;
  businessDate: string;
  budgets: SerializedBudget[];
};

type BudgetSyncResult = BudgetListResult & {
  conflicts: BudgetSyncConflict[];
};

type BudgetWithEntries = Prisma.BudgetGetPayload<{
  include: {
    entries: {
      orderBy: [{ occurredAt: 'asc' }, { clientCreatedAt: 'asc' }, { clientKey: 'asc' }];
    };
    financialAccount: true;
  };
}>;

type ProjectionPlan = {
  type: TransactionType;
  amount: Prisma.Decimal;
  fromAccountId?: number;
  toAccountId?: number;
};

type CanonicalBudgetState = {
  currentBalanceCents: number;
  dailyBudgetInitialCents: number;
  dailyBudgetCurrentCents: number;
  dayExtraBalanceCents: number;
  lastDailyBudgetDate: Date;
};

type BudgetEntryWithAmount = BudgetEntry & {
  amount: Prisma.Decimal;
  principalImpactAmount: Prisma.Decimal;
};

export default class BudgetService {
  static async listBudgets(companyId: number, userId: number): Promise<BudgetListResult> {
    const company = await this.getCompanyForBudgetSync(companyId);
    const budgets = await prisma.budget.findMany({
      where: { companyId, userId },
      include: {
        entries: {
          orderBy: [{ occurredAt: 'asc' }, { clientCreatedAt: 'asc' }, { clientKey: 'asc' }]
        },
        financialAccount: true
      },
      orderBy: [{ isPrimary: 'desc' }, { clientCreatedAt: 'asc' }]
    });

    return {
      timeZone: company.timeZone,
      businessDate: getBusinessDateInTimeZone(company.timeZone).toISOString(),
      budgets: this.serializeBudgets(budgets)
    };
  }

  static async syncBudgets(
    companyId: number,
    userId: number,
    deviceId: string,
    budgets: BudgetSyncInput[]
  ): Promise<BudgetSyncResult> {
    const company = await this.getCompanyForBudgetSync(companyId);
    const conflicts: BudgetSyncConflict[] = [];

    for (const budgetInput of budgets) {
      await this.syncSingleBudget(company, userId, deviceId, budgetInput, conflicts);
    }

    await this.normalizePrimaryBudget(companyId, userId);

    const canonical = await this.listBudgets(companyId, userId);

    return {
      ...canonical,
      conflicts
    };
  }

  private static async syncSingleBudget(
    company: { id: number; timeZone: string },
    userId: number,
    deviceId: string,
    input: BudgetSyncInput,
    conflicts: BudgetSyncConflict[]
  ): Promise<void> {
    const companyId = company.id;
    const incomingUpdatedAt = new Date(input.updatedAt);
    const incomingCreatedAt = new Date(input.createdAt);
    const existingBudget = await prisma.budget.findUnique({
      where: {
        unique_budget_client_key: {
          companyId,
          userId,
          clientKey: input.clientKey
        }
      },
      include: {
        entries: true,
        financialAccount: true
      }
    });

    const shouldApplyBudgetFields =
      !existingBudget ||
      existingBudget.clientUpdatedAt.getTime() <= incomingUpdatedAt.getTime();

    if (!shouldApplyBudgetFields && existingBudget) {
      conflicts.push({
        scope: 'budget',
        budgetClientKey: input.clientKey
      });
    }

    const budgetIdentity = existingBudget ?? input;
    const financialAccountId = await this.ensureBudgetFinancialAccount(
      companyId,
      budgetIdentity,
      existingBudget
    );

    const normalizedStartDate = this.parseBusinessDate(input.startDate, company.timeZone);
    const normalizedEndDate = this.parseBusinessDate(input.endDate, company.timeZone);
    const normalizedLastDailyBudgetDate = this.parseBusinessDate(
      input.lastDailyBudgetDate,
      company.timeZone
    );

    const budgetRecord = existingBudget
      ? await prisma.budget.update({
          where: { id: existingBudget.id },
          data: shouldApplyBudgetFields
            ? {
                code: input.code,
                kind: input.kind,
                status: input.status,
                initialBalance: this.centsToDecimal(input.initialBalanceCents),
                targetEndingBalance: this.centsToDecimal(input.targetEndingBalanceCents),
                startDate: normalizedStartDate,
                endDate: normalizedEndDate,
                isPrimary: input.isPrimary,
                clientCreatedAt: incomingCreatedAt,
                clientUpdatedAt: incomingUpdatedAt,
                financialAccountId
              }
            : {
                financialAccountId
              }
        })
      : await prisma.budget.create({
          data: {
            companyId,
            userId,
            clientKey: input.clientKey,
            code: input.code,
            kind: input.kind,
            status: input.status,
            initialBalance: this.centsToDecimal(input.initialBalanceCents),
            currentBalance: this.centsToDecimal(input.currentBalanceCents),
            targetEndingBalance: this.centsToDecimal(input.targetEndingBalanceCents),
            dailyBudgetInitial: this.centsToDecimal(input.dailyBudgetInitialCents),
            dailyBudgetCurrent: this.centsToDecimal(input.dailyBudgetCurrentCents),
            dayExtraBalance: this.centsToDecimal(input.dayExtraBalanceCents),
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            lastDailyBudgetDate: normalizedLastDailyBudgetDate,
            isPrimary: input.isPrimary,
            financialAccountId,
            clientCreatedAt: incomingCreatedAt,
            clientUpdatedAt: incomingUpdatedAt
          }
        });

    const existingEntries = await prisma.budgetEntry.findMany({
      where: { budgetId: budgetRecord.id }
    });
    const existingEntriesByClientKey = new Map(
      existingEntries.map((entry) => [entry.clientKey, entry] as const)
    );

    for (const entryInput of input.entries) {
      const existingEntry = existingEntriesByClientKey.get(entryInput.clientKey);
      const incomingEntryUpdatedAt = new Date(entryInput.updatedAt);

      if (existingEntry && existingEntry.clientUpdatedAt.getTime() > incomingEntryUpdatedAt.getTime()) {
        conflicts.push({
          scope: 'entry',
          budgetClientKey: input.clientKey,
          entryClientKey: entryInput.clientKey
        });
        continue;
      }

      const entryData: Prisma.BudgetEntryUncheckedCreateInput = {
        budgetId: budgetRecord.id,
        clientKey: entryInput.clientKey,
        entryType: entryInput.entryType,
        allocationMode: entryInput.allocationMode ?? null,
        amount: this.centsToDecimal(entryInput.amountCents),
        principalImpactAmount: this.centsToDecimal(entryInput.principalImpactAmountCents),
        occurredAt: this.parseBusinessDate(entryInput.occurredAt, company.timeZone),
        description: entryInput.description ?? null,
        affectsBudgetBalance: entryInput.affectsBudgetBalance ?? true,
        clientCreatedAt: new Date(entryInput.createdAt),
        clientUpdatedAt: incomingEntryUpdatedAt
      };

      if (existingEntry) {
        await prisma.budgetEntry.update({
          where: { id: existingEntry.id },
          data: entryData
        });
      } else {
        await prisma.budgetEntry.create({
          data: entryData
        });
      }
    }

    await this.reconcileBudgetProjection(
      budgetRecord.id,
      company.timeZone,
      companyId,
      userId,
      deviceId
    );
  }

  private static async getCompanyForBudgetSync(companyId: number): Promise<{
    id: number;
    timeZone: string;
  }> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        timeZone: true
      }
    });

    if (!company) {
      throw new Error('Empresa nao encontrada');
    }

    return {
      id: company.id,
      timeZone: resolveTimeZone(company.timeZone)
    };
  }

  private static async ensureBudgetFinancialAccount(
    companyId: number,
    budgetIdentity:
      | BudgetSyncInput
      | (Budget & { financialAccount: { id: number; name: string } | null }),
    existingBudget: (Budget & { financialAccount: { id: number; name: string } | null }) | null
  ): Promise<number> {
    if (existingBudget?.financialAccountId) {
      await prisma.financialAccount.update({
        where: { id: existingBudget.financialAccountId },
        data: {
          name: this.buildAccountName(budgetIdentity.clientKey, budgetIdentity.code),
          purpose: FinancialAccountPurpose.BUDGET,
          isSystemManaged: true,
          type: AccountType.CASH,
          allowNegativeBalance: true
        }
      });

      return existingBudget.financialAccountId;
    }

    const account = await prisma.financialAccount.create({
      data: {
        name: this.buildAccountName(budgetIdentity.clientKey, budgetIdentity.code),
        type: AccountType.CASH,
        purpose: FinancialAccountPurpose.BUDGET,
        balance: this.centsToDecimal(0),
        allowNegativeBalance: true,
        isSystemManaged: true,
        companyId
      }
    });

    return account.id;
  }

  private static buildAccountName(clientKey: string, code: string): string {
    const stableSuffix = clientKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `Orcamento ${code} ${stableSuffix}`.trim();
  }

  private static async reconcileBudgetProjection(
    budgetId: number,
    timeZone: string,
    companyId: number,
    userId: number,
    deviceId: string
  ): Promise<void> {
    const budget = (await prisma.budget.findUnique({
      where: { id: budgetId },
      include: {
        entries: {
          orderBy: [{ occurredAt: 'asc' }, { clientCreatedAt: 'asc' }, { clientKey: 'asc' }]
        },
        financialAccount: true
      }
    })) as BudgetWithEntries | null;

    if (!budget) {
      return;
    }

    const canonical = this.calculateCanonicalBudgetState(
      budget,
      budget.entries,
      timeZone
    );
    const defaults = await this.ensureDefaultCategories(companyId);

    for (const entry of budget.entries) {
      const plan = this.buildProjectionPlan(entry, budget.financialAccountId);

      if (!plan) {
        if (entry.financialTransactionId) {
          await FinancialTransactionService.deleteTransaction(entry.financialTransactionId, {
            companyId
          });
          await prisma.budgetEntry.update({
            where: { id: entry.id },
            data: {
              financialTransactionId: null
            }
          });
        }
        continue;
      }

      const transactionPayload = {
        description: this.buildTransactionDescription(budget, entry),
        amount: plan.amount.toString(),
        date: entry.occurredAt,
        dueDate: entry.occurredAt,
        effectiveDate: entry.occurredAt,
        type: plan.type,
        status: TransactionStatus.COMPLETED,
        notes: `Budget ${budget.code} / entry ${entry.clientKey} / device ${deviceId}`,
        fromAccountId: plan.fromAccountId ?? null,
        toAccountId: plan.toAccountId ?? null,
        categoryId:
          plan.type === TransactionType.INCOME
            ? defaults.incomeCategoryId
            : defaults.expenseCategoryId,
        tags: ['budget-sync']
      };

      if (entry.financialTransactionId) {
        await FinancialTransactionService.updateTransaction(
          entry.financialTransactionId,
          transactionPayload,
          companyId
        );
      } else {
        const created = await FinancialTransactionService.createTransaction({
          ...transactionPayload,
          companyId,
          createdBy: userId
        });

        const createdTransaction = Array.isArray(created) ? created[0] : created;
        await prisma.budgetEntry.update({
          where: { id: entry.id },
          data: {
            financialTransactionId: createdTransaction.id
          }
        });
      }
    }

    await prisma.budget.update({
      where: { id: budget.id },
      data: {
        currentBalance: this.centsToDecimal(canonical.currentBalanceCents),
        dailyBudgetInitial: this.centsToDecimal(canonical.dailyBudgetInitialCents),
        dailyBudgetCurrent: this.centsToDecimal(canonical.dailyBudgetCurrentCents),
        dayExtraBalance: this.centsToDecimal(canonical.dayExtraBalanceCents),
        lastDailyBudgetDate: canonical.lastDailyBudgetDate
      }
    });

    await prisma.financialAccount.update({
      where: { id: budget.financialAccountId },
      data: {
        balance: this.centsToDecimal(canonical.currentBalanceCents),
        purpose: FinancialAccountPurpose.BUDGET,
        isSystemManaged: true,
        allowNegativeBalance: true,
        isActive: budget.status !== BudgetStatus.DELETED
      }
    });

    await cacheService.del(cacheService.getAccountBalanceKey(budget.financialAccountId));
    await cacheService.invalidatePattern(`dashboard:${companyId}:*`);
    await cacheService.invalidatePattern(`transactions:${companyId}:*`);
  }

  private static calculateCanonicalBudgetState(
    budget: Budget,
    entries: BudgetEntryWithAmount[],
    timeZone: string
  ): CanonicalBudgetState {
    const businessDate = getBusinessDateInTimeZone(timeZone);
    const startDate = this.toCanonicalDay(budget.startDate, timeZone);
    const endDate = this.toCanonicalDay(budget.endDate, timeZone);
    const initialBalanceCents = this.decimalToCents(budget.initialBalance);
    const targetEndingBalanceCents = this.decimalToCents(budget.targetEndingBalance);

    let currentBalanceCents = initialBalanceCents;
    let dayExtraBalanceCents = 0;
    let dailyBudgetInitialCents = this.computeDailyBudgetInitial(
      budget.kind,
      initialBalanceCents,
      targetEndingBalanceCents,
      startDate,
      endDate
    );
    let dailyBudgetCurrentCents = dailyBudgetInitialCents;
    let lastDailyBudgetDate = startDate;

    const todayEntries = entries.filter((entry) => {
      const entryDate = this.toCanonicalDay(entry.occurredAt, timeZone);
      return diffBusinessDays(entryDate, businessDate) <= 0;
    });

    for (let currentDay = startDate; diffBusinessDays(currentDay, businessDate) <= 0; ) {
      if (diffBusinessDays(currentDay, startDate) > 0) {
        const rolled = this.rollDailyBudget(
          dailyBudgetCurrentCents,
          currentBalanceCents,
          budget.kind,
          targetEndingBalanceCents,
          currentDay,
          endDate
        );
        dailyBudgetCurrentCents = rolled.dailyBudgetCurrentCents;
        lastDailyBudgetDate = rolled.lastDailyBudgetDate;
      }

      for (const entry of todayEntries) {
        if (!this.sameBusinessDay(entry.occurredAt, currentDay, timeZone)) {
          continue;
        }

        const amountCents = this.decimalToCents(entry.amount);

        if (entry.entryType === BudgetEntryType.INCOME) {
          if (budget.kind === BudgetKind.SPENDING) {
            if (entry.allocationMode === BudgetEntryAllocationMode.EXTRA) {
              dayExtraBalanceCents += amountCents;
            } else {
              currentBalanceCents += amountCents;
              dailyBudgetCurrentCents += this.divideCents(
                amountCents,
                this.daysRemaining(currentDay, endDate)
              );
            }
          } else {
            currentBalanceCents += amountCents;
            dailyBudgetCurrentCents = this.recalculateDailyBudgetCurrent(
              dailyBudgetCurrentCents,
              currentBalanceCents,
              budget.kind,
              targetEndingBalanceCents,
              currentDay,
              endDate
            );
          }
          continue;
        }

        if (entry.entryType === BudgetEntryType.EXPENSE) {
          if (dayExtraBalanceCents >= amountCents) {
            dayExtraBalanceCents -= amountCents;
          } else {
            const remainder = amountCents - dayExtraBalanceCents;
            dayExtraBalanceCents = 0;
            currentBalanceCents -= remainder;
          }
          continue;
        }

        const principalImpactAmountCents = this.decimalToCents(entry.principalImpactAmount);
        currentBalanceCents += principalImpactAmountCents;
      }

      if (this.sameUtcDate(currentDay, businessDate)) {
        break;
      }

      currentDay = this.addBusinessDays(currentDay, 1);
    }

    return {
      currentBalanceCents,
      dailyBudgetInitialCents,
      dailyBudgetCurrentCents,
      dayExtraBalanceCents,
      lastDailyBudgetDate
    };
  }

  private static rollDailyBudget(
    currentDailyBudgetCents: number,
    currentBalanceCents: number,
    kind: BudgetKind,
    targetEndingBalanceCents: number,
    currentDay: Date,
    endDate: Date
  ): { dailyBudgetCurrentCents: number; lastDailyBudgetDate: Date } {
    const daysRemaining = this.daysRemaining(currentDay, endDate);
    if (daysRemaining <= 0) {
      return {
        dailyBudgetCurrentCents: currentDailyBudgetCents,
        lastDailyBudgetDate: this.addBusinessDays(currentDay, -1)
      };
    }

    return {
      dailyBudgetCurrentCents: this.computeDailyBudgetCurrent(
        kind,
        currentBalanceCents,
        targetEndingBalanceCents,
        daysRemaining
      ),
      lastDailyBudgetDate: currentDay
    };
  }

  private static recalculateDailyBudgetCurrent(
    currentDailyBudgetCents: number,
    currentBalanceCents: number,
    kind: BudgetKind,
    targetEndingBalanceCents: number,
    currentDay: Date,
    endDate: Date
  ): number {
    const daysRemaining = this.daysRemaining(currentDay, endDate);
    if (daysRemaining <= 0) {
      return currentDailyBudgetCents;
    }

    return this.computeDailyBudgetCurrent(
      kind,
      currentBalanceCents,
      targetEndingBalanceCents,
      daysRemaining
    );
  }

  private static computeDailyBudgetInitial(
    kind: BudgetKind,
    initialBalanceCents: number,
    targetEndingBalanceCents: number,
    startDate: Date,
    endDate: Date
  ): number {
    const totalDays = diffBusinessDays(endDate, startDate) + 1;
    if (totalDays <= 0) {
      return 0;
    }

    const available =
      kind === BudgetKind.SPENDING
        ? initialBalanceCents - targetEndingBalanceCents
        : targetEndingBalanceCents - initialBalanceCents;

    return this.divideCents(available, totalDays);
  }

  private static computeDailyBudgetCurrent(
    kind: BudgetKind,
    currentBalanceCents: number,
    targetEndingBalanceCents: number,
    daysRemaining: number
  ): number {
    if (daysRemaining <= 0) {
      return 0;
    }

    const available =
      kind === BudgetKind.SPENDING
        ? currentBalanceCents - targetEndingBalanceCents
        : targetEndingBalanceCents - currentBalanceCents;

    return this.divideCents(available, daysRemaining);
  }

  private static divideCents(valueInCents: number, divisor: number): number {
    if (divisor <= 0) {
      return 0;
    }

    return Math.round(valueInCents / divisor);
  }

  private static parseBusinessDate(rawValue: string, timeZone: string): Date {
    return buildCanonicalBusinessDate(
      extractCalendarDateInTimeZone(new Date(rawValue), timeZone)
    );
  }

  private static toCanonicalDay(date: Date, timeZone: string): Date {
    return buildCanonicalBusinessDate(extractCalendarDateInTimeZone(date, timeZone));
  }

  private static daysRemaining(currentDay: Date, endDate: Date): number {
    return diffBusinessDays(endDate, currentDay) + 1;
  }

  private static addBusinessDays(date: Date, delta: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta, 12, 0, 0, 0));
  }

  private static sameBusinessDay(left: Date, right: Date, timeZone: string): boolean {
    return this.sameUtcDate(this.toCanonicalDay(left, timeZone), right);
  }

  private static sameUtcDate(left: Date, right: Date): boolean {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate()
    );
  }

  private static async normalizePrimaryBudget(companyId: number, userId: number): Promise<void> {
    const activeBudgets = await prisma.budget.findMany({
      where: {
        companyId,
        userId,
        status: BudgetStatus.ACTIVE
      },
      orderBy: [{ isPrimary: 'desc' }, { clientUpdatedAt: 'desc' }, { clientCreatedAt: 'asc' }]
    });

    if (activeBudgets.length === 0) {
      return;
    }

    const preferred = activeBudgets.find((budget) => budget.isPrimary) ?? activeBudgets[0];

    await Promise.all(
      activeBudgets.map((budget) =>
        prisma.budget.update({
          where: { id: budget.id },
          data: {
            isPrimary: budget.id === preferred.id
          }
        })
      )
    );
  }

  private static buildProjectionPlan(
    entry: BudgetEntry,
    financialAccountId: number
  ): ProjectionPlan | null {
    const principalImpact = new Prisma.Decimal(entry.principalImpactAmount);

    if (principalImpact.eq(0)) {
      return null;
    }

    if (entry.entryType === BudgetEntryType.EXPENSE) {
      return {
        type: TransactionType.EXPENSE,
        amount: principalImpact.abs(),
        fromAccountId: financialAccountId
      };
    }

    if (entry.entryType === BudgetEntryType.INCOME) {
      return {
        type: TransactionType.INCOME,
        amount: principalImpact.abs(),
        toAccountId: financialAccountId
      };
    }

    if (principalImpact.gt(0)) {
      return {
        type: TransactionType.INCOME,
        amount: principalImpact.abs(),
        toAccountId: financialAccountId
      };
    }

    return {
      type: TransactionType.EXPENSE,
      amount: principalImpact.abs(),
      fromAccountId: financialAccountId
    };
  }

  private static async ensureDefaultCategories(companyId: number): Promise<{
    incomeCategoryId: number;
    expenseCategoryId: number;
  }> {
    await FinancialStructureService.ensureFinancialStructure(companyId);

    const [incomeCategory, expenseCategory] = await Promise.all([
      prisma.financialCategory.findFirst({
        where: {
          companyId,
          type: TransactionType.INCOME,
          isDefault: true
        },
        select: { id: true }
      }),
      prisma.financialCategory.findFirst({
        where: {
          companyId,
          type: TransactionType.EXPENSE,
          isDefault: true
        },
        select: { id: true }
      })
    ]);

    if (!incomeCategory || !expenseCategory) {
      throw new Error('Categorias padrao nao encontradas para projecao de budget');
    }

    return {
      incomeCategoryId: incomeCategory.id,
      expenseCategoryId: expenseCategory.id
    };
  }

  private static buildTransactionDescription(budget: Budget, entry: BudgetEntry): string {
    if (entry.description && entry.description.trim()) {
      return entry.description.trim();
    }

    if (entry.entryType === BudgetEntryType.INCOME) {
      return `Entrada do orcamento ${budget.code}`;
    }

    if (entry.entryType === BudgetEntryType.EXPENSE) {
      return `Saida do orcamento ${budget.code}`;
    }

    return `Ajuste do orcamento ${budget.code}`;
  }

  private static centsToDecimal(valueInCents: number): Prisma.Decimal {
    return new Prisma.Decimal(valueInCents).div(100);
  }

  private static decimalToCents(value: Prisma.Decimal | string | number): number {
    return new Prisma.Decimal(value).times(100).toDecimalPlaces(0).toNumber();
  }

  private static serializeBudgets(budgets: BudgetWithEntries[]): SerializedBudget[] {
    return budgets.map((budget) => ({
      clientKey: budget.clientKey,
      code: budget.code,
      kind: budget.kind,
      status: budget.status,
      initialBalanceCents: this.decimalToCents(budget.initialBalance),
      currentBalanceCents: this.decimalToCents(budget.currentBalance),
      targetEndingBalanceCents: this.decimalToCents(budget.targetEndingBalance),
      dailyBudgetInitialCents: this.decimalToCents(budget.dailyBudgetInitial),
      dailyBudgetCurrentCents: this.decimalToCents(budget.dailyBudgetCurrent),
      dayExtraBalanceCents: this.decimalToCents(budget.dayExtraBalance),
      startDate: budget.startDate.toISOString(),
      endDate: budget.endDate.toISOString(),
      lastDailyBudgetDate: budget.lastDailyBudgetDate.toISOString(),
      isPrimary: budget.isPrimary,
      createdAt: budget.clientCreatedAt.toISOString(),
      updatedAt: budget.clientUpdatedAt.toISOString(),
      entries: budget.entries.map((entry) => ({
        clientKey: entry.clientKey,
        entryType: entry.entryType,
        allocationMode: entry.allocationMode,
        amountCents: this.decimalToCents(entry.amount),
        principalImpactAmountCents: this.decimalToCents(entry.principalImpactAmount),
        occurredAt: entry.occurredAt.toISOString(),
        description: entry.description,
        affectsBudgetBalance: entry.affectsBudgetBalance,
        createdAt: entry.clientCreatedAt.toISOString(),
        updatedAt: entry.clientUpdatedAt.toISOString()
      }))
    }));
  }
}
