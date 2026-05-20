import { BudgetEntryAllocationMode, BudgetEntryType, BudgetKind, BudgetStatus } from '@prisma/client';
import { z } from 'zod';

const isoDateString = z.string().datetime();

export const budgetEntrySyncSchema = z.object({
  clientKey: z.string().min(1),
  entryType: z.nativeEnum(BudgetEntryType),
  allocationMode: z.nativeEnum(BudgetEntryAllocationMode).nullable().optional(),
  amountCents: z.number().int().nonnegative(),
  principalImpactAmountCents: z.number().int(),
  occurredAt: isoDateString,
  description: z.string().trim().max(255).nullable().optional(),
  affectsBudgetBalance: z.boolean().optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString
});

export const budgetSyncSchema = z.object({
  deviceId: z.string().min(1),
  budgets: z.array(
    z.object({
      clientKey: z.string().min(1),
      code: z.string().min(1).max(120),
      kind: z.nativeEnum(BudgetKind),
      status: z.nativeEnum(BudgetStatus),
      initialBalanceCents: z.number().int(),
      currentBalanceCents: z.number().int(),
      targetEndingBalanceCents: z.number().int(),
      dailyBudgetInitialCents: z.number().int(),
      dailyBudgetCurrentCents: z.number().int(),
      dayExtraBalanceCents: z.number().int(),
      startDate: isoDateString,
      endDate: isoDateString,
      lastDailyBudgetDate: isoDateString,
      isPrimary: z.boolean(),
      createdAt: isoDateString,
      updatedAt: isoDateString,
      entries: z.array(budgetEntrySyncSchema)
    })
  )
});
