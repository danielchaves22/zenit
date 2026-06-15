import { z } from 'zod';

export const listCreditCardInvoicesSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo')
});

export const getCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo')
});

export const getProjectedCreditCardInvoiceSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  projectionKey: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Chave de projeção inválida')
});

export const payCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo'),
  fromAccountId: z.number()
    .int('ID da conta pagadora deve ser um numero inteiro')
    .positive('ID da conta pagadora deve ser positivo'),
  paymentDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de pagamento deve ser valida' })
  }).optional(),
  notes: z.string()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional()
});

export const reopenCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo')
});
