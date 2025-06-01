// backend/src/services/financial-structure.service.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export default class FinancialStructureService {
  /**
   * Garante que uma empresa tem estrutura financeira básica
   * (conta padrão + categorias padrão de receita e despesa)
   */
  static async ensureFinancialStructure(companyId: number): Promise<{
    created: boolean;
    structure?: {
      account: any;
      expenseCategory: any;
      incomeCategory: any;
    };
  }> {
    logger.info('Ensuring financial structure for company', { companyId });

    // Verificar se já existe estrutura básica
    const [existingAccount, existingExpenseCategory, existingIncomeCategory] = await Promise.all([
      prisma.financialAccount.findFirst({
        where: { companyId, isDefault: true }
      }),
      prisma.financialCategory.findFirst({
        where: { companyId, type: 'EXPENSE', isDefault: true }
      }),
      prisma.financialCategory.findFirst({
        where: { companyId, type: 'INCOME', isDefault: true }
      })
    ]);

    // Se já existe estrutura completa, não criar novamente
    if (existingAccount && existingExpenseCategory && existingIncomeCategory) {
      logger.info('Financial structure already exists', { 
        companyId,
        accountId: existingAccount.id,
        expenseCategoryId: existingExpenseCategory.id,
        incomeCategoryId: existingIncomeCategory.id
      });
      
      return {
        created: false,
        structure: {
          account: existingAccount,
          expenseCategory: existingExpenseCategory,
          incomeCategory: existingIncomeCategory
        }
      };
    }

    logger.info('Creating missing financial structure components', {
      companyId,
      needsAccount: !existingAccount,
      needsExpenseCategory: !existingExpenseCategory,
      needsIncomeCategory: !existingIncomeCategory
    });

    // Criar estrutura em transação para garantir consistência
    return await prisma.$transaction(async (tx) => {
      // Criar conta padrão se não existir
      let account = existingAccount;
      if (!account) {
        account = await tx.financialAccount.create({
          data: {
            name: 'Conta Principal',
            type: 'CHECKING',
            balance: 0,
            isActive: true,
            isDefault: true,
            companyId
          }
        });
        logger.info('Created default financial account', { 
          companyId, 
          accountId: account.id 
        });
      }

      // Criar categoria de despesa padrão se não existir
      let expenseCategory = existingExpenseCategory;
      if (!expenseCategory) {
        expenseCategory = await tx.financialCategory.create({
          data: {
            name: 'Despesas Gerais',
            type: 'EXPENSE',
            color: '#ef4444',
            isDefault: true,
            companyId
          }
        });
        logger.info('Created default expense category', { 
          companyId, 
          categoryId: expenseCategory.id 
        });
      }

      // Criar categoria de receita padrão se não existir
      let incomeCategory = existingIncomeCategory;
      if (!incomeCategory) {
        incomeCategory = await tx.financialCategory.create({
          data: {
            name: 'Receitas Gerais',
            type: 'INCOME',
            color: '#22c55e',
            isDefault: true,
            companyId
          }
        });
        logger.info('Created default income category', { 
          companyId, 
          categoryId: incomeCategory.id 
        });
      }

      logger.info('Financial structure ensured successfully', {
        companyId,
        accountId: account.id,
        expenseCategoryId: expenseCategory.id,
        incomeCategoryId: incomeCategory.id
      });

      return {
        created: true,
        structure: {
          account,
          expenseCategory,
          incomeCategory
        }
      };
    });
  }

  /**
   * Verifica se uma empresa tem estrutura financeira completa
   */
  static async hasCompleteFinancialStructure(companyId: number): Promise<boolean> {
    const [accountCount, expenseCategoryCount, incomeCategoryCount] = await Promise.all([
      prisma.financialAccount.count({
        where: { companyId, isDefault: true }
      }),
      prisma.financialCategory.count({
        where: { companyId, type: 'EXPENSE', isDefault: true }
      }),
      prisma.financialCategory.count({
        where: { companyId, type: 'INCOME', isDefault: true }
      })
    ]);

    return accountCount > 0 && expenseCategoryCount > 0 && incomeCategoryCount > 0;
  }

  /**
   * Remove toda a estrutura financeira de uma empresa
   * (útil para testes ou reset completo)
   */
  static async removeFinancialStructure(companyId: number): Promise<void> {
    logger.warn('Removing all financial structure for company', { companyId });

    await prisma.$transaction(async (tx) => {
      // Remover transações primeiro (FK constraints)
      await tx.financialTransaction.deleteMany({
        where: { companyId }
      });

      // Remover contas
      await tx.financialAccount.deleteMany({
        where: { companyId }
      });

      // Remover categorias
      await tx.financialCategory.deleteMany({
        where: { companyId }
      });

      // Remover tags
      await tx.financialTag.deleteMany({
        where: { companyId }
      });
    });

    logger.warn('Financial structure removed completely', { companyId });
  }
}