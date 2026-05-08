import {
  AccountType,
  Prisma,
  PrismaClient,
  RecurringFrequency,
  RecurringTransaction,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import { parseDecimal } from '../utils/money';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const SUPPORTED_FIXED_TYPES: TransactionType[] = [TransactionType.INCOME, TransactionType.EXPENSE];

type FixedTemplateWithRelations = RecurringTransaction & {
  fromAccount: {
    id: number;
    name: string;
    type?: string;
    statementClosingDay?: number | null;
    statementDueDay?: number | null;
  } | null;
  toAccount: {
    id: number;
    name: string;
    type?: string;
    statementClosingDay?: number | null;
    statementDueDay?: number | null;
  } | null;
  category: { id: number; name: string; color: string } | null;
};

type FixedAccountSelection = {
  id: number;
  type?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
};

type FixedTemplateOccurrenceLike = {
  id?: number;
  type: TransactionType;
  dayOfMonth?: number | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  startDate?: Date;
  endDate?: Date | null;
  fromAccount?: {
    id: number;
    type?: string | null;
    statementClosingDay?: number | null;
    statementDueDay?: number | null;
  } | null;
  toAccount?: {
    id: number;
    type?: string | null;
    statementClosingDay?: number | null;
    statementDueDay?: number | null;
  } | null;
};

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

function firstDayOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function buildMonthOccurrenceDate(year: number, monthIndex: number, dayOfMonth: number): Date {
  const cappedDay = Math.min(dayOfMonth, getLastDayOfMonth(year, monthIndex));
  return new Date(year, monthIndex, cappedDay);
}

function buildCompetenceKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function buildOccurrenceKeyValue(templateId: number, occurrenceDate: Date): string {
  return `${templateId}:${buildCompetenceKey(occurrenceDate)}`;
}

function ensureTypeAccountConsistency(type: TransactionType, fromAccountId?: number | null, toAccountId?: number | null): void {
  if (!SUPPORTED_FIXED_TYPES.includes(type)) {
    throw new Error('Transacao fixa suporta apenas INCOME ou EXPENSE');
  }

  if (type === TransactionType.INCOME && fromAccountId) {
    throw new Error('Transacao fixa de receita nao pode ter conta de origem');
  }

  if (type === TransactionType.EXPENSE && toAccountId) {
    throw new Error('Transacao fixa de despesa nao pode ter conta de destino');
  }
}

function ensureCreditCardFixedSupport(params: {
  type: TransactionType;
  fromAccountType?: string | null;
  toAccountType?: string | null;
}): void {
  if (
    params.type === TransactionType.INCOME &&
    params.toAccountType === AccountType.CREDIT_CARD
  ) {
    throw new Error('Transacao fixa de receita nao pode usar conta de cartao de credito');
  }
}

function isCreditCardFixedExpenseTemplate(template: Pick<FixedTemplateOccurrenceLike, 'type' | 'fromAccount'>): boolean {
  return (
    template.type === TransactionType.EXPENSE &&
    template.fromAccount?.type === AccountType.CREDIT_CARD
  );
}

function resolveOccurrenceDayOfMonth(
  template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>
): number {
  if (isCreditCardFixedExpenseTemplate(template)) {
    const closingDay = template.fromAccount?.statementClosingDay;

    if (!closingDay) {
      throw new Error('Cartao de credito da transacao fixa precisa ter dia de fechamento configurado');
    }

    return closingDay;
  }

  if (!template.dayOfMonth) {
    throw new Error('Dia do vencimento e obrigatorio para transacao fixa fora do cartao');
  }

  return template.dayOfMonth;
}

function buildOccurrenceDateForMonth(
  template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>,
  year: number,
  monthIndex: number
): Date {
  return buildMonthOccurrenceDate(year, monthIndex, resolveOccurrenceDayOfMonth(template));
}

function resolveOccurrenceDateForReference(
  template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>,
  referenceDate: Date
): Date {
  return buildOccurrenceDateForMonth(template, referenceDate.getFullYear(), referenceDate.getMonth());
}

async function resolveFixedAccounts(params: {
  companyId: number;
  fromAccountId?: number | null;
  toAccountId?: number | null;
}): Promise<{
  fromAccount: FixedAccountSelection | null;
  toAccount: FixedAccountSelection | null;
}> {
  const accountIds = [params.fromAccountId, params.toAccountId].filter(
    (accountId): accountId is number => !!accountId
  );

  if (accountIds.length === 0) {
    return {
      fromAccount: null,
      toAccount: null
    };
  }

  const accounts = await prisma.financialAccount.findMany({
    where: {
      companyId: params.companyId,
      id: { in: accountIds }
    },
    select: {
      id: true,
      type: true,
      statementClosingDay: true,
      statementDueDay: true
    }
  });

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  if (params.fromAccountId && !accountById.has(params.fromAccountId)) {
    throw new Error('Conta de origem nao encontrada');
  }

  if (params.toAccountId && !accountById.has(params.toAccountId)) {
    throw new Error('Conta de destino nao encontrada');
  }

  return {
    fromAccount: params.fromAccountId ? accountById.get(params.fromAccountId) ?? null : null,
    toAccount: params.toAccountId ? accountById.get(params.toAccountId) ?? null : null
  };
}

function ensureFixedScheduleConfiguration(params: {
  type: TransactionType;
  dayOfMonth?: number | null;
  fromAccount: FixedAccountSelection | null;
  toAccount: FixedAccountSelection | null;
}): void {
  ensureCreditCardFixedSupport({
    type: params.type,
    fromAccountType: params.fromAccount?.type ?? null,
    toAccountType: params.toAccount?.type ?? null
  });

  if (params.type === TransactionType.EXPENSE && params.fromAccount?.type === AccountType.CREDIT_CARD) {
    if (!params.fromAccount.statementClosingDay || !params.fromAccount.statementDueDay) {
      throw new Error('Cartao de credito da transacao fixa precisa ter fechamento e vencimento configurados');
    }

    return;
  }

  if (!params.dayOfMonth || params.dayOfMonth < 1 || params.dayOfMonth > 31) {
    throw new Error('Dia do vencimento e obrigatorio para transacao fixa fora do cartao');
  }
}

function computeNextDueDate(
  baseDate: Date,
  template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>
): Date {
  const normalizedBase = startOfDay(baseDate);
  const sameMonthCandidate = resolveOccurrenceDateForReference(template, normalizedBase);

  if (sameMonthCandidate >= normalizedBase) {
    return sameMonthCandidate;
  }

  const nextMonth = new Date(normalizedBase.getFullYear(), normalizedBase.getMonth() + 1, 1);
  return buildOccurrenceDateForMonth(template, nextMonth.getFullYear(), nextMonth.getMonth());
}

export default class FixedTransactionService {
  static async createFixedTransaction(data: {
    description: string;
    amount: number | string;
    type: TransactionType;
    dayOfMonth?: number | null;
    startDate?: Date;
    endDate?: Date | null;
    notes?: string;
    fromAccountId?: number | null;
    toAccountId?: number | null;
    categoryId?: number | null;
    companyId: number;
    createdBy: number;
  }): Promise<FixedTemplateWithRelations> {
    const startDate = startOfDay(data.startDate ?? new Date());
    const endDate = data.endDate ? endOfDay(data.endDate) : null;

    if (endDate && endDate < startDate) {
      throw new Error('Data final deve ser posterior ou igual a data inicial');
    }

    ensureTypeAccountConsistency(data.type, data.fromAccountId, data.toAccountId);
    const accounts = await resolveFixedAccounts({
      companyId: data.companyId,
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId
    });

    ensureFixedScheduleConfiguration({
      type: data.type,
      dayOfMonth: data.dayOfMonth,
      ...accounts
    });

    const resolvedDayOfMonth =
      data.type === TransactionType.EXPENSE && accounts.fromAccount?.type === AccountType.CREDIT_CARD
        ? null
        : data.dayOfMonth ?? null;

    const created = await prisma.recurringTransaction.create({
      data: {
        description: data.description,
        amount: parseDecimal(data.amount),
        type: data.type,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: resolvedDayOfMonth,
        dayOfWeek: null,
        startDate,
        endDate,
        nextDueDate: computeNextDueDate(startDate, {
          type: data.type,
          dayOfMonth: resolvedDayOfMonth,
          fromAccount: accounts.fromAccount
        }),
        isActive: true,
        notes: data.notes,
        fromAccountId: data.fromAccountId ?? null,
        toAccountId: data.toAccountId ?? null,
        categoryId: data.categoryId ?? null,
        companyId: data.companyId,
        createdBy: data.createdBy
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      }
    });

    logger.info('Fixed transaction template created', {
      templateId: created.id,
      companyId: data.companyId,
      type: data.type
    });

    return created;
  }

  static async listFixedTransactions(params: {
    companyId: number;
    includeInactive?: boolean;
    type?: TransactionType;
  }): Promise<FixedTemplateWithRelations[]> {
    const { companyId, includeInactive = false, type } = params;

    return prisma.recurringTransaction.findMany({
      where: {
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: type ?? { in: SUPPORTED_FIXED_TYPES },
        ...(includeInactive ? {} : { isActive: true })
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
    });
  }

  static async getFixedTransactionById(id: number, companyId: number): Promise<FixedTemplateWithRelations | null> {
    return prisma.recurringTransaction.findFirst({
      where: {
        id,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      }
    });
  }

  static async updateFixedTransactionVersioned(
    id: number,
    data: Partial<{
      description: string;
      amount: number | string;
      type: TransactionType;
      dayOfMonth: number | null;
      notes?: string;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
      endDate?: Date | null;
      isActive?: boolean;
    }>,
    companyId: number
  ): Promise<FixedTemplateWithRelations> {
    const existing = await prisma.recurringTransaction.findFirst({
      where: {
        id,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        }
      }
    });

    if (!existing) {
      throw new Error('Transacao fixa nao encontrada');
    }

    const nextType = (data.type ?? existing.type) as TransactionType;
    const nextFromAccountId = data.fromAccountId !== undefined ? data.fromAccountId : existing.fromAccountId;
    const nextToAccountId = data.toAccountId !== undefined ? data.toAccountId : existing.toAccountId;
    const nextAccounts = await resolveFixedAccounts({
      companyId,
      fromAccountId: nextFromAccountId,
      toAccountId: nextToAccountId
    });
    const nextDayOfMonth =
      data.dayOfMonth !== undefined ? data.dayOfMonth : existing.dayOfMonth;

    ensureTypeAccountConsistency(nextType, nextFromAccountId, nextToAccountId);
    ensureFixedScheduleConfiguration({
      type: nextType,
      dayOfMonth: nextDayOfMonth,
      ...nextAccounts
    });

    const resolvedDayOfMonth =
      nextType === TransactionType.EXPENSE && nextAccounts.fromAccount?.type === AccountType.CREDIT_CARD
        ? null
        : nextDayOfMonth ?? null;

    const now = new Date();
    const currentMonthEnd = endOfMonth(now);
    const nextCompetenceStart = firstDayOfNextMonth(now);
    const requestedEndDate = data.endDate !== undefined
      ? (data.endDate ? endOfDay(data.endDate) : null)
      : existing.endDate;

    if (requestedEndDate && requestedEndDate < nextCompetenceStart) {
      throw new Error('Data final da nova versao deve ser posterior a proxima competencia');
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.recurringTransaction.update({
        where: { id: existing.id },
        data: {
          endDate: existing.endDate && existing.endDate < currentMonthEnd
            ? existing.endDate
            : currentMonthEnd,
          isActive: true
        }
      });

      return tx.recurringTransaction.create({
        data: {
          description: data.description ?? existing.description,
          amount: data.amount !== undefined ? parseDecimal(data.amount) : existing.amount,
          type: nextType,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: resolvedDayOfMonth,
          dayOfWeek: null,
          startDate: nextCompetenceStart,
          endDate: requestedEndDate,
          nextDueDate: computeNextDueDate(nextCompetenceStart, {
            type: nextType,
            dayOfMonth: resolvedDayOfMonth,
            fromAccount: nextAccounts.fromAccount
          }),
          isActive: data.isActive ?? true,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          fromAccountId: nextFromAccountId ?? null,
          toAccountId: nextToAccountId ?? null,
          categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
          companyId,
          createdBy: existing.createdBy
        },
        include: {
          fromAccount: {
            select: {
              id: true,
              name: true,
              type: true,
              statementClosingDay: true,
              statementDueDay: true
            }
          },
          toAccount: {
            select: {
              id: true,
              name: true,
              type: true,
              statementClosingDay: true,
              statementDueDay: true
            }
          },
          category: { select: { id: true, name: true, color: true } }
        }
      });
    });

    logger.info('Fixed transaction versioned', {
      previousTemplateId: existing.id,
      newTemplateId: created.id,
      companyId
    });

    return created;
  }

  static async cancelFixedTransaction(id: number, companyId: number): Promise<FixedTemplateWithRelations> {
    const existing = await prisma.recurringTransaction.findFirst({
      where: {
        id,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      }
    });

    if (!existing) {
      throw new Error('Transacao fixa nao encontrada');
    }

    const today = endOfDay(new Date());

    return prisma.recurringTransaction.update({
      where: { id },
      data: {
        isActive: false,
        endDate: existing.endDate && existing.endDate < today ? existing.endDate : today
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      }
    });
  }

  static async getMaterializedTransactionCounts(
    templateIds: number[],
    companyId: number
  ): Promise<Map<number, number>> {
    if (templateIds.length === 0) {
      return new Map();
    }

    const counts = await prisma.financialTransaction.groupBy({
      by: ['recurringTransactionId'],
      where: {
        companyId,
        recurringTransactionId: { in: templateIds }
      },
      _count: {
        recurringTransactionId: true
      }
    });

    return new Map(
      counts
        .filter((item) => item.recurringTransactionId !== null)
        .map((item) => [item.recurringTransactionId as number, item._count.recurringTransactionId])
    );
  }

  static async deleteFixedTransaction(id: number, companyId: number): Promise<void> {
    const existing = await prisma.recurringTransaction.findFirst({
      where: {
        id,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      }
    });

    if (!existing) {
      throw new Error('Transacao fixa nao encontrada');
    }

    const materializedCount = await prisma.financialTransaction.count({
      where: {
        companyId,
        recurringTransactionId: id
      }
    });

    if (materializedCount > 0) {
      throw new Error('Nao e possivel excluir transacao fixa com ocorrencias materializadas');
    }

    await prisma.recurringTransaction.delete({
      where: { id }
    });
  }

  static async getTemplatesForProjection(params: {
    companyId: number;
    rangeStart: Date;
    rangeEnd: Date;
    accessibleAccountIds?: number[];
  }): Promise<FixedTemplateWithRelations[]> {
    const { companyId, rangeStart, rangeEnd, accessibleAccountIds } = params;

    const accountRestriction = accessibleAccountIds && accessibleAccountIds.length > 0
      ? {
          OR: [
            { fromAccountId: null, toAccountId: null },
            { type: TransactionType.INCOME, toAccountId: { in: accessibleAccountIds } },
            { type: TransactionType.EXPENSE, fromAccountId: { in: accessibleAccountIds } }
          ]
        }
      : accessibleAccountIds
        ? {
            OR: [{ fromAccountId: null, toAccountId: null }]
          }
      : {};

    return prisma.recurringTransaction.findMany({
      where: {
        companyId,
        isActive: true,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES },
        startDate: { lte: rangeEnd },
        OR: [
          { endDate: null },
          { endDate: { gte: rangeStart } }
        ],
        ...accountRestriction
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      }
    });
  }

  static async materializeOccurrence(params: {
    templateId: number;
    occurrenceDate: Date;
    companyId: number;
    userId: number;
  }): Promise<{ transaction: any; created: boolean }> {
    const { templateId, companyId, userId } = params;
    const requestedOccurrenceDate = startOfDay(params.occurrenceDate);

    const template = await prisma.recurringTransaction.findFirst({
      where: {
        id: templateId,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: { select: { id: true, name: true, color: true } }
      }
    });

    if (!template) {
      throw new Error('Template de transacao fixa nao encontrado');
    }

    const occurrenceDate = resolveOccurrenceDateForReference(template, requestedOccurrenceDate);

    if (!template.isActive) {
      throw new Error('Template de transacao fixa inativo');
    }

    if (template.startDate > occurrenceDate) {
      throw new Error('Ocorrencia anterior ao inicio do template');
    }

    if (template.endDate && template.endDate < occurrenceDate) {
      throw new Error('Ocorrencia posterior ao fim do template');
    }

    ensureFixedScheduleConfiguration({
      type: template.type,
      dayOfMonth: template.dayOfMonth,
      fromAccount: template.fromAccount
        ? {
            id: template.fromAccount.id,
            type: template.fromAccount.type ?? undefined,
            statementClosingDay: template.fromAccount.statementClosingDay,
            statementDueDay: template.fromAccount.statementDueDay
          }
        : null,
      toAccount: template.toAccount
        ? {
            id: template.toAccount.id,
            type: template.toAccount.type ?? undefined,
            statementClosingDay: template.toAccount.statementClosingDay,
            statementDueDay: template.toAccount.statementDueDay
          }
        : null
    });

    const occurrenceKey = buildOccurrenceKeyValue(template.id, occurrenceDate);

    const existing = await prisma.financialTransaction.findFirst({
      where: {
        companyId,
        occurrenceKey
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } }
      }
    });

    if (existing) {
      return { transaction: existing, created: false };
    }

    try {
      const { default: FinancialTransactionService } = await import('./financial-transaction.service');
      const isCreditCardFixedExpense = isCreditCardFixedExpenseTemplate(template);

      const createdResult = await FinancialTransactionService.createTransaction({
        description: template.description,
        amount: template.amount.toString(),
        date: occurrenceDate,
        dueDate: occurrenceDate,
        effectiveDate: isCreditCardFixedExpense ? occurrenceDate : null,
        type: template.type,
        status: isCreditCardFixedExpense ? TransactionStatus.COMPLETED : TransactionStatus.PENDING,
        notes: template.notes ?? undefined,
        fromAccountId: template.fromAccountId,
        toAccountId: template.toAccountId,
        categoryId: template.categoryId,
        companyId,
        createdBy: userId,
        recurringTransactionId: template.id,
        occurrenceKey,
        allowMissingAccount: true
      });

      if (Array.isArray(createdResult)) {
        throw new Error('Materializacao de transacao fixa retornou mais de uma transacao');
      }

      const created = await prisma.financialTransaction.findFirst({
        where: {
          companyId,
          occurrenceKey
        },
        include: {
          category: { select: { id: true, name: true, color: true } },
          fromAccount: { select: { id: true, name: true, type: true } },
          toAccount: { select: { id: true, name: true, type: true } },
          creditCardInvoice: {
            select: {
              id: true,
              referenceYear: true,
              referenceMonth: true,
              dueDate: true,
              status: true,
              settlementType: true
            }
          },
          tags: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true } }
        }
      });

      if (!created) {
        throw new Error('Nao foi possivel localizar a ocorrencia materializada');
      }

      logger.info('Fixed transaction occurrence materialized', {
        templateId,
        occurrenceKey,
        companyId,
        transactionId: created.id,
        materializedTransactionId: createdResult.id
      });

      return { transaction: created, created: true };
    } catch (error: any) {
      if (error.code === 'P2002') {
        const duplicated = await prisma.financialTransaction.findFirst({
          where: {
            companyId,
            occurrenceKey
          },
          include: {
            category: { select: { id: true, name: true, color: true } },
            fromAccount: { select: { id: true, name: true } },
            toAccount: { select: { id: true, name: true } },
            tags: { select: { id: true, name: true } },
            createdByUser: { select: { id: true, name: true } }
          }
        });

        if (duplicated) {
          return { transaction: duplicated, created: false };
        }
      }

      throw error;
    }
  }

  static async materializeDueOccurrencesForDate(referenceDate: Date = new Date()): Promise<{ processed: number; created: number }> {
    const today = startOfDay(referenceDate);

    const templates = await prisma.recurringTransaction.findMany({
      where: {
        isActive: true,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES },
        startDate: { lte: today },
        OR: [
          { endDate: null },
          { endDate: { gte: today } }
        ]
      },
      select: {
        id: true,
        companyId: true,
        createdBy: true,
        type: true,
        dayOfMonth: true,
        fromAccount: {
          select: {
            id: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        }
      }
    });

    let createdCount = 0;

    for (const template of templates) {
      const expectedDate = resolveOccurrenceDateForReference(template, today);

      if (expectedDate.getDate() !== today.getDate()) {
        continue;
      }

      const result = await this.materializeOccurrence({
        templateId: template.id,
        companyId: template.companyId,
        occurrenceDate: today,
        userId: template.createdBy
      });

      if (result.created) {
        createdCount += 1;
      }
    }

    return {
      processed: templates.length,
      created: createdCount
    };
  }

  static isCreditCardFixedExpenseTemplate(template: Pick<FixedTemplateOccurrenceLike, 'type' | 'fromAccount'>): boolean {
    return isCreditCardFixedExpenseTemplate(template);
  }

  static buildVirtualDateForMonth(
    template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>,
    year: number,
    monthIndex: number
  ): Date {
    return buildOccurrenceDateForMonth(template, year, monthIndex);
  }

  static resolveOccurrenceDateForReference(
    template: Pick<FixedTemplateOccurrenceLike, 'type' | 'dayOfMonth' | 'fromAccount'>,
    referenceDate: Date
  ): Date {
    return resolveOccurrenceDateForReference(template, referenceDate);
  }

  static buildOccurrenceKey(templateId: number, occurrenceDate: Date): string {
    return buildOccurrenceKeyValue(templateId, occurrenceDate);
  }
}
