import {
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
  fromAccount: { id: number; name: string } | null;
  toAccount: { id: number; name: string } | null;
  category: { id: number; name: string; color: string } | null;
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

  if (type === TransactionType.INCOME && !toAccountId) {
    throw new Error('Transacao fixa de receita exige conta de destino');
  }

  if (type === TransactionType.EXPENSE && !fromAccountId) {
    throw new Error('Transacao fixa de despesa exige conta de origem');
  }
}

function computeNextDueDate(baseDate: Date, dayOfMonth: number): Date {
  const normalizedBase = startOfDay(baseDate);
  const sameMonthCandidate = buildMonthOccurrenceDate(
    normalizedBase.getFullYear(),
    normalizedBase.getMonth(),
    dayOfMonth
  );

  if (sameMonthCandidate >= normalizedBase) {
    return sameMonthCandidate;
  }

  const nextMonth = new Date(normalizedBase.getFullYear(), normalizedBase.getMonth() + 1, 1);
  return buildMonthOccurrenceDate(nextMonth.getFullYear(), nextMonth.getMonth(), dayOfMonth);
}

export default class FixedTransactionService {
  static async createFixedTransaction(data: {
    description: string;
    amount: number | string;
    type: TransactionType;
    dayOfMonth: number;
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

    const created = await prisma.recurringTransaction.create({
      data: {
        description: data.description,
        amount: parseDecimal(data.amount),
        type: data.type,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: null,
        startDate,
        endDate,
        nextDueDate: computeNextDueDate(startDate, data.dayOfMonth),
        isActive: true,
        notes: data.notes,
        fromAccountId: data.fromAccountId ?? null,
        toAccountId: data.toAccountId ?? null,
        categoryId: data.categoryId ?? null,
        companyId: data.companyId,
        createdBy: data.createdBy
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
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
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
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
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
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
      dayOfMonth: number;
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
      }
    });

    if (!existing) {
      throw new Error('Transacao fixa nao encontrada');
    }

    const nextType = (data.type ?? existing.type) as TransactionType;
    const nextFromAccountId = data.fromAccountId !== undefined ? data.fromAccountId : existing.fromAccountId;
    const nextToAccountId = data.toAccountId !== undefined ? data.toAccountId : existing.toAccountId;

    ensureTypeAccountConsistency(nextType, nextFromAccountId, nextToAccountId);

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
          dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth,
          dayOfWeek: null,
          startDate: nextCompetenceStart,
          endDate: requestedEndDate,
          nextDueDate: computeNextDueDate(nextCompetenceStart, data.dayOfMonth ?? existing.dayOfMonth ?? 1),
          isActive: data.isActive ?? true,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          fromAccountId: nextFromAccountId ?? null,
          toAccountId: nextToAccountId ?? null,
          categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
          companyId,
          createdBy: existing.createdBy
        },
        include: {
          fromAccount: { select: { id: true, name: true } },
          toAccount: { select: { id: true, name: true } },
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
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } }
      }
    });
  }

  static async getTemplatesForProjection(params: {
    companyId: number;
    rangeStart: Date;
    rangeEnd: Date;
    accessibleAccountIds?: number[];
  }): Promise<FixedTemplateWithRelations[]> {
    const { companyId, rangeStart, rangeEnd, accessibleAccountIds } = params;

    if (accessibleAccountIds && accessibleAccountIds.length === 0) {
      return [];
    }

    const accountRestriction = accessibleAccountIds && accessibleAccountIds.length > 0
      ? {
          OR: [
            { type: TransactionType.INCOME, toAccountId: { in: accessibleAccountIds } },
            { type: TransactionType.EXPENSE, fromAccountId: { in: accessibleAccountIds } }
          ]
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
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
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
    const occurrenceDate = startOfDay(params.occurrenceDate);

    const template = await prisma.recurringTransaction.findFirst({
      where: {
        id: templateId,
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: { in: SUPPORTED_FIXED_TYPES }
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } }
      }
    });

    if (!template) {
      throw new Error('Template de transacao fixa nao encontrado');
    }

    if (!template.isActive) {
      throw new Error('Template de transacao fixa inativo');
    }

    if (template.startDate > occurrenceDate) {
      throw new Error('Ocorrencia anterior ao inicio do template');
    }

    if (template.endDate && template.endDate < occurrenceDate) {
      throw new Error('Ocorrencia posterior ao fim do template');
    }

    ensureTypeAccountConsistency(template.type, template.fromAccountId, template.toAccountId);

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
      const created = await prisma.financialTransaction.create({
        data: {
          description: template.description,
          amount: parseDecimal(template.amount),
          date: occurrenceDate,
          dueDate: occurrenceDate,
          effectiveDate: null,
          type: template.type,
          status: TransactionStatus.PENDING,
          notes: template.notes,
          fromAccountId: template.fromAccountId,
          toAccountId: template.toAccountId,
          categoryId: template.categoryId,
          companyId,
          createdBy: userId,
          recurringTransactionId: template.id,
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

      logger.info('Fixed transaction occurrence materialized', {
        templateId,
        occurrenceKey,
        companyId,
        transactionId: created.id
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
        dayOfMonth: true
      }
    });

    let createdCount = 0;

    for (const template of templates) {
      const expectedDate = buildMonthOccurrenceDate(
        today.getFullYear(),
        today.getMonth(),
        template.dayOfMonth ?? 1
      );

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

  static buildVirtualDateForMonth(year: number, monthIndex: number, dayOfMonth: number): Date {
    return buildMonthOccurrenceDate(year, monthIndex, dayOfMonth);
  }

  static buildOccurrenceKey(templateId: number, occurrenceDate: Date): string {
    return buildOccurrenceKeyValue(templateId, occurrenceDate);
  }
}
