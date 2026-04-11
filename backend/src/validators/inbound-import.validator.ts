import { z } from 'zod';

const sourceTypeEnum = z.enum(['EMAIL']);
const destinationTypeEnum = z.enum(['PROCESS', 'CLIENT', 'OTHER']);

export const createInboundImportSchema = z.object({
  sourceType: sourceTypeEnum.optional().default('EMAIL'),
  externalId: z.string().trim().min(1, 'externalId é obrigatório').max(255, 'externalId deve ter no máximo 255 caracteres'),
  payloadMetadata: z.union([z.record(z.any()), z.string().trim().max(10000, 'payloadMetadata textual deve ter no máximo 10000 caracteres')]).optional(),
  destinationType: destinationTypeEnum.optional(),
  destinationId: z.string().trim().max(255, 'destinationId deve ter no máximo 255 caracteres').optional().nullable()
});

export const listInboundImportsSchema = z.object({
  sourceType: sourceTypeEnum.optional(),
  destinationType: destinationTypeEnum.optional(),
  processed: z.union([z.literal('true'), z.literal('false')]).optional(),
  search: z.string().trim().max(100, 'Busca deve ter no máximo 100 caracteres').optional(),
  page: z.coerce.number().int('Página deve ser inteiro').min(1, 'Página deve ser no mínimo 1').default(1),
  pageSize: z.coerce.number().int('Tamanho da página deve ser inteiro').min(1, 'Tamanho da página deve ser no mínimo 1').max(100, 'Tamanho da página deve ser no máximo 100').default(20)
});

export const updateInboundImportDestinationSchema = z.object({
  destinationType: destinationTypeEnum,
  destinationId: z.string().trim().max(255, 'destinationId deve ter no máximo 255 caracteres').optional().nullable()
}).refine((data) => {
  if (data.destinationType === 'PROCESS' || data.destinationType === 'CLIENT') {
    return !!(data.destinationId && data.destinationId.trim().length > 0);
  }
  return true;
}, {
  message: 'destinationId é obrigatório para destinationType PROCESS e CLIENT',
  path: ['destinationId']
});

