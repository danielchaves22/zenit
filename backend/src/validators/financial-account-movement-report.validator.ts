// backend/src/validators/financial-account-movement-report.validator.ts
import { z } from 'zod';

// Schema para validar parâmetros do relatório (query parameters)
export const financialAccountMovementReportQuerySchema = z.object({
  startDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data inicial deve ser uma data válida' }
  ),
  endDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data final deve ser uma data válida' }
  ),
  financialAccountIds: z.string()
    .min(1, 'Pelo menos uma conta financeira deve ser selecionada')
    .refine(
      (ids) => {
        const accountIds = ids.split(',').map(id => parseInt(id.trim()));
        return accountIds.every(id => !isNaN(id) && id > 0);
      },
      { message: 'IDs das contas financeiras devem ser números válidos' }
    ),
  groupBy: z.enum(['day', 'week', 'month'], {
    errorMap: () => ({ message: 'Agrupamento deve ser: day, week ou month' })
  }).optional().default('day')
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start <= end;
  },
  {
    message: 'Data inicial deve ser anterior ou igual à data final',
    path: ['endDate']
  }
).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 365; // Máximo 1 ano
  },
  {
    message: 'Período máximo permitido é de 365 dias',
    path: ['endDate']
  }
);

// Manter o schema original para compatibilidade
export const financialAccountMovementReportSchema = financialAccountMovementReportQuerySchema;

// Schema para validar dados de exportação
export const exportFinancialAccountMovementSchema = z.object({
  startDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data inicial deve ser uma data válida' }
  ),
  endDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Data final deve ser uma data válida' }
  ),
  financialAccountIds: z.array(z.number().positive(), {
    required_error: 'IDs das contas financeiras são obrigatórios',
    invalid_type_error: 'IDs das contas financeiras devem ser números'
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
    required_error: 'Dados do relatório são obrigatórios',
    invalid_type_error: 'Dados do relatório devem ser um array'
  }).min(1, 'Dados do relatório não podem estar vazios')
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start <= end;
  },
  {
    message: 'Data inicial deve ser anterior ou igual à data final',
    path: ['endDate']
  }
);

// Tipos TypeScript derivados dos schemas
export type FinancialAccountMovementReportQuery = z.infer<typeof financialAccountMovementReportSchema>;
export type ExportFinancialAccountMovementData = z.infer<typeof exportFinancialAccountMovementSchema>;