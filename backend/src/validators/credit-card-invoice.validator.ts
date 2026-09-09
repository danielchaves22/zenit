import { z } from 'zod';

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

export const listCreditCardInvoicesSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  includePaid: booleanQuerySchema
    .optional()
    .default(true)
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

export const creditCardFixedMaterializationSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  referenceYear: z.coerce.number()
    .int('Ano de referencia deve ser um numero inteiro')
    .min(1900, 'Ano de referencia invalido')
    .max(9999, 'Ano de referencia invalido'),
  referenceMonth: z.coerce.number()
    .int('Mes de referencia deve ser um numero inteiro')
    .min(1, 'Mes de referencia deve ser entre 1 e 12')
    .max(12, 'Mes de referencia deve ser entre 1 e 12')
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
