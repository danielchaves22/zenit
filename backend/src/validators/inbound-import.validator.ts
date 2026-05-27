import { z } from 'zod';

const sourceTypeEnum = z.enum(['EMAIL']);
const destinationTypeEnum = z.enum(['PROCESS', 'CLIENT', 'OTHER']);

export const createInboundImportSchema = z.object({
  sourceType: sourceTypeEnum.optional().default('EMAIL'),
  externalId: z.string().trim().min(1, 'externalId e obrigatorio').max(255, 'externalId deve ter no maximo 255 caracteres'),
  payloadMetadata: z.union([
    z.record(z.any()),
    z.string().trim().max(10000, 'payloadMetadata textual deve ter no maximo 10000 caracteres')
  ]).optional(),
  destinationType: destinationTypeEnum.optional(),
  destinationId: z.string().trim().max(255, 'destinationId deve ter no maximo 255 caracteres').optional().nullable()
});

export const listInboundImportsSchema = z.object({
  sourceType: sourceTypeEnum.optional(),
  destinationType: destinationTypeEnum.optional(),
  processed: z.union([z.literal('true'), z.literal('false')]).optional(),
  search: z.string().trim().max(100, 'Busca deve ter no maximo 100 caracteres').optional(),
  page: z.coerce.number().int('Pagina deve ser inteiro').min(1, 'Pagina deve ser no minimo 1').default(1),
  pageSize: z.coerce.number().int('Tamanho da pagina deve ser inteiro').min(1, 'Tamanho da pagina deve ser no minimo 1').max(100, 'Tamanho da pagina deve ser no maximo 100').default(20)
});

export const updateInboundImportDestinationSchema = z.object({
  destinationType: destinationTypeEnum,
  destinationId: z.string().trim().max(255, 'destinationId deve ter no maximo 255 caracteres').optional().nullable()
}).refine((data) => {
  if (data.destinationType === 'PROCESS' || data.destinationType === 'CLIENT') {
    return Boolean(data.destinationId && data.destinationId.trim().length > 0);
  }

  return true;
}, {
  message: 'destinationId e obrigatorio para destinationType PROCESS e CLIENT',
  path: ['destinationId']
});

export type ListInboundImportsQuery = z.infer<typeof listInboundImportsSchema>;
