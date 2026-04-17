import {
  InboundImport,
  InboundImportDestinationType,
  InboundImportSourceType,
  Prisma,
  PrismaClient
} from '@prisma/client';

const prisma = new PrismaClient();

export default class InboundImportService {
  static async createInboundImport(data: {
    companyId: number;
    sourceType?: InboundImportSourceType;
    externalId: string;
    payloadMetadata?: Prisma.InputJsonValue | string;
    destinationType?: InboundImportDestinationType;
    destinationId?: string | null;
  }): Promise<InboundImport> {
    const normalizedExternalId = data.externalId.trim();

    if (!normalizedExternalId) {
      throw new Error('externalId é obrigatório.');
    }

    try {
      return await prisma.inboundImport.create({
        data: {
          companyId: data.companyId,
          sourceType: data.sourceType ?? 'EMAIL',
          externalId: normalizedExternalId,
          payloadMetadata: data.payloadMetadata as Prisma.InputJsonValue | undefined,
          destinationType: data.destinationType,
          destinationId: data.destinationId?.trim() || null,
          processedAt: data.destinationType ? new Date() : null
        }
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('Importação já registrada para sourceType + externalId nesta empresa.');
      }
      throw error;
    }
  }

  static async listInboundImports(params: {
    companyId: number;
    sourceType?: InboundImportSourceType;
    destinationType?: InboundImportDestinationType;
    processed?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: InboundImport[]; total: number; pages: number; page: number; pageSize: number }> {
    const {
      companyId,
      sourceType,
      destinationType,
      processed,
      search,
      page = 1,
      pageSize = 20
    } = params;

    const where: Prisma.InboundImportWhereInput = {
      companyId,
      ...(sourceType && { sourceType }),
      ...(destinationType && { destinationType }),
      ...(processed !== undefined
        ? processed
          ? { processedAt: { not: null } }
          : { processedAt: null }
        : {}),
      ...(search
        ? {
            OR: [
              { externalId: { contains: search, mode: 'insensitive' } },
              { destinationId: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [data, total] = await Promise.all([
      prisma.inboundImport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.inboundImport.count({ where })
    ]);

    return {
      data,
      total,
      pages: Math.ceil(total / pageSize) || 1,
      page,
      pageSize
    };
  }

  static async updateDestination(data: {
    id: number;
    companyId: number;
    destinationType: InboundImportDestinationType;
    destinationId?: string | null;
  }): Promise<InboundImport> {
    const existing = await prisma.inboundImport.findFirst({
      where: {
        id: data.id,
        companyId: data.companyId
      }
    });

    if (!existing) {
      throw new Error('Importação não encontrada.');
    }

    const normalizedDestinationId = data.destinationId?.trim() || null;

    if ((data.destinationType === 'PROCESS' || data.destinationType === 'CLIENT') && !normalizedDestinationId) {
      throw new Error('destinationId é obrigatório para destinationType PROCESS e CLIENT.');
    }

    return prisma.inboundImport.update({
      where: { id: data.id },
      data: {
        destinationType: data.destinationType,
        destinationId: normalizedDestinationId,
        processedAt: new Date()
      }
    });
  }
}

