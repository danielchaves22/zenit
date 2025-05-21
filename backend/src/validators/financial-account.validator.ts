import { z } from 'zod';

// Schema para criar conta financeira
export const createAccountSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH'], {
    errorMap: () => ({ message: 'Tipo inválido de conta financeira' })
  }),
  initialBalance: z.string().or(z.number()).optional().default('0')
    .transform(val => {
      if (typeof val === 'string' && val.trim() === '') return 0;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 0 : num;
    }),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
});

// Schema para atualizar conta financeira
export const updateAccountSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }).optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH']).optional(),
  accountNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

// Schema para filtros na listagem de contas
export const listAccountsSchema = z.object({
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH']).optional(),
  isActive: z.string().optional().transform(val => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
  search: z.string().optional(),
});
