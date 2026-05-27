import { AppKey, Company, Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import FinancialStructureService from './financial-structure.service';
import AppAccessService from './app-access.service';

const prisma = new PrismaClient();

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

type FinancialStructurePayload = {
  account: any;
  expenseCategory: any;
  incomeCategory: any;
};

type CreateCompanyResult = {
  company: Company;
  financialStructure?: FinancialStructurePayload;
};

const DEFAULT_COMPANY_ENTITLEMENTS = [
  { appKey: AppKey.ZENIT_CASH, enabled: true },
  { appKey: AppKey.ZENIT_CALC, enabled: true },
  { appKey: AppKey.ZENIT_ADMIN, enabled: true }
] as const;

const MAX_CREATE_COMPANY_ATTEMPTS = 5;

export default class CompanyService {
  static async nextCode(db: PrismaExecutor = prisma): Promise<number> {
    const agg = await db.company.aggregate({
      _max: { code: true }
    });

    const max = agg._max.code ?? -1;
    return max + 1;
  }

  private static isCompanyCodeConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.some((entry) => String(entry).includes('code'));
    }

    return String(target ?? '').includes('code');
  }

  static async createCompany(data: {
    name: string;
    address?: string;
    createFinancialStructure?: boolean;
  }): Promise<CreateCompanyResult> {
    const { name, address, createFinancialStructure = true } = data;

    logger.info('Creating new company', { name, createFinancialStructure });

    for (let attempt = 1; attempt <= MAX_CREATE_COMPANY_ATTEMPTS; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          const company = await tx.company.create({
            data: { name, address, code }
          });

          await AppAccessService.setCompanyEntitlements(
            company.id,
            [...DEFAULT_COMPANY_ENTITLEMENTS],
            tx
          );

          let financialStructure: FinancialStructurePayload | undefined;

          if (createFinancialStructure) {
            const structureResult = await FinancialStructureService.ensureFinancialStructure(
              company.id,
              tx
            );

            financialStructure = structureResult.structure;
          }

          logger.info('Company created successfully', {
            companyId: company.id,
            name: company.name,
            code: company.code,
            createFinancialStructure
          });

          return {
            company,
            financialStructure
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (this.isCompanyCodeConflict(error) && attempt < MAX_CREATE_COMPANY_ATTEMPTS) {
          logger.warn('Company code conflict detected, retrying createCompany', {
            name,
            attempt
          });
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to create company after retrying code generation');
  }

  static async createFinancialStructureForExistingCompany(companyId: number): Promise<{
    created: boolean;
    structure?: {
      account: any;
      expenseCategory: any;
      incomeCategory: any;
    };
  }> {
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      throw new Error(`Company with ID ${companyId} not found`);
    }

    return FinancialStructureService.ensureFinancialStructure(companyId);
  }

  static async listCompanies(): Promise<Company[]> {
    return prisma.company.findMany({
      orderBy: { code: 'asc' }
    });
  }

  static async listUserCompanies(userId: number): Promise<Company[]> {
    return prisma.company.findMany({
      where: {
        users: {
          some: {
            userId
          }
        }
      },
      orderBy: { code: 'asc' }
    });
  }

  static async updateCompany(
    id: number,
    data: Partial<Prisma.CompanyUpdateInput>
  ): Promise<Company> {
    return prisma.company.update({ where: { id }, data });
  }

  static async deleteCompany(id: number): Promise<void> {
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
