// backend/src/services/company.service.ts - COM MÉTODO PARA LISTAR EMPRESAS DO USUÁRIO
import { PrismaClient, Company, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import FinancialStructureService from './financial-structure.service';

const prisma = new PrismaClient();

export default class CompanyService {
  static async nextCode(): Promise<number> {
    const agg = await prisma.company.aggregate({
      _max: { code: true }
    });
    const max = agg._max.code ?? -1;
    return max + 1;
  }

  /**
   * Cria empresa e estrutura financeira básica automaticamente
   */
  static async createCompany(data: {
    name: string;
    address?: string;
    createFinancialStructure?: boolean; // Opcional, padrão true
  }): Promise<{
    company: Company;
    financialStructure?: {
      account: any;
      expenseCategory: any;
      incomeCategory: any;
    };
  }> {
    const { name, address, createFinancialStructure = true } = data;
    
    logger.info('Creating new company', { name, createFinancialStructure });
    
    // Criar empresa primeiro
    const code = await this.nextCode();
    const company = await prisma.company.create({
      data: { name, address, code }
    });

    logger.info('Company created successfully', { 
      companyId: company.id, 
      name: company.name, 
      code: company.code 
    });

    // Criar estrutura financeira se solicitado
    let financialStructure;
    if (createFinancialStructure) {
      try {
        const result = await FinancialStructureService.ensureFinancialStructure(company.id);
        if (result.created) {
          financialStructure = result.structure;
          logger.info('Financial structure created with company', { 
            companyId: company.id,
            accountName: financialStructure?.account.name,
            expenseCategoryName: financialStructure?.expenseCategory.name,
            incomeCategoryName: financialStructure?.incomeCategory.name
          });
        }
      } catch (error) {
        // Log do erro mas não falha a criação da empresa
        logger.error('Failed to create financial structure for new company', {
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      company,
      financialStructure
    };
  }

  /**
   * Cria estrutura financeira para empresa existente (caso não tenha)
   */
  static async createFinancialStructureForExistingCompany(companyId: number): Promise<{
    created: boolean;
    structure?: {
      account: any;
      expenseCategory: any;
      incomeCategory: any;
    };
  }> {
    // Verificar se empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      throw new Error(`Company with ID ${companyId} not found`);
    }

    return await FinancialStructureService.ensureFinancialStructure(companyId);
  }

  /**
   * Lista todas as empresas (para ADMIN)
   */
  static async listCompanies(): Promise<Company[]> {
    return prisma.company.findMany({ 
      orderBy: { code: 'asc' } 
    });
  }

  /**
   * ✅ NOVO: Lista apenas as empresas às quais o usuário tem acesso (para SUPERUSER)
   */
  static async listUserCompanies(userId: number): Promise<Company[]> {
    const userCompanies = await prisma.company.findMany({
      where: {
        users: {
          some: {
            userId: userId
          }
        }
      },
      orderBy: { code: 'asc' }
    });

    return userCompanies;
  }

  static async updateCompany(
    id: number,
    data: Partial<Prisma.CompanyUpdateInput>
  ): Promise<Company> {
    return prisma.company.update({ where: { id }, data });
  }

  static async deleteCompany(id: number): Promise<void> {
    // Verificar se há dados financeiros antes de excluir
    const [accountCount, categoryCount, transactionCount] = await Promise.all([
      prisma.financialAccount.count({ where: { companyId: id } }),
      prisma.financialCategory.count({ where: { companyId: id } }),
      prisma.financialTransaction.count({ where: { companyId: id } })
    ]);

    if (accountCount > 0 || categoryCount > 0 || transactionCount > 0) {
      throw new Error(
        `Cannot delete company: it has ${accountCount} accounts, ${categoryCount} categories, and ${transactionCount} transactions. Please delete financial data first.`
      );
    }

    await prisma.company.delete({ where: { id } });
  }
}