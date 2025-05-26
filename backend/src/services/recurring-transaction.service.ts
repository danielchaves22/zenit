import { PrismaClient, RecurringTransaction, RecurringFrequency, TransactionType, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import FinancialTransactionService from './financial-transaction.service';

const prisma = new PrismaClient();

export default class RecurringTransactionService {
  
  /**
   * Create a new recurring transaction template
   */
  static async createRecurringTransaction(data: {
    description: string;
    amount: number | string;
    type: TransactionType;
    frequency: RecurringFrequency;
    dayOfMonth?: number;
    dayOfWeek?: number;
    startDate: Date;
    endDate?: Date;
    notes?: string;
    fromAccountId?: number;
    toAccountId?: number;
    categoryId?: number;
    companyId: number;
    createdBy: number;
  }): Promise<RecurringTransaction> {
    
    const nextDueDate = this.calculateNextDueDate(
      data.startDate,
      data.frequency,
      data.dayOfMonth,
      data.dayOfWeek
    );

    const recurring = await prisma.recurringTransaction.create({
      data: {
        description: data.description,
        amount: data.amount,
        type: data.type,
        frequency: data.frequency,
        dayOfMonth: data.dayOfMonth,
        dayOfWeek: data.dayOfWeek,
        startDate: data.startDate,
        endDate: data.endDate,
        nextDueDate,
        notes: data.notes,
        fromAccount: data.fromAccountId ? { connect: { id: data.fromAccountId } } : undefined,
        toAccount: data.toAccountId ? { connect: { id: data.toAccountId } } : undefined,
        category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
        company: { connect: { id: data.companyId } },
        createdByUser: { connect: { id: data.createdBy } }
      }
    });

    logger.info('Recurring transaction created', {
      id: recurring.id,
      type: data.type,
      frequency: data.frequency,
      nextDueDate
    });

    return recurring;
  }

  /**
   * List recurring transactions by company and type
   */
  static async listRecurringTransactions(params: {
    companyId: number;
    type?: TransactionType;
    isActive?: boolean;
  }): Promise<RecurringTransaction[]> {
    const { companyId, type, isActive } = params;

    return prisma.recurringTransaction.findMany({
      where: {
        companyId,
        ...(type && { type }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        createdByUser: { select: { id: true, name: true } },
        _count: { select: { transactions: true } }
      },
      orderBy: { nextDueDate: 'asc' }
    });
  }

  /**
   * Update recurring transaction
   */
  static async updateRecurringTransaction(
    id: number,
    data: Partial<{
      description: string;
      amount: number | string;
      frequency: RecurringFrequency;
      dayOfMonth?: number;
      dayOfWeek?: number;
      startDate: Date;
      endDate?: Date;
      notes?: string;
      fromAccountId?: number;
      toAccountId?: number;
      categoryId?: number;
      isActive: boolean;
    }>,
    companyId: number
  ): Promise<RecurringTransaction> {
    
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, companyId }
    });

    if (!existing) {
      throw new Error(`Recurring transaction ${id} not found`);
    }

    // Recalculate next due date if frequency or timing changed
    let nextDueDate = existing.nextDueDate;
    if (data.frequency || data.dayOfMonth !== undefined || data.dayOfWeek !== undefined || data.startDate) {
      nextDueDate = this.calculateNextDueDate(
        data.startDate || existing.startDate,
        data.frequency || existing.frequency,
        data.dayOfMonth !== undefined ? data.dayOfMonth : existing.dayOfMonth,
        data.dayOfWeek !== undefined ? data.dayOfWeek : existing.dayOfWeek
      );
    }

    return prisma.recurringTransaction.update({
      where: { id },
      data: {
        ...data,
        nextDueDate
      }
    });
  }

  /**
   * Delete recurring transaction
   */
  static async deleteRecurringTransaction(id: number, companyId: number): Promise<void> {
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, companyId }
    });

    if (!existing) {
      throw new Error(`Recurring transaction ${id} not found`);
    }

    await prisma.recurringTransaction.delete({
      where: { id }
    });

    logger.info('Recurring transaction deleted', { id });
  }

  /**
   * Generate scheduled transactions from templates (manual trigger)
   */
  static async generateScheduledTransactions(
    recurringId: number,
    monthsAhead: number = 12,
    companyId: number
  ): Promise<number> {
    const recurring = await prisma.recurringTransaction.findFirst({
      where: { id: recurringId, companyId, isActive: true }
    });

    if (!recurring) {
      throw new Error(`Active recurring transaction ${recurringId} not found`);
    }

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsAhead);

    let currentDate = new Date(recurring.nextDueDate);
    let generated = 0;

    while (currentDate <= endDate && (!recurring.endDate || currentDate <= recurring.endDate)) {
      // Check if already exists
      const exists = await prisma.financialTransaction.findFirst({
        where: {
          recurringTransactionId: recurring.id,
          scheduledDate: currentDate
        }
      });

      if (!exists) {
        await prisma.financialTransaction.create({
          data: {
            description: recurring.description,
            amount: recurring.amount,
            date: currentDate,
            scheduledDate: currentDate,
            type: recurring.type,
            status: 'PENDING',
            notes: recurring.notes,
            fromAccount: recurring.fromAccountId ? { connect: { id: recurring.fromAccountId } } : undefined,
            toAccount: recurring.toAccountId ? { connect: { id: recurring.toAccountId } } : undefined,
            category: recurring.categoryId ? { connect: { id: recurring.categoryId } } : undefined,
            company: { connect: { id: recurring.companyId } },
            createdByUser: { connect: { id: recurring.createdBy } },
            recurringTransaction: { connect: { id: recurring.id } }
          }
        });
        generated++;
      }

      // Calculate next occurrence
      currentDate = this.getNextOccurrence(currentDate, recurring.frequency, recurring.dayOfMonth, recurring.dayOfWeek);
    }

    // Update next due date
    await prisma.recurringTransaction.update({
      where: { id: recurringId },
      data: { nextDueDate: currentDate }
    });

    logger.info('Scheduled transactions generated', {
      recurringId,
      generated,
      monthsAhead
    });

    return generated;
  }

  /**
   * Get projected transactions for a period (without creating them)
   */
  static async getProjectedTransactions(params: {
    companyId: number;
    type?: TransactionType;
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{
    id: number;
    description: string;
    amount: any;
    projectedDate: Date;
    type: TransactionType;
    fromAccount?: { id: number; name: string };
    toAccount?: { id: number; name: string };
    category?: { id: number; name: string; color: string };
  }>> {
    
    const { companyId, type, startDate, endDate } = params;
    
    const recurrings = await prisma.recurringTransaction.findMany({
      where: {
        companyId,
        isActive: true,
        ...(type && { type })
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } }
      }
    });

    const projections: any[] = [];

    for (const recurring of recurrings) {
      let currentDate = new Date(Math.max(recurring.nextDueDate.getTime(), startDate.getTime()));
      
      while (currentDate <= endDate && (!recurring.endDate || currentDate <= recurring.endDate)) {
        projections.push({
          id: recurring.id,
          description: recurring.description,
          amount: recurring.amount,
          projectedDate: new Date(currentDate),
          type: recurring.type,
          fromAccount: recurring.fromAccount,
          toAccount: recurring.toAccount,
          category: recurring.category
        });

        currentDate = this.getNextOccurrence(currentDate, recurring.frequency, recurring.dayOfMonth, recurring.dayOfWeek);
      }
    }

    return projections.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());
  }

  /**
   * Calculate next due date based on frequency and start date
   */
  private static calculateNextDueDate(
    startDate: Date,
    frequency: RecurringFrequency,
    dayOfMonth?: number | null,
    dayOfWeek?: number | null
  ): Date {
    const now = new Date();
    let nextDate = new Date(startDate);

    // If start date is in the past, move to next occurrence
    if (nextDate <= now) {
      nextDate = this.getNextOccurrence(now, frequency, dayOfMonth, dayOfWeek);
    }

    return nextDate;
  }

  /**
   * Get next occurrence based on frequency
   */
  private static getNextOccurrence(
    currentDate: Date,
    frequency: RecurringFrequency,
    dayOfMonth?: number | null,
    dayOfWeek?: number | null
  ): Date {
    const next = new Date(currentDate);

    switch (frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + 1);
        break;
        
      case 'WEEKLY':
        if (dayOfWeek !== null && dayOfWeek !== undefined) {
          const daysToAdd = (dayOfWeek - next.getDay() + 7) % 7 || 7;
          next.setDate(next.getDate() + daysToAdd);
        } else {
          next.setDate(next.getDate() + 7);
        }
        break;
        
      case 'MONTHLY':
        if (dayOfMonth !== null && dayOfMonth !== undefined) {
          next.setMonth(next.getMonth() + 1);
          next.setDate(Math.min(dayOfMonth, this.getDaysInMonth(next.getFullYear(), next.getMonth())));
        } else {
          next.setMonth(next.getMonth() + 1);
        }
        break;
        
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        if (dayOfMonth !== null && dayOfMonth !== undefined) {
          next.setDate(Math.min(dayOfMonth, this.getDaysInMonth(next.getFullYear(), next.getMonth())));
        }
        break;
        
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + 1);
        if (dayOfMonth !== null && dayOfMonth !== undefined) {
          next.setDate(Math.min(dayOfMonth, this.getDaysInMonth(next.getFullYear(), next.getMonth())));
        }
        break;
    }

    return next;
  }

  /**
   * Get days in month (handle leap years)
   */
  private static getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }
}