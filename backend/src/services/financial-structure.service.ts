import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

type FinancialStructureResult = {
  created: boolean;
  structure?: {
    account: any;
    expenseCategory: any;
    incomeCategory: any;
  };
};

export default class FinancialStructureService {
  private static async ensureFinancialStructureWithDb(
    db: PrismaExecutor,
    companyId: number
  ): Promise<FinancialStructureResult> {
    logger.info('Ensuring financial structure for company', { companyId });

    const [existingAccount, existingExpenseCategory, existingIncomeCategory] = await Promise.all([
      db.financialAccount.findFirst({
        where: { companyId, isDefault: true }
      }),
      db.financialCategory.findFirst({
        where: {
          companyId,
          type: 'EXPENSE',
          isDefault: true
        }
      }),
      db.financialCategory.findFirst({
        where: {
          companyId,
          type: 'INCOME',
          isDefault: true
        }
      })
    ]);

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

    let account = existingAccount;
    if (!account) {
      account = await db.financialAccount.create({
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

    let expenseCategory = existingExpenseCategory;
    if (!expenseCategory) {
      expenseCategory = await db.financialCategory.create({
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

    let incomeCategory = existingIncomeCategory;
    if (!incomeCategory) {
      incomeCategory = await db.financialCategory.create({
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
  }

  static async ensureFinancialStructure(
    companyId: number,
    db?: PrismaExecutor
  ): Promise<FinancialStructureResult> {
    if (db) {
      return this.ensureFinancialStructureWithDb(db, companyId);
    }

    return prisma.$transaction((tx) => this.ensureFinancialStructureWithDb(tx, companyId));
  }

  static async hasCompleteFinancialStructure(companyId: number): Promise<boolean> {
    const [accountCount, expenseCategoryCount, incomeCategoryCount] = await Promise.all([
      prisma.financialAccount.count({
        where: { companyId, isDefault: true }
      }),
      prisma.financialCategory.count({
        where: {
          companyId,
          type: 'EXPENSE',
          isDefault: true
        }
      }),
      prisma.financialCategory.count({
        where: {
          companyId,
          type: 'INCOME',
          isDefault: true
        }
      })
    ]);

    return accountCount > 0 && expenseCategoryCount > 0 && incomeCategoryCount > 0;
  }

  static async removeFinancialStructure(companyId: number): Promise<void> {
    logger.warn('Removing all financial structure for company', { companyId });

    await prisma.$transaction(async (tx) => {
      await tx.financialTransaction.deleteMany({
        where: { companyId }
      });

      await tx.financialAccount.deleteMany({
        where: { companyId }
      });

      await tx.financialCategory.deleteMany({
        where: { companyId }
      });

      await tx.financialTag.deleteMany({
        where: { companyId }
      });
    });

    logger.warn('Financial structure removed completely', { companyId });
  }
}
