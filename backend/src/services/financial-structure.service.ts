// backend/src/services/financial-structure.service.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export default class FinancialStructureService {
  
  /**
   * Cria estrutura financeira básica para nova empresa
   * - Conta Principal (padrão)
   * - Categoria "Despesas Gerais" (EXPENSE, padrão)
   * - Categoria "Outras Receitas" (INCOME, padrão)
   */
  static async createDefaultFinancialStructure(companyId: number): Promise<{
    account: any;
    expenseCategory: any;
    incomeCategory: any;
  }> {
    logger.info('Creating default financial structure for company', { companyId });

    return await prisma.$transaction(async (tx) => {
      
      // 1. Criar conta principal (padrão)
      const account = await tx.financialAccount.create({
        data: {
          name: 'Conta Principal',
          type: 'CHECKING',
          balance: 0,
          companyId: companyId,
          isActive: true,
          isDefault: true, // ✅ Marcar como padrão
          accountNumber: null,
          bankName: null
        }
      });

      // 2. Criar categoria de despesas (padrão)
      const expenseCategory = await tx.financialCategory.create({
        data: {
          name: 'Despesas Gerais',
          type: 'EXPENSE',
          color: '#DC2626', // Vermelho para despesas
          companyId: companyId,
          isDefault: true, // ✅ Marcar como padrão
          parentId: null,
          accountingCode: null
        }
      });

      // 3. Criar categoria de receitas (padrão)
      const incomeCategory = await tx.financialCategory.create({
        data: {
          name: 'Outras Receitas',
          type: 'INCOME',
          color: '#16A34A', // Verde para receitas
          companyId: companyId,
          isDefault: true, // ✅ Marcar como padrão
          parentId: null,
          accountingCode: null
        }
      });

      logger.info('Default financial structure created successfully', {
        companyId,
        accountId: account.id,
        expenseCategoryId: expenseCategory.id,
        incomeCategoryId: incomeCategory.id
      });

      return {
        account,
        expenseCategory,
        incomeCategory
      };
    });
  }

  /**
   * Verifica se uma empresa já possui estrutura financeira criada
   */
  static async hasFinancialStructure(companyId: number): Promise<boolean> {
    const [accountCount, categoryCount] = await Promise.all([
      prisma.financialAccount.count({
        where: { companyId }
      }),
      prisma.financialCategory.count({
        where: { companyId }
      })
    ]);

    return accountCount > 0 || categoryCount > 0;
  }

  /**
   * Cria estrutura financeira apenas se ainda não existir
   */
  static async ensureFinancialStructure(companyId: number): Promise<{
    created: boolean;
    structure?: {
      account: any;
      expenseCategory: any;
      incomeCategory: any;
    };
  }> {
    const hasStructure = await this.hasFinancialStructure(companyId);
    
    if (hasStructure) {
      logger.info('Company already has financial structure, skipping creation', { companyId });
      return { created: false };
    }

    const structure = await this.createDefaultFinancialStructure(companyId);
    
    return {
      created: true,
      structure
    };
  }
}