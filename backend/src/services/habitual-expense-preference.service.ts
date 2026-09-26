import prisma from '../lib/prisma';

export default class HabitualExpensePreferenceService {
  static async get(companyId: number) {
    const [preference, categories] = await Promise.all([
      prisma.workspaceHabitualExpensePreference.findUnique({ where: { companyId } }),
      prisma.financialCategory.findMany({
        where: { companyId, type: 'EXPENSE' },
        select: { id: true, name: true, color: true, parentId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }]
      })
    ]);
    const validIds = new Set(categories.map((category) => category.id));
    return {
      configured: preference !== null,
      categoryIds: (preference?.categoryIds ?? []).filter((id) => validIds.has(id)),
      categories
    };
  }

  static async save(companyId: number, ids: number[]) {
    const categoryIds = [...new Set(ids)].sort((a, b) => a - b);
    const valid = await prisma.financialCategory.count({
      where: { companyId, type: 'EXPENSE', id: { in: categoryIds } }
    });
    if (valid !== categoryIds.length) {
      throw new Error('Selecione apenas categorias de despesa deste espaço financeiro');
    }
    await prisma.workspaceHabitualExpensePreference.upsert({
      where: { companyId },
      create: { companyId, categoryIds },
      update: { categoryIds }
    });
    return this.get(companyId);
  }
}
