import { z } from 'zod';

export const financialAccountMovementReportQuerySchema = z.object({
  startDate: z.string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Data inicial deve ser uma data valida'
    })
    .transform((date) => new Date(date)),
  endDate: z.string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Data final deve ser uma data valida'
    })
    .transform((date) => new Date(date)),
  financialAccountIds: z.string()
    .min(1, 'Pelo menos uma conta financeira deve ser selecionada')
    .refine((ids) => {
      const accountIds = ids.split(',').map((id) => parseInt(id.trim(), 10));
      return accountIds.every((id) => !isNaN(id) && id > 0);
    }, {
      message: 'IDs das contas financeiras devem ser numeros validos'
    }),
  groupBy: z.enum(['day', 'week', 'month'], {
    errorMap: () => ({ message: 'Agrupamento deve ser: day, week ou month' })
  }).optional().default('day')
}).refine((data) => data.startDate <= data.endDate, {
  message: 'Data inicial deve ser anterior ou igual a data final',
  path: ['endDate']
}).refine((data) => {
  const diffTime = Math.abs(data.endDate.getTime() - data.startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 365;
}, {
  message: 'Periodo maximo permitido e de 365 dias',
  path: ['endDate']
});

export const financialAccountMovementReportSchema = financialAccountMovementReportQuerySchema;

export const exportFinancialAccountMovementSchema = z.object({
  startDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data inicial deve ser uma data valida' }
  ),
  endDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data final deve ser uma data valida' }
  ),
  financialAccountIds: z.array(z.number().positive(), {
    required_error: 'IDs das contas financeiras sao obrigatorios',
    invalid_type_error: 'IDs das contas financeiras devem ser numeros'
  }).min(1, 'Pelo menos uma conta financeira deve ser selecionada'),
  groupBy: z.enum(['day', 'week', 'month'], {
    errorMap: () => ({ message: 'Agrupamento deve ser: day, week ou month' })
  }).optional().default('day'),
  data: z.array(z.object({
    period: z.string(),
    periodLabel: z.string(),
    income: z.number().min(0),
    expense: z.number().min(0),
    balance: z.number(),
    transactions: z.array(z.object({
      id: z.number(),
      description: z.string(),
      amount: z.number().positive(),
      date: z.string(),
      type: z.enum(['INCOME', 'EXPENSE']),
      financialAccount: z.object({
        id: z.number(),
        name: z.string()
      }),
      category: z.object({
        id: z.number(),
        name: z.string(),
        color: z.string()
      }).nullable().optional()
    }))
  }), {
    required_error: 'Dados do relatorio sao obrigatorios',
    invalid_type_error: 'Dados do relatorio devem ser um array'
  }).min(1, 'Dados do relatorio nao podem estar vazios')
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start <= end;
}, {
  message: 'Data inicial deve ser anterior ou igual a data final',
  path: ['endDate']
});

export type FinancialAccountMovementReportQuery = z.infer<typeof financialAccountMovementReportSchema>;
export type ExportFinancialAccountMovementData = z.infer<typeof exportFinancialAccountMovementSchema>;
