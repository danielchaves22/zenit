// backend/src/validators/financial-recurring.validator.ts
import { z } from 'zod';

// Schema para criar transação recorrente
export const createRecurringTransactionSchema = z.object({
  description: z.string().min(3, { message: 'Descrição deve ter pelo menos 3 caracteres' }),
  amount: z.string().or(z.number())
    .refine(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return !isNaN(num) && num > 0;
    }, { message: 'Valor deve ser um número positivo' }),
  type: z.enum(['INCOME', 'EXPENSE'], { 
    errorMap: () => ({ message: 'Tipo deve ser INCOME ou EXPENSE' }) 
  }),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], {
    errorMap: () => ({ message: 'Frequência inválida' })
  }),
  dayOfMonth: z.number().min(1).max(31).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startDate: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  endDate: z.string().or(z.date()).transform(val => new Date(val)).optional().nullable(),
  notes: z.string().optional(),
  fromAccountId: z.number().optional().nullable(),
  toAccountId: z.number().optional().nullable(),
  categoryId: z.number().optional().nullable(),
}).refine(data => {
  // Regra: Se for EXPENSE, precisa de fromAccountId
  if (data.type === 'EXPENSE' && !data.fromAccountId) return false;
  // Regra: Se for INCOME, precisa de toAccountId
  if (data.type === 'INCOME' && !data.toAccountId) return false;
  return true;
}, {
  message: 'Contas inconsistentes para o tipo de transação',
  path: ['type']
});

// Schema para atualização de transação recorrente
export const updateRecurringTransactionSchema = z.object({
  description: z.string().min(3, { message: 'Descrição deve ter pelo menos 3 caracteres' }).optional(),
  amount: z.string().or(z.number()).optional()
    .refine(val => {
      if (val === undefined) return true;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return !isNaN(num) && num > 0;
    }, { message: 'Valor deve ser um número positivo' }),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  dayOfMonth: z.number().min(1).max(31).optional().nullable(),
  dayOfWeek: z.number().min(0).max(6).optional().nullable(),
  startDate: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  endDate: z.string().or(z.date()).transform(val => new Date(val)).optional().nullable(),
  notes: z.string().optional().nullable(),
  fromAccountId: z.number().optional().nullable(),
  toAccountId: z.number().optional().nullable(),
  categoryId: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

// Schema para gerar transações
export const generateTransactionsSchema = z.object({
  monthsAhead: z.number().min(1).max(36).optional().default(12)
});

// Schema para listar transações recorrentes
export const listRecurringTransactionsSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  isActive: z.string().optional().transform(val => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
});

// Schema para obter projeções
export const getProjectionsSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  startDate: z.string().transform(val => new Date(val)),
  endDate: z.string().transform(val => new Date(val)),
});