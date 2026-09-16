import prisma from '../lib/prisma';
import {
  FinancialProvisionEntryType,
  FinancialProvisionKind,
  FinancialProvisionStatus,
  Prisma,
  PrismaClient,
  TransactionType
} from '@prisma/client';
import WorkspaceFinancialCalendarService from './workspace-financial-calendar.service';
import {
  addFinancialMonths,
  FinancialCalendarContext,
  formatFinancialDateKey,
  formatFinancialMonthKey,
  parseFinancialDateKey,
  parseFinancialMonthKey
} from '../utils/financial-calendar';
import {
  calculateProvisionMonthlyContribution,
  calculateProvisionMonthsAvailable
} from '../utils/financial-provision-calculator';


type ProvisionClient = PrismaClient | Prisma.TransactionClient;

type ProvisionInput = {
  name: string;
  categoryId: number;
  kind: FinancialProvisionKind;
  expectedAmount: string;
  startMonth: string;
  targetDate: string;
  notes?: string | null;
};

type FinancialProvisionValidationIssue = {
  field: 'startMonth' | 'targetDate' | 'occurredAt';
  message: string;
};

export class FinancialProvisionValidationError extends Error {
  constructor(readonly issues: FinancialProvisionValidationIssue[]) {
    super(issues[0]?.message ?? 'Dados da provisão inválidos');
  }
}

function firstOfMonth(date: Date): Date {
  return parseFinancialMonthKey(formatFinancialMonthKey(date));
}

function addYearsClamped(date: Date, amount: number): Date {
  const nextYear = date.getUTCFullYear() + amount;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextYear, month, Math.min(date.getUTCDate(), lastDay), 12, 0, 0, 0));
}

function toMoney(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function moneyString(value: Prisma.Decimal | string | number): string {
  return toMoney(value).toFixed(2);
}

function derivedState(provision: {
  status: FinancialProvisionStatus;
  expectedAmount: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
  targetDate: Date;
}, calendar: FinancialCalendarContext): 'PLANNED' | 'IN_PROGRESS' | 'FUNDED' | 'OVERDUE' | 'COMPLETED' | 'CANCELED' {
  if (provision.status === FinancialProvisionStatus.COMPLETED) return 'COMPLETED';
  if (provision.status === FinancialProvisionStatus.CANCELED) return 'CANCELED';
  if (provision.reservedAmount.greaterThanOrEqualTo(provision.expectedAmount)) return 'FUNDED';
  if (provision.targetDate < calendar.businessDate) return 'OVERDUE';
  if (provision.reservedAmount.greaterThan(0)) return 'IN_PROGRESS';
  return 'PLANNED';
}

function serializeProvision(provision: any, calendar: FinancialCalendarContext) {
  const expectedAmount = toMoney(provision.expectedAmount);
  const reservedAmount = toMoney(provision.reservedAmount);
  const remainingAmount = Prisma.Decimal.max(expectedAmount.minus(reservedAmount), 0);
  const progressPercent = expectedAmount.greaterThan(0)
    ? Prisma.Decimal.min(reservedAmount.div(expectedAmount).mul(100), 100).toDecimalPlaces(1).toNumber()
    : 0;

  return {
    id: provision.id,
    name: provision.name,
    notes: provision.notes,
    kind: provision.kind,
    status: provision.status,
    state: derivedState(provision, calendar),
    category: provision.category,
    expectedAmount: moneyString(expectedAmount),
    reservedAmount: moneyString(reservedAmount),
    remainingAmount: moneyString(remainingAmount),
    monthlyContributionAmount: moneyString(
      provision.status === FinancialProvisionStatus.ACTIVE
        ? calculateProvisionMonthlyContribution(
            {
              expectedAmount,
              reservedAmount,
              startMonth: provision.startMonth,
              targetDate: provision.targetDate
            },
            calendar
          )
        : 0
    ),
    progressPercent,
    monthsRemaining: provision.status === FinancialProvisionStatus.ACTIVE
      ? calculateProvisionMonthsAvailable(provision, calendar)
      : 0,
    startMonth: formatFinancialMonthKey(provision.startMonth),
    targetDate: formatFinancialDateKey(provision.targetDate),
    completedAt: provision.completedAt?.toISOString() ?? null,
    canceledAt: provision.canceledAt?.toISOString() ?? null,
    lastUsedAt: provision.lastUsedAt?.toISOString() ?? null,
    lastUsedAmount: provision.lastUsedAmount ? moneyString(provision.lastUsedAmount) : null,
    createdAt: provision.createdAt.toISOString(),
    updatedAt: provision.updatedAt.toISOString(),
    entries: (provision.entries ?? []).map((entry: any) => ({
      id: entry.id,
      type: entry.type,
      amount: moneyString(entry.amount),
      reservedAmountChange: moneyString(entry.reservedAmountChange),
      occurredAt: formatFinancialDateKey(entry.occurredAt),
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString()
    }))
  };
}

async function assertExpenseCategory(client: ProvisionClient, companyId: number, categoryId: number) {
  const category = await client.financialCategory.findFirst({
    where: { id: categoryId, companyId, type: TransactionType.EXPENSE },
    select: { id: true }
  });
  if (!category) throw new Error('A categoria de despesa não pertence a esta empresa');
}

async function findProvision(client: ProvisionClient, id: number, companyId: number) {
  return client.financialProvision.findFirst({
    where: { id, companyId },
    include: {
      category: { select: { id: true, name: true, color: true, icon: true, parentId: true } },
      entries: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] }
    }
  });
}

async function lockProvision(client: Prisma.TransactionClient, id: number, companyId: number) {
  const rows = await client.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM "FinancialProvision"
    WHERE id = ${id} AND "companyId" = ${companyId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new Error('Provisão não encontrada');
  const provision = await client.financialProvision.findUnique({ where: { id } });
  if (!provision) throw new Error('Provisão não encontrada');
  return provision;
}

function maximumProvisionDate(calendar: FinancialCalendarContext): Date {
  return addYearsClamped(calendar.businessDate, 10);
}

function validatePeriod(
  input: ProvisionInput,
  calendar: FinancialCalendarContext,
  options: { mutableStartMonth: boolean }
) {
  const startMonth = parseFinancialMonthKey(input.startMonth);
  const targetDate = parseFinancialDateKey(input.targetDate);
  const maximumDate = maximumProvisionDate(calendar);
  const issues: FinancialProvisionValidationIssue[] = [];

  if (startMonth.getUTCFullYear() < 2000) {
    issues.push({ field: 'startMonth', message: 'Mês inválido' });
  }
  if (options.mutableStartMonth && input.startMonth < calendar.currentMonthKey) {
    issues.push({
      field: 'startMonth',
      message: 'O mês inicial não pode estar no passado'
    });
  }
  if (input.startMonth > formatFinancialMonthKey(maximumDate)) {
    issues.push({
      field: 'startMonth',
      message: 'Use um mês dentro dos próximos 10 anos'
    });
  }
  if (targetDate < calendar.businessDate) {
    issues.push({
      field: 'targetDate',
      message: 'A data prevista não pode estar no passado'
    });
  }
  if (targetDate > maximumDate) {
    issues.push({
      field: 'targetDate',
      message: 'Use uma data dentro dos próximos 10 anos'
    });
  }
  if (startMonth > firstOfMonth(targetDate)) {
    issues.push({
      field: 'startMonth',
      message: 'O mês inicial deve ser anterior ou igual à data prevista'
    });
  }
  if (issues.length > 0) {
    throw new FinancialProvisionValidationError(issues);
  }
  return { startMonth, targetDate };
}

function resolveOccurredAt(
  occurredAt: string | undefined,
  calendar: FinancialCalendarContext
): Date {
  const resolved = occurredAt ? parseFinancialDateKey(occurredAt) : calendar.businessDate;
  if (resolved > calendar.businessDate) {
    throw new FinancialProvisionValidationError([
      {
        field: 'occurredAt',
        message: 'Não é possível confirmar uma movimentação futura'
      }
    ]);
  }
  return resolved;
}

export default class FinancialProvisionService {
  static async list(companyId: number, at: Date = new Date()) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(companyId, at);
    const provisions = await prisma.financialProvision.findMany({
      where: { companyId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, parentId: true } },
        entries: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 20 }
      },
      orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { id: 'asc' }]
    });
    const items = provisions.map((provision) => serializeProvision(provision, calendar));
    const active = provisions.filter((item) => item.status === FinancialProvisionStatus.ACTIVE);
    const totals = active.reduce(
      (result, item) => {
        result.expected = result.expected.plus(item.expectedAmount);
        result.reserved = result.reserved.plus(item.reservedAmount);
        result.remaining = result.remaining.plus(
          Prisma.Decimal.max(item.expectedAmount.minus(item.reservedAmount), 0)
        );
        result.monthly = result.monthly.plus(
          calculateProvisionMonthlyContribution(item, calendar)
        );
        if (item.reservedAmount.greaterThanOrEqualTo(item.expectedAmount)) result.funded += 1;
        if (derivedState(item, calendar) === 'OVERDUE') result.overdue += 1;
        return result;
      },
      {
        expected: new Prisma.Decimal(0),
        reserved: new Prisma.Decimal(0),
        remaining: new Prisma.Decimal(0),
        monthly: new Prisma.Decimal(0),
        funded: 0,
        overdue: 0
      }
    );

    return {
      summary: {
        activeCount: active.length,
        fundedCount: totals.funded,
        overdueCount: totals.overdue,
        expectedAmount: moneyString(totals.expected),
        reservedAmount: moneyString(totals.reserved),
        remainingAmount: moneyString(totals.remaining),
        monthlyContributionAmount: moneyString(totals.monthly)
      },
      items
    };
  }

  static async create(params: {
    companyId: number;
    userId: number;
    input: ProvisionInput & { initialReservedAmount?: string };
    at?: Date;
  }) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const { startMonth, targetDate } = validatePeriod(params.input, calendar, {
      mutableStartMonth: true
    });
    await assertExpenseCategory(prisma, params.companyId, params.input.categoryId);
    const expectedAmount = toMoney(params.input.expectedAmount);
    const initialReservedAmount = toMoney(params.input.initialReservedAmount ?? 0);
    if (initialReservedAmount.greaterThan(expectedAmount)) {
      throw new Error('O valor já reservado não pode superar o valor previsto');
    }

    const provisionId = await prisma.$transaction(async (transaction) => {
      const provision = await transaction.financialProvision.create({
        data: {
          companyId: params.companyId,
          createdBy: params.userId,
          categoryId: params.input.categoryId,
          name: params.input.name.trim(),
          notes: params.input.notes?.trim() || null,
          kind: params.input.kind,
          expectedAmount,
          reservedAmount: initialReservedAmount,
          startMonth,
          targetDate
        }
      });
      if (initialReservedAmount.greaterThan(0)) {
        await transaction.financialProvisionEntry.create({
          data: {
            provisionId: provision.id,
            createdBy: params.userId,
            type: FinancialProvisionEntryType.INITIAL_BALANCE,
            amount: initialReservedAmount,
            reservedAmountChange: initialReservedAmount,
            occurredAt: calendar.businessDate,
            notes: 'Valor já reservado informado na criação'
          }
        });
      }
      return provision.id;
    });
    return serializeProvision(
      await findProvision(prisma, provisionId, params.companyId),
      calendar
    );
  }

  static async update(params: {
    id: number;
    companyId: number;
    input: ProvisionInput;
    at?: Date;
  }) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const { startMonth, targetDate } = validatePeriod(params.input, calendar, {
      mutableStartMonth: false
    });
    const expectedAmount = toMoney(params.input.expectedAmount);
    const provisionId = await prisma.$transaction(async (transaction) => {
      await assertExpenseCategory(transaction, params.companyId, params.input.categoryId);
      const existing = await lockProvision(transaction, params.id, params.companyId);
      if (existing.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem ser alteradas');
      }
      if (expectedAmount.lessThan(existing.reservedAmount)) {
        throw new Error('O valor previsto não pode ser menor que o valor já reservado');
      }
      await transaction.financialProvision.update({
        where: { id: existing.id },
        data: {
          name: params.input.name.trim(),
          categoryId: params.input.categoryId,
          kind: params.input.kind,
          expectedAmount,
          startMonth,
          targetDate,
          notes: params.input.notes?.trim() || null
        }
      });
      return existing.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(
      await findProvision(prisma, provisionId, params.companyId),
      calendar
    );
  }

  static async addEntry(params: {
    id: number;
    companyId: number;
    userId: number;
    type: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: string;
    occurredAt?: string;
    notes?: string | null;
    at?: Date;
  }) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const occurredAt = resolveOccurredAt(params.occurredAt, calendar);
    const provisionId = await prisma.$transaction(async (transaction) => {
      const provision = await lockProvision(transaction, params.id, params.companyId);
      if (provision.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem receber movimentações');
      }
      const amount = toMoney(params.amount);
      const isContribution = params.type === 'CONTRIBUTION';
      if (!isContribution && amount.greaterThan(provision.reservedAmount)) {
        throw new Error('A retirada não pode superar o valor reservado');
      }
      const change = isContribution ? amount : amount.negated();
      await transaction.financialProvision.update({
        where: { id: provision.id },
        data: { reservedAmount: { increment: change } }
      });
      await transaction.financialProvisionEntry.create({
        data: {
          provisionId: provision.id,
          createdBy: params.userId,
          type: isContribution
            ? FinancialProvisionEntryType.CONTRIBUTION
            : FinancialProvisionEntryType.WITHDRAWAL,
          amount,
          reservedAmountChange: change,
          occurredAt,
          notes: params.notes?.trim() || null
        }
      });
      return provision.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(
      await findProvision(prisma, provisionId, params.companyId),
      calendar
    );
  }

  static async use(params: {
    id: number;
    companyId: number;
    userId: number;
    actualAmount: string;
    occurredAt?: string;
    notes?: string | null;
    at?: Date;
  }) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const occurredAt = resolveOccurredAt(params.occurredAt, calendar);
    const provisionId = await prisma.$transaction(async (transaction) => {
      const provision = await lockProvision(transaction, params.id, params.companyId);
      if (provision.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem ser utilizadas');
      }
      const actualAmount = toMoney(params.actualAmount);
      const consumedReservedAmount = provision.kind === FinancialProvisionKind.ONE_TIME
        ? provision.reservedAmount
        : Prisma.Decimal.min(provision.reservedAmount, actualAmount);
      const reservedAmount = Prisma.Decimal.max(
        provision.reservedAmount.minus(consumedReservedAmount),
        0
      );
      let targetDate = provision.targetDate;
      let startMonth = provision.startMonth;
      let status: FinancialProvisionStatus = FinancialProvisionStatus.COMPLETED;
      let completedAt: Date | null = occurredAt;

      if (provision.kind === FinancialProvisionKind.ANNUAL) {
        do {
          targetDate = addYearsClamped(targetDate, 1);
        } while (targetDate <= occurredAt);
        startMonth = addFinancialMonths(firstOfMonth(occurredAt), 1);
        status = FinancialProvisionStatus.ACTIVE;
        completedAt = null;
      }

      await transaction.financialProvision.update({
        where: { id: provision.id },
        data: {
          reservedAmount,
          targetDate,
          startMonth,
          status,
          completedAt,
          lastUsedAt: occurredAt,
          lastUsedAmount: actualAmount
        }
      });
      await transaction.financialProvisionEntry.create({
        data: {
          provisionId: provision.id,
          createdBy: params.userId,
          type: FinancialProvisionEntryType.USE,
          amount: actualAmount,
          reservedAmountChange: consumedReservedAmount.negated(),
          occurredAt,
          notes: params.notes?.trim() || null
        }
      });
      return provision.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(
      await findProvision(prisma, provisionId, params.companyId),
      calendar
    );
  }

  static async cancel(params: { id: number; companyId: number; at?: Date }) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const provisionId = await prisma.$transaction(async (transaction) => {
      const existing = await lockProvision(transaction, params.id, params.companyId);
      if (existing.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem ser canceladas');
      }
      await transaction.financialProvision.update({
        where: { id: existing.id },
        data: { status: FinancialProvisionStatus.CANCELED, canceledAt: calendar.businessDate }
      });
      return existing.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(
      await findProvision(prisma, provisionId, params.companyId),
      calendar
    );
  }
}
