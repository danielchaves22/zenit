import { PrismaClient, ProcessTag } from '@prisma/client';

const prisma = new PrismaClient();

export default class ProcessTagService {
  static async createTag(companyId: number, name: string): Promise<ProcessTag> {
    const normalizedName = name.trim();

    const existing = await prisma.processTag.findFirst({
      where: {
        companyId,
        name: { equals: normalizedName, mode: 'insensitive' }
      }
    });

    if (existing) {
      throw new Error('Ja existe uma tag com este nome para a empresa atual.');
    }

    return prisma.processTag.create({
      data: {
        companyId,
        name: normalizedName
      }
    });
  }

  static async listTags(companyId: number, search?: string, limit = 20): Promise<Array<ProcessTag & { usageCount: number }>> {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));

    const tags = await prisma.processTag.findMany({
      where: {
        companyId,
        ...(search
          ? {
              name: { contains: search.trim(), mode: 'insensitive' }
            }
          : {})
      },
      include: {
        _count: {
          select: { processes: true }
        }
      },
      orderBy: { name: 'asc' },
      take: safeLimit
    });

    return tags.map((tag) => ({
      id: tag.id,
      companyId: tag.companyId,
      name: tag.name,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      usageCount: tag._count.processes
    }));
  }
}
