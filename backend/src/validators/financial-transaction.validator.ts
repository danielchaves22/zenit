import { z } from 'zod';

// Schema para criar transação
export const createTransactionSchema = z.object({
  description: z.string().min(3, { message: 'Descrição deve ter pelo menos 3 caracteres' }),
  amount: z.string().or(z.number())
    .refine(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return !isNaN(num) && num > 0;
    }, { message: 'Valor deve ser um número positivo' }),
  date: z.string().or(z.date()).transform(val => new Date(val)),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], { 
    errorMap: () => ({ message: 'Tipo deve ser INCOME, EXPENSE ou TRANSFER' }) 
  }),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED']).optional().default('PENDING'),
  notes: z.string().optional(),
  fromAccountId: z.number().optional().nullable(),
  toAccountId: z.number().optional().nullable(),
  categoryId: z.number().optional().nullable(),
  tags: z.array(z.string()).optional(),
}).refine(data => {
  // Regra: Se for INCOME, precisa de toAccountId
  if (data.type === 'INCOME' && !data.toAccountId) return false;
  // Regra: Se for EXPENSE, precisa de fromAccountId
  if (data.type === 'EXPENSE' && !data.fromAccountId) return false;
  // Regra: Se for TRANSFER, precisa de ambos
  if (data.type === 'TRANSFER' && (!data.fromAccountId || !data.toAccountId)) return false;
  return true;
}, {
  message: 'Contas inconsistentes para o tipo de transação',
  path: ['type'] // Campo ao qual o erro está associado
});

// Schema para atualização de transação
export const updateTransactionSchema = z.object({
  description: z.string().min(3, { message: 'Descrição deve ter pelo menos 3 caracteres' }).optional(),
  amount: z.string().or(z.number()).optional()
    .refine(val => {
      if (val === undefined) return true;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return !isNaN(num) && num > 0;
    }, { message: 'Valor deve ser um número positivo' }),
  date: z.string().or(z.date()).transform(val => new Date(val)).optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED']).optional(),
  notes: z.string().optional().nullable(),
  fromAccountId: z.number().optional().nullable(),
  toAccountId: z.number().optional().nullable(),
  categoryId: z.number().optional().nullable(),
  tags: z.array(z.string()).optional(),
}).refine(data => {
  // Se não estiver alterando o tipo, não valida as contas
  if (!data.type) return true;

  // Se alterar o tipo para INCOME, precisa ter toAccountId ou não alterá-lo
  if (data.type === 'INCOME' && data.toAccountId === null) return false;
  
  // Se alterar o tipo para EXPENSE, precisa ter fromAccountId ou não alterá-lo
  if (data.type === 'EXPENSE' && data.fromAccountId === null) return false;
  
  // Se alterar o tipo para TRANSFER, precisa ter ambos ou não alterá-los
  if (data.type === 'TRANSFER') {
    if (data.fromAccountId === null || data.toAccountId === null) return false;
  }
  
  return true;
}, {
  message: 'Contas inconsistentes para o tipo de transação',
  path: ['type']
});

// Schema para atualização de status de transação
export const updateTransactionStatusSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser PENDING, COMPLETED ou CANCELED' })
  })
});

// Schema para listagem de transações com filtros
export const listTransactionsSchema = z.object({
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED']).optional(),
  accountId: z.string().optional().transform(val => val ? Number(val) : undefined),
  categoryId: z.string().optional().transform(val => val ? Number(val) : undefined),
  search: z.string().optional(),
  page: z.string().optional().transform(val => val ? Number(val) : 1),
  pageSize: z.string().optional().transform(val => val ? Number(val) : 20),
});

// ✅ NOVO: Schema para validação de autocomplete
export const autocompleteQuerySchema = z.object({
  q: z.string()
    .min(3, { message: 'Query deve ter pelo menos 3 caracteres' })
    .max(100, { message: 'Query muito longa (máximo 100 caracteres)' })
    .trim(),
  limit: z.string()
    .optional()
    .transform(val => val ? parseInt(val) : 10)
    .refine(val => val >= 1 && val <= 20, { 
      message: 'Limite deve ser entre 1 e 20' 
    })
});
