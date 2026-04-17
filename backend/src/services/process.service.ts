import {
  Process as DomainProcess,
  ProcessOriginType,
  ProcessStatus,
  Prisma,
  PrismaClient
} from '@prisma/client';

const prisma = new PrismaClient();

function normalizeOptionalString(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function parseTagIds(tagIds?: number[]): number[] {
  if (!tagIds || tagIds.length === 0) return [];
  return Array.from(new Set(tagIds.filter((id) => Number.isInteger(id) && id > 0)));
}

type TagMatchMode = 'ANY' | 'ALL';

export default class ProcessService {
  static async createProcess(data: {
    companyId: number;
    status: ProcessStatus;
    requestingLawyerName?: string | null;
    claimantName?: string | null;
    notes?: string | null;
    originType?: ProcessOriginType;
    sourceImportId?: number | null;
    tagIds?: number[];
    createdBy: number;
    statusReason?: string | null;
  }): Promise<DomainProcess> {
    const tagIds = parseTagIds(data.tagIds);

    await this.ensureTagIdsBelongToCompany(data.companyId, tagIds);
    await this.ensureSourceImportBelongsToCompany(data.companyId, data.sourceImportId);

    return prisma.$transaction(async (tx) => {
      const created = await tx.process.create({
        data: {
          companyId: data.companyId,
          status: data.status,
          requestingLawyerName: normalizeOptionalString(data.requestingLawyerName),
          claimantName: normalizeOptionalString(data.claimantName),
          notes: normalizeOptionalString(data.notes),
          originType: data.originType ?? 'MANUAL',
          sourceImportId: data.sourceImportId ?? null,
          createdBy: data.createdBy,
          updatedBy: data.createdBy,
          processTags: tagIds.length
            ? {
                createMany: {
                  data: tagIds.map((tagId) => ({ tagId }))
                }
              }
            : undefined
        }
      });

      await tx.processStatusHistory.create({
        data: {
          processId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedBy: data.createdBy,
          reason: normalizeOptionalString(data.statusReason)
        }
      });

      return created;
    });
  }

  static async listProcesses(params: {
    companyId: number;
    status?: ProcessStatus;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    tagIds?: number[];
    tagMatchMode?: TagMatchMode;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data: any[];
    total: number;
    pages: number;
    page: number;
    pageSize: number;
  }> {
    const {
      companyId,
      status,
      startDate,
      endDate,
      search,
      tagIds = [],
      tagMatchMode = 'ANY',
      page = 1,
      pageSize = 20
    } = params;

    const parsedTagIds = parseTagIds(tagIds);
    const numericSearch = search && /^\d+$/.test(search.trim()) ? Number(search.trim()) : null;
    const andFilters: Prisma.ProcessWhereInput[] = [];

    if (parsedTagIds.length) {
      if (tagMatchMode === 'ALL') {
        for (const tagId of parsedTagIds) {
          andFilters.push({
            processTags: {
              some: { tagId }
            }
          });
        }
      } else {
        andFilters.push({
          processTags: {
            some: {
              tagId: { in: parsedTagIds }
            }
          }
        });
      }
    }

    const where: Prisma.ProcessWhereInput = {
      companyId,
      deletedAt: null,
      ...(status && { status }),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate })
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              { requestingLawyerName: { contains: search, mode: 'insensitive' } },
              { claimantName: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              ...(numericSearch ? [{ id: numericSearch }] : [])
            ]
          }
        : {}),
      ...(andFilters.length ? { AND: andFilters } : {})
    };

    const [data, total] = await Promise.all([
      prisma.process.findMany({
        where,
        include: {
          processTags: {
            include: {
              tag: true
            }
          },
          sourceImport: {
            select: {
              id: true,
              sourceType: true,
              externalId: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.process.count({ where })
    ]);

    return {
      data,
      total,
      pages: Math.ceil(total / pageSize) || 1,
      page,
      pageSize
    };
  }

  static async getProcessById(id: number, companyId: number, includeDeleted = false): Promise<any | null> {
    return prisma.process.findFirst({
      where: {
        id,
        companyId,
        ...(includeDeleted ? {} : { deletedAt: null })
      },
      include: {
        processTags: {
          include: { tag: true }
        },
        sourceImport: true,
        statusHistory: {
          include: {
            changedByUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { changedAt: 'desc' }
        }
      }
    });
  }

  static async updateProcess(data: {
    id: number;
    companyId: number;
    status?: ProcessStatus;
    requestingLawyerName?: string | null;
    claimantName?: string | null;
    notes?: string | null;
    originType?: ProcessOriginType;
    sourceImportId?: number | null;
    tagIds?: number[];
    statusReason?: string | null;
    updatedBy: number;
  }): Promise<DomainProcess> {
    const existing = await prisma.process.findFirst({
      where: {
        id: data.id,
        companyId: data.companyId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new Error('Processo não encontrado.');
    }

    const parsedTagIds = data.tagIds === undefined ? undefined : parseTagIds(data.tagIds);

    if (parsedTagIds) {
      await this.ensureTagIdsBelongToCompany(data.companyId, parsedTagIds);
    }

    if (data.sourceImportId !== undefined) {
      await this.ensureSourceImportBelongsToCompany(data.companyId, data.sourceImportId);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.process.update({
        where: { id: data.id },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.requestingLawyerName !== undefined && { requestingLawyerName: normalizeOptionalString(data.requestingLawyerName) }),
          ...(data.claimantName !== undefined && { claimantName: normalizeOptionalString(data.claimantName) }),
          ...(data.notes !== undefined && { notes: normalizeOptionalString(data.notes) }),
          ...(data.originType !== undefined && { originType: data.originType }),
          ...(data.sourceImportId !== undefined && { sourceImportId: data.sourceImportId }),
          updatedBy: data.updatedBy
        }
      });

      if (parsedTagIds !== undefined) {
        await tx.processTagLink.deleteMany({ where: { processId: data.id } });
        if (parsedTagIds.length) {
          await tx.processTagLink.createMany({
            data: parsedTagIds.map((tagId) => ({
              processId: data.id,
              tagId
            }))
          });
        }
      }

      if (data.status !== undefined && data.status !== existing.status) {
        await tx.processStatusHistory.create({
          data: {
            processId: data.id,
            fromStatus: existing.status,
            toStatus: data.status,
            changedBy: data.updatedBy,
            reason: normalizeOptionalString(data.statusReason)
          }
        });
      }

      return updated;
    });
  }

  static async updateProcessStatus(data: {
    id: number;
    companyId: number;
    toStatus: ProcessStatus;
    changedBy: number;
    reason?: string | null;
  }): Promise<DomainProcess> {
    const existing = await prisma.process.findFirst({
      where: {
        id: data.id,
        companyId: data.companyId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new Error('Processo não encontrado.');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.process.update({
        where: { id: data.id },
        data: {
          status: data.toStatus,
          updatedBy: data.changedBy
        }
      });

      await tx.processStatusHistory.create({
        data: {
          processId: data.id,
          fromStatus: existing.status,
          toStatus: data.toStatus,
          changedBy: data.changedBy,
          reason: normalizeOptionalString(data.reason)
        }
      });

      return updated;
    });
  }

  static async softDeleteProcess(id: number, companyId: number, updatedBy: number): Promise<void> {
    const existing = await prisma.process.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new Error('Processo não encontrado.');
    }

    await prisma.process.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy
      }
    });
  }

  static async getStatusHistory(processId: number, companyId: number): Promise<any[]> {
    const process = await prisma.process.findFirst({
      where: {
        id: processId,
        companyId
      },
      select: { id: true }
    });

    if (!process) {
      throw new Error('Processo não encontrado.');
    }

    return prisma.processStatusHistory.findMany({
      where: { processId },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { changedAt: 'desc' }
    });
  }

  static async addTagToProcess(processId: number, tagId: number, companyId: number): Promise<void> {
    await this.ensureProcessAndTagInSameCompany(processId, tagId, companyId);

    try {
      await prisma.processTagLink.create({
        data: {
          processId,
          tagId
        }
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  static async removeTagFromProcess(processId: number, tagId: number, companyId: number): Promise<void> {
    const process = await prisma.process.findFirst({
      where: {
        id: processId,
        companyId
      },
      select: { id: true }
    });

    if (!process) {
      throw new Error('Processo não encontrado.');
    }

    await prisma.processTagLink.deleteMany({
      where: {
        processId,
        tagId
      }
    });
  }

  private static async ensureTagIdsBelongToCompany(companyId: number, tagIds: number[]): Promise<void> {
    if (!tagIds.length) return;

    const count = await prisma.processTag.count({
      where: {
        companyId,
        id: { in: tagIds }
      }
    });

    if (count !== tagIds.length) {
      throw new Error('Uma ou mais tags não pertencem à empresa atual.');
    }
  }

  private static async ensureSourceImportBelongsToCompany(companyId: number, sourceImportId?: number | null): Promise<void> {
    if (!sourceImportId) return;

    const sourceImport = await prisma.inboundImport.findFirst({
      where: {
        id: sourceImportId,
        companyId
      },
      select: { id: true }
    });

    if (!sourceImport) {
      throw new Error('Importação de origem não encontrada para a empresa atual.');
    }
  }

  private static async ensureProcessAndTagInSameCompany(processId: number, tagId: number, companyId: number): Promise<void> {
    const [process, tag] = await Promise.all([
      prisma.process.findFirst({
        where: {
          id: processId,
          companyId,
          deletedAt: null
        },
        select: { id: true }
      }),
      prisma.processTag.findFirst({
        where: {
          id: tagId,
          companyId
        },
        select: { id: true }
      })
    ]);

    if (!process) {
      throw new Error('Processo não encontrado.');
    }

    if (!tag) {
      throw new Error('Tag não encontrada.');
    }
  }
}
