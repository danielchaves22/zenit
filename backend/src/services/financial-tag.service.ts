import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type FinancialTagSuggestion = {
  id: number;
  name: string;
  usageCount: number;
};

export default class FinancialTagService {
  static async listTags(companyId: number, search?: string, limit = 10): Promise<FinancialTagSuggestion[]> {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const normalizedSearch = search?.trim();

    const tags = await prisma.financialTag.findMany({
      where: {
        companyId,
        ...(normalizedSearch
          ? {
              name: {
                contains: normalizedSearch,
                mode: 'insensitive'
              }
            }
          : {})
      },
      include: {
        _count: {
          select: { transactions: true }
        }
      },
      orderBy: [
        {
          transactions: {
            _count: 'desc'
          }
        },
        { name: 'asc' }
      ],
      take: safeLimit
    });

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      usageCount: tag._count.transactions
    }));
  }
}
