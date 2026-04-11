import { z } from 'zod';

const processStatusEnum = z.enum(['SOLICITACAO', 'INICIAL', 'CALCULO']);
const processOriginTypeEnum = z.enum(['MANUAL', 'IMPORT']);
const tagMatchModeEnum = z.enum(['ANY', 'ALL']);

const tagIdsSchema = z.array(
  z.number().int('ID da tag deve ser um numero inteiro').positive('ID da tag deve ser positivo')
);

export const createProcessSchema = z.object({
  status: processStatusEnum,
  requestingLawyerName: z.string().trim().max(255, 'Nome do advogado deve ter no maximo 255 caracteres').optional().nullable(),
  claimantName: z.string().trim().max(255, 'Nome do reclamante deve ter no maximo 255 caracteres').optional().nullable(),
  notes: z.string().trim().max(3000, 'Observacoes devem ter no maximo 3000 caracteres').optional().nullable(),
  originType: processOriginTypeEnum.optional().default('MANUAL'),
  sourceImportId: z.number().int('sourceImportId deve ser inteiro').positive('sourceImportId deve ser positivo').optional().nullable(),
  tagIds: tagIdsSchema.optional().default([])
});

export const updateProcessSchema = z.object({
  status: processStatusEnum.optional(),
  requestingLawyerName: z.string().trim().max(255, 'Nome do advogado deve ter no maximo 255 caracteres').optional().nullable(),
  claimantName: z.string().trim().max(255, 'Nome do reclamante deve ter no maximo 255 caracteres').optional().nullable(),
  notes: z.string().trim().max(3000, 'Observacoes devem ter no maximo 3000 caracteres').optional().nullable(),
  originType: processOriginTypeEnum.optional(),
  sourceImportId: z.number().int('sourceImportId deve ser inteiro').positive('sourceImportId deve ser positivo').optional().nullable(),
  tagIds: tagIdsSchema.optional(),
  statusReason: z.string().trim().max(500, 'Motivo de status deve ter no maximo 500 caracteres').optional().nullable()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Ao menos um campo deve ser fornecido para atualizacao.'
});

export const updateProcessStatusSchema = z.object({
  status: processStatusEnum,
  reason: z.string().trim().max(500, 'Motivo deve ter no maximo 500 caracteres').optional().nullable()
});

export const listProcessesSchema = z.object({
  status: processStatusEnum.optional(),
  startDate: z.coerce.date({ errorMap: () => ({ message: 'Data inicial invalida' }) }).optional(),
  endDate: z.coerce.date({ errorMap: () => ({ message: 'Data final invalida' }) }).optional(),
  search: z.string().trim().max(100, 'Busca deve ter no maximo 100 caracteres').optional(),
  tagIds: z.string().trim().optional(),
  tagMatchMode: tagMatchModeEnum.optional().default('ANY'),
  page: z.coerce.number().int('Pagina deve ser inteiro').min(1, 'Pagina deve ser no minimo 1').default(1),
  pageSize: z.coerce.number().int('Tamanho da pagina deve ser inteiro').min(1, 'Tamanho da pagina deve ser no minimo 1').max(100, 'Tamanho da pagina deve ser no maximo 100').default(20)
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: 'Data final deve ser posterior ou igual a data inicial',
  path: ['endDate']
});
