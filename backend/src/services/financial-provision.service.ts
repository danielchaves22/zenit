import prisma from '../lib/prisma';
import {
  FinancialProvisionEntryType,
  FinancialProvisionKind,
  FinancialProvisionStatus,
  Prisma,
  PrismaClient,
  TransactionType
} from '@prisma/client';


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

function parseMonthKey(value: string): Date {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
}

function parseDateKey(value?: string): Date {
  if (!value) {
    const today = new Date();
    return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0));
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function currentMonth(): Date {
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0));
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0, 0));
}

function addMonths(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12, 0, 0, 0));
}

function addYearClamped(date: Date): Date {
  const nextYear = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(nextYear, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextYear, month, Math.min(date.getUTCDate(), lastDay), 12, 0, 0, 0));
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatDateKey(date: Date): string {
  return `${formatMonthKey(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function toMoney(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function moneyString(value: Prisma.Decimal | string | number): string {
  return toMoney(value).toFixed(2);
}

function monthsAvailable(startMonth: Date, targetDate: Date): number {
  const targetMonth = firstOfMonth(targetDate);
  const effectiveStart = startMonth > currentMonth() ? startMonth : currentMonth();
  const difference =
    (targetMonth.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    targetMonth.getUTCMonth() -
    effectiveStart.getUTCMonth();
  return Math.max(1, difference);
}

function monthlyContribution(
  expectedAmount: Prisma.Decimal,
  reservedAmount: Prisma.Decimal,
  startMonth: Date,
  targetDate: Date
): Prisma.Decimal {
  const remaining = Prisma.Decimal.max(expectedAmount.minus(reservedAmount), 0);
  if (remaining.isZero()) return new Prisma.Decimal(0);
  return remaining
    .div(monthsAvailable(startMonth, targetDate))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

function derivedState(provision: {
  status: FinancialProvisionStatus;
  expectedAmount: Prisma.Decimal;
  reservedAmount: Prisma.Decimal;
  targetDate: Date;
}): 'PLANNED' | 'IN_PROGRESS' | 'FUNDED' | 'OVERDUE' | 'COMPLETED' | 'CANCELED' {
  if (provision.status === FinancialProvisionStatus.COMPLETED) return 'COMPLETED';
  if (provision.status === FinancialProvisionStatus.CANCELED) return 'CANCELED';
  if (provision.reservedAmount.greaterThanOrEqualTo(provision.expectedAmount)) return 'FUNDED';
  if (provision.targetDate < parseDateKey()) return 'OVERDUE';
  if (provision.reservedAmount.greaterThan(0)) return 'IN_PROGRESS';
  return 'PLANNED';
}

function serializeProvision(provision: any) {
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
    state: derivedState(provision),
    category: provision.category,
    expectedAmount: moneyString(expectedAmount),
    reservedAmount: moneyString(reservedAmount),
    remainingAmount: moneyString(remainingAmount),
    monthlyContributionAmount: moneyString(
      provision.status === FinancialProvisionStatus.ACTIVE
        ? monthlyContribution(expectedAmount, reservedAmount, provision.startMonth, provision.targetDate)
        : 0
    ),
    progressPercent,
    monthsRemaining: provision.status === FinancialProvisionStatus.ACTIVE
      ? monthsAvailable(provision.startMonth, provision.targetDate)
      : 0,
    startMonth: formatMonthKey(provision.startMonth),
    targetDate: formatDateKey(provision.targetDate),
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
      occurredAt: formatDateKey(entry.occurredAt),
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

function validatePeriod(input: ProvisionInput) {
  const startMonth = parseMonthKey(input.startMonth);
  const targetDate = parseDateKey(input.targetDate);
  if (startMonth > firstOfMonth(targetDate)) {
    throw new Error('O mês inicial deve ser anterior ou igual à data prevista');
  }
  return { startMonth, targetDate };
}

export default class FinancialProvisionService {
  static async list(companyId: number) {
    const provisions = await prisma.financialProvision.findMany({
      where: { companyId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, parentId: true } },
        entries: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 20 }
      },
      orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { id: 'asc' }]
    });
    const items = provisions.map(serializeProvision);
    const active = provisions.filter((item) => item.status === FinancialProvisionStatus.ACTIVE);
    const totals = active.reduce(
      (result, item) => {
        result.expected = result.expected.plus(item.expectedAmount);
        result.reserved = result.reserved.plus(item.reservedAmount);
        result.remaining = result.remaining.plus(
          Prisma.Decimal.max(item.expectedAmount.minus(item.reservedAmount), 0)
        );
        result.monthly = result.monthly.plus(
          monthlyContribution(item.expectedAmount, item.reservedAmount, item.startMonth, item.targetDate)
        );
        if (item.reservedAmount.greaterThanOrEqualTo(item.expectedAmount)) result.funded += 1;
        if (derivedState(item) === 'OVERDUE') result.overdue += 1;
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
  }) {
    await assertExpenseCategory(prisma, params.companyId, params.input.categoryId);
    const { startMonth, targetDate } = validatePeriod(params.input);
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
            occurredAt: parseDateKey(),
            notes: 'Valor já reservado informado na criação'
          }
        });
      }
      return provision.id;
    });
    return serializeProvision(await findProvision(prisma, provisionId, params.companyId));
  }

  static async update(params: {
    id: number;
    companyId: number;
    input: ProvisionInput;
  }) {
    const { startMonth, targetDate } = validatePeriod(params.input);
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
    return serializeProvision(await findProvision(prisma, provisionId, params.companyId));
  }

  static async addEntry(params: {
    id: number;
    companyId: number;
    userId: number;
    type: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: string;
    occurredAt?: string;
    notes?: string | null;
  }) {
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
          occurredAt: parseDateKey(params.occurredAt),
          notes: params.notes?.trim() || null
        }
      });
      return provision.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(await findProvision(prisma, provisionId, params.companyId));
  }

  static async use(params: {
    id: number;
    companyId: number;
    userId: number;
    actualAmount: string;
    occurredAt?: string;
    notes?: string | null;
  }) {
    const provisionId = await prisma.$transaction(async (transaction) => {
      const provision = await lockProvision(transaction, params.id, params.companyId);
      if (provision.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem ser utilizadas');
      }
      const actualAmount = toMoney(params.actualAmount);
      const occurredAt = parseDateKey(params.occurredAt);
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
          targetDate = addYearClamped(targetDate);
        } while (targetDate <= occurredAt);
        startMonth = addMonths(firstOfMonth(occurredAt), 1);
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
    return serializeProvision(await findProvision(prisma, provisionId, params.companyId));
  }

  static async cancel(params: { id: number; companyId: number }) {
    const provisionId = await prisma.$transaction(async (transaction) => {
      const existing = await lockProvision(transaction, params.id, params.companyId);
      if (existing.status !== FinancialProvisionStatus.ACTIVE) {
        throw new Error('Apenas provisões ativas podem ser canceladas');
      }
      await transaction.financialProvision.update({
        where: { id: existing.id },
        data: { status: FinancialProvisionStatus.CANCELED, canceledAt: parseDateKey() }
      });
      return existing.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return serializeProvision(await findProvision(prisma, provisionId, params.companyId));
  }
}
