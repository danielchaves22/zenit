// backend/src/services/user-financial-account-access.service.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export default class UserFinancialAccountAccessService {
  
  /**
   * Verifica se um usuário tem acesso a uma conta específica
   * ADMIN e SUPERUSER sempre têm acesso total
   */
  static async checkUserAccountAccess(
    userId: number, 
    accountId: number, 
    userRole: string,
    companyId: number
  ): Promise<boolean> {
    // ADMIN e SUPERUSER têm acesso total
    if (userRole === 'ADMIN' || userRole === 'SUPERUSER') {
      return true;
    }

    // Verificar se a conta pertence à empresa do usuário
    const account = await prisma.financialAccount.findFirst({
      where: { id: accountId, companyId }
    });

    if (!account) {
      return false;
    }

    // Para USERs, verificar permissão específica
    const access = await prisma.userFinancialAccountAccess.findUnique({
      where: {
        unique_user_account_access: {
          userId,
          financialAccountId: accountId
        }
      }
    });

    return !!access;
  }

  /**
   * Obtém todas as contas que um usuário pode acessar
   */
  static async getUserAccessibleAccounts(
    userId: number, 
    userRole: string, 
    companyId: number
  ): Promise<number[]> {
    // ADMIN e SUPERUSER veem todas as contas da empresa
    if (userRole === 'ADMIN' || userRole === 'SUPERUSER') {
      const allAccounts = await prisma.financialAccount.findMany({
        where: { companyId },
        select: { id: true }
      });
      return allAccounts.map(account => account.id);
    }

    // USERs veem apenas contas com permissão explícita
    const accessibleAccounts = await prisma.userFinancialAccountAccess.findMany({
      where: { 
        userId,
        companyId
      },
      select: { financialAccountId: true }
    });

    return accessibleAccounts.map(access => access.financialAccountId);
  }

  /**
   * Concede acesso a uma ou múltiplas contas para um usuário
   */
  static async grantAccess(data: {
    userId: number;
    accountIds: number[];
    companyId: number;
    grantedBy: number;
  }): Promise<void> {
    const { userId, accountIds, companyId, grantedBy } = data;

    // Verificar se o usuário pertence à empresa
    const userBelongsToCompany = await prisma.userCompany.findFirst({
      where: { userId, companyId }
    });

    if (!userBelongsToCompany) {
      throw new Error('Usuário não pertence a esta empresa');
    }

    // Verificar se todas as contas pertencem à empresa
    const accountsCount = await prisma.financialAccount.count({
      where: { 
        id: { in: accountIds }, 
        companyId 
      }
    });

    if (accountsCount !== accountIds.length) {
      throw new Error('Uma ou mais contas não pertencem a esta empresa');
    }

    // Conceder acessos (usar createMany com skipDuplicates)
    await prisma.userFinancialAccountAccess.createMany({
      data: accountIds.map(accountId => ({
        userId,
        financialAccountId: accountId,
        companyId,
        grantedBy
      })),
      skipDuplicates: true
    });

    logger.info('Financial account access granted', {
      userId,
      accountIds,
      companyId,
      grantedBy,
      count: accountIds.length
    });
  }

  /**
   * Revoga acesso a uma ou múltiplas contas para um usuário
   */
  static async revokeAccess(data: {
    userId: number;
    accountIds: number[];
    companyId: number;
  }): Promise<void> {
    const { userId, accountIds, companyId } = data;

    await prisma.userFinancialAccountAccess.deleteMany({
      where: {
        userId,
        financialAccountId: { in: accountIds },
        companyId
      }
    });

    logger.info('Financial account access revoked', {
      userId,
      accountIds,
      companyId,
      count: accountIds.length
    });
  }

  /**
   * Revoga TODOS os acessos de um usuário na empresa
   */
  static async revokeAllAccess(userId: number, companyId: number): Promise<void> {
    await prisma.userFinancialAccountAccess.deleteMany({
      where: { userId, companyId }
    });

    logger.info('All financial account access revoked', { userId, companyId });
  }

  /**
   * Concede acesso a TODAS as contas da empresa para um usuário
   */
  static async grantAllAccess(data: {
    userId: number;
    companyId: number;
    grantedBy: number;
  }): Promise<void> {
    const { userId, companyId, grantedBy } = data;

    // Obter todas as contas da empresa
    const allAccounts = await prisma.financialAccount.findMany({
      where: { companyId, isActive: true },
      select: { id: true }
    });

    const accountIds = allAccounts.map(account => account.id);

    if (accountIds.length > 0) {
      await this.grantAccess({ userId, accountIds, companyId, grantedBy });
    }
  }

  /**
   * Obtém resumo dos acessos de um usuário
   */
  static async getUserAccessSummary(userId: number, companyId: number): Promise<{
    totalAccounts: number;
    accessibleAccounts: number;
    hasFullAccess: boolean;
    accounts: Array<{
      id: number;
      name: string;
      type: string;
      hasAccess: boolean;
      grantedAt?: Date;
      grantedBy?: { id: number; name: string };
    }>;
  }> {
    // Obter todas as contas da empresa
    const allAccounts = await prisma.financialAccount.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' }
    });

    // Obter acessos do usuário
    const userAccess = await prisma.userFinancialAccountAccess.findMany({
      where: { userId, companyId },
      include: {
        grantedByUser: { select: { id: true, name: true } }
      }
    });

    const accessMap = new Map(
      userAccess.map(access => [
        access.financialAccountId, 
        { grantedAt: access.grantedAt, grantedBy: access.grantedByUser }
      ])
    );

    const accounts = allAccounts.map(account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      hasAccess: accessMap.has(account.id),
      grantedAt: accessMap.get(account.id)?.grantedAt,
      grantedBy: accessMap.get(account.id)?.grantedBy
    }));

    const accessibleAccounts = accounts.filter(account => account.hasAccess).length;
    const totalAccounts = allAccounts.length;
    const hasFullAccess = accessibleAccounts === totalAccounts;

    return {
      totalAccounts,
      accessibleAccounts,
      hasFullAccess,
      accounts
    };
  }

  /**
   * Filtro de transações baseado em permissões de conta
   */
  static async getAccessibleTransactionFilter(
    userId: number,
    userRole: string,
    companyId: number
  ): Promise<any> {
    const accessibleAccountIds = await this.getUserAccessibleAccounts(userId, userRole, companyId);

    // Se não tem acesso a nenhuma conta, retorna filtro impossível
    if (accessibleAccountIds.length === 0) {
      return { id: -1 }; // Filtro que nunca vai retornar resultados
    }

    // Filtro para transações que envolvem contas acessíveis
    return {
      OR: [
        { fromAccountId: { in: accessibleAccountIds } },
        { toAccountId: { in: accessibleAccountIds } }
      ]
    };
  }
}