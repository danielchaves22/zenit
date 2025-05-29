// backend/src/services/default.service.ts
import { PrismaClient, TransactionType } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export default class DefaultService {
  
  /**
   * Define uma conta como padrão (remove padrão de outras contas da empresa)
   */
  static async setDefaultAccount(accountId: number, companyId: number): Promise<void> {
    return await prisma.$transaction(async (tx) => {
      // 1. Verificar se a conta existe e pertence à empresa
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, companyId }
      });

      if (!account) {
        throw new Error('Conta não encontrada ou não pertence à empresa');
      }

      if (!account.isActive) {
        throw new Error('Não é possível definir uma conta inativa como padrão');
      }

      // 2. Remover padrão de todas as outras contas da empresa
      await tx.financialAccount.updateMany({
        where: { 
          companyId,
          id: { not: accountId },
          isDefault: true 
        },
        data: { isDefault: false }
      });

      // 3. Definir esta conta como padrão
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

  /**
   * Remove o status padrão de uma conta
   */
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
      throw new Error('Conta não encontrada ou não é padrão');
    }

    logger.info('Default account removed', { accountId, companyId });
  }

  /**
   * Define uma categoria como padrão (remove padrão de outras categorias do mesmo tipo)
   */
  static async setDefaultCategory(
    categoryId: number, 
    companyId: number
  ): Promise<void> {
    return await prisma.$transaction(async (tx) => {
      // 1. Verificar se a categoria existe e pertence à empresa
      const category = await tx.financialCategory.findFirst({
        where: { id: categoryId, companyId }
      });

      if (!category) {
        throw new Error('Categoria não encontrada ou não pertence à empresa');
      }

      // 2. Remover padrão de outras categorias do mesmo tipo na empresa
      await tx.financialCategory.updateMany({
        where: { 
          companyId,
          type: category.type,
          id: { not: categoryId },
          isDefault: true 
        },
        data: { isDefault: false }
      });

      // 3. Definir esta categoria como padrão
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

  /**
   * Remove o status padrão de uma categoria
   */
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
      throw new Error('Categoria não encontrada ou não é padrão');
    }

    logger.info('Default category removed', { categoryId, companyId });
  }

  /**
   * Obtém conta padrão da empresa
   */
  static async getDefaultAccount(companyId: number) {
    return await prisma.financialAccount.findFirst({
      where: { 
        companyId, 
        isDefault: true,
        isActive: true 
      }
    });
  }

  /**
   * Obtém categoria padrão por tipo da empresa
   */
  static async getDefaultCategory(companyId: number, type: TransactionType) {
    return await prisma.financialCategory.findFirst({
      where: { 
        companyId, 
        type,
        isDefault: true 
      }
    });
  }

  /**
   * Obtém todos os padrões da empresa (para dashboard/relatórios)
   */
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