import { PrismaClient, TransactionType } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export default class DefaultService {
  static async setDefaultAccount(accountId: number, companyId: number): Promise<void> {
    return prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, companyId }
      });

      if (!account) {
        throw new Error('Conta nao encontrada ou nao pertence a empresa');
      }

      if (!account.isActive) {
        throw new Error('Nao e possivel definir uma conta inativa como padrao');
      }

      await tx.financialAccount.updateMany({
        where: {
          companyId,
          id: { not: accountId },
          isDefault: true
        },
        data: { isDefault: false }
      });

      await tx.financialAccount.update({
        where: { id: accountId },
        data: { isDefault: true }
      });

      logger.info('Default account updated', {
        accountId,
        companyId,
        accountName: account.name
      });
    });
  }

  static async unsetDefaultAccount(accountId: number, companyId: number): Promise<void> {
    const updated = await prisma.financialAccount.updateMany({
      where: {
        id: accountId,
        companyId,
        isDefault: true
      },
      data: { isDefault: false }
    });

    if (updated.count === 0) {
      throw new Error('Conta nao encontrada ou nao e padrao');
    }

    logger.info('Default account removed', { accountId, companyId });
  }

  static async setDefaultCategory(categoryId: number, companyId: number): Promise<void> {
    return prisma.$transaction(async (tx) => {
      const category = await tx.financialCategory.findFirst({
        where: { id: categoryId, companyId }
      });

      if (!category) {
        throw new Error('Categoria nao encontrada ou nao pertence a empresa');
      }

      await tx.financialCategory.updateMany({
        where: {
          companyId,
          type: category.type,
          id: { not: categoryId },
          isDefault: true
        },
        data: { isDefault: false }
      });

      await tx.financialCategory.update({
        where: { id: categoryId },
        data: { isDefault: true }
      });

      logger.info('Default category updated', {
        categoryId,
        companyId,
        categoryName: category.name,
        type: category.type
      });
    });
  }

  static async unsetDefaultCategory(categoryId: number, companyId: number): Promise<void> {
    const updated = await prisma.financialCategory.updateMany({
      where: {
        id: categoryId,
        companyId,
        isDefault: true
      },
      data: { isDefault: false }
    });

    if (updated.count === 0) {
      throw new Error('Categoria nao encontrada ou nao e padrao');
    }

    logger.info('Default category removed', { categoryId, companyId });
  }

  static async getDefaultAccount(companyId: number) {
    return prisma.financialAccount.findFirst({
      where: {
        companyId,
        isDefault: true,
        isActive: true
      }
    });
  }

  static async getDefaultCategory(companyId: number, type: TransactionType) {
    return prisma.financialCategory.findFirst({
      where: {
        companyId,
        type,
        isDefault: true
      }
    });
  }

  static async getCompanyDefaults(companyId: number) {
    const [defaultAccount, defaultExpenseCategory, defaultIncomeCategory] = await Promise.all([
      this.getDefaultAccount(companyId),
      this.getDefaultCategory(companyId, 'EXPENSE'),
      this.getDefaultCategory(companyId, 'INCOME')
    ]);

    return {
      account: defaultAccount,
      categories: {
        expense: defaultExpenseCategory,
        income: defaultIncomeCategory
      }
    };
  }
}
