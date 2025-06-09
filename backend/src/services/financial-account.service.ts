import { PrismaClient, FinancialAccount, Prisma, AccountType } from '@prisma/client';
import { logger } from '../utils/logger';
import cacheService from './cache.service';
import { parseDecimal } from '../utils/money';

const prisma = new PrismaClient();

export default class FinancialAccountService {
  /**
   * Cria uma conta financeira para uma empresa
   */
  static async createAccount(data: {
    name: string;
    type: AccountType;
    initialBalance?: string | number;
    accountNumber?: string;
    bankName?: string;
    allowNegativeBalance?: boolean; // ✅ NOVO CAMPO
    companyId: number;
  }): Promise<FinancialAccount> {
    const { 
      name, 
      type, 
      initialBalance = 0, 
      accountNumber, 
      bankName, 
      allowNegativeBalance = false, // ✅ PADRÃO FALSE
      companyId 
    } = data;

    // Verifica se já existe conta com mesmo nome na empresa
    const existingAccount = await prisma.financialAccount.findUnique({
      where: {
        name_companyId: {
          name,
          companyId
        }
      }
    });

    if (existingAccount) {
      throw new Error(`Já existe uma conta com o nome "${name}" nesta empresa`);
    }

    // ✅ REGRA DE NEGÓCIO: Cartão de crédito deve permitir negativo por padrão
    let finalAllowNegative = allowNegativeBalance;
    if (type === 'CREDIT_CARD') {
      finalAllowNegative = true;
      logger.info('Credit card account automatically set to allow negative balance', {
        accountName: name,
        companyId
      });
    }

    return prisma.financialAccount.create({
      data: {
        name,
        type,
        balance: initialBalance,
        accountNumber,
        bankName,
        allowNegativeBalance: finalAllowNegative, // ✅ NOVO CAMPO
        company: {
          connect: { id: companyId }
        }
      }
    });
  }

  /**
   * Atualiza uma conta financeira
   */
  static async updateAccount(
    id: number,
    data: Partial<{
      name: string;
      type: AccountType;
      accountNumber?: string;
      bankName?: string;
      isActive: boolean;
      allowNegativeBalance: boolean; // ✅ NOVO CAMPO
    }>
  ): Promise<FinancialAccount> {
    const { 
      name, 
      type, 
      accountNumber, 
      bankName, 
      isActive, 
      allowNegativeBalance // ✅ NOVO CAMPO
    } = data;

    // Verificamos se a conta existe
    const account = await prisma.financialAccount.findUnique({
      where: { id }
    });

    if (!account) {
      throw new Error(`Conta financeira ID ${id} não encontrada`);
    }

    // ✅ REGRA DE NEGÓCIO: Cartão de crédito não pode desabilitar saldo negativo
    if (type === 'CREDIT_CARD' && allowNegativeBalance === false) {
      throw new Error('Cartões de crédito devem permitir saldo negativo');
    }

    // ✅ VERIFICAÇÃO DE SEGURANÇA: Se desabilitando saldo negativo, verificar saldo atual
    if (allowNegativeBalance === false && account.allowNegativeBalance === true) {
      const currentBalance = parseDecimal(account.balance);
      if (currentBalance.lt(0)) {
        throw new Error(
          `Não é possível desabilitar saldo negativo. Saldo atual: ${currentBalance.toFixed(2)}. Regularize o saldo primeiro.`
        );
      }
    }

    // Verificamos unicidade do nome se estiver sendo alterado
    if (name && name !== account.name) {
      const existingAccount = await prisma.financialAccount.findUnique({
        where: {
          name_companyId: {
            name,
            companyId: account.companyId
          }
        }
      });

      if (existingAccount) {
        throw new Error(`Já existe uma conta com o nome "${name}" nesta empresa`);
      }
    }

    const updatedAccount = await prisma.financialAccount.update({
      where: { id },
      data: {
        name,
        type,
        accountNumber,
        bankName,
        isActive,
        allowNegativeBalance // ✅ NOVO CAMPO
      }
    });

    // ✅ LOG PARA AUDITORIA DE MUDANÇAS NA POLÍTICA DE SALDO
    if (allowNegativeBalance !== undefined && allowNegativeBalance !== account.allowNegativeBalance) {
      logger.info('Account negative balance policy changed', {
        accountId: id,
        accountName: account.name,
        previousPolicy: account.allowNegativeBalance,
        newPolicy: allowNegativeBalance,
        currentBalance: account.balance.toString()
      });
    }

    return updatedAccount;
  }


  /**
   * Lista contas financeiras de uma empresa com filtros opcionais
   */
  static async listAccounts(params: {
    companyId: number;
    type?: AccountType;
    isActive?: boolean;
    allowNegativeBalance?: boolean; // ✅ NOVO FILTRO
    search?: string;
    accountIds?: number[];
  }): Promise<FinancialAccount[]> {
    const { 
      companyId, 
      type, 
      isActive, 
      allowNegativeBalance, // ✅ NOVO FILTRO
      search, 
      accountIds 
    } = params;

    const where: Prisma.FinancialAccountWhereInput = {
      companyId,
      ...(type && { type }),
      ...(isActive !== undefined && { isActive }),
      ...(allowNegativeBalance !== undefined && { allowNegativeBalance }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { bankName: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(accountIds && accountIds.length > 0 && { id: { in: accountIds } })
    };

    return prisma.financialAccount.findMany({
      where,
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Obtém uma conta financeira por ID
   */
  static async getAccountById(id: number): Promise<FinancialAccount | null> {
    // CACHE: Try cache first for balance
    const cacheKey = cacheService.getAccountBalanceKey(id);
    const cached = await cacheService.get<FinancialAccount>(cacheKey);
    
    if (cached) {
      logger.debug('Account served from cache', { accountId: id });
      return cached;
    }

    const account = await prisma.financialAccount.findUnique({
      where: { id }
    });

    if (account) {
      // CACHE: Store for 5 minutes
      await cacheService.set(cacheKey, account, 300);
    }

    return account;
  }

  /**
   * Exclui uma conta financeira se não tiver transações
   */
  static async deleteAccount(id: number): Promise<void> {
    // Primeiro verifica se há transações associadas
    const transactionCount = await prisma.financialTransaction.count({
      where: {
        OR: [
          { fromAccountId: id },
          { toAccountId: id }
        ]
      }
    });

    if (transactionCount > 0) {
      throw new Error(
        `Não é possível excluir a conta pois existem ${transactionCount} transações associadas. Considere inativá-la.`
      );
    }

    await prisma.financialAccount.delete({
      where: { id }
    });
  }

  /**
   * Ajusta o saldo de uma conta (usado apenas em operações administrativas)
   * Registra uma transação de ajuste para manter auditoria
   */
  static async adjustBalance(
    accountId: number,
    newBalance: number | string,
    userId: number,
    reason: string
  ): Promise<FinancialAccount> {
    return prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.findUnique({
        where: { id: accountId }
      });

      if (!account) {
        throw new Error(`Conta financeira ID ${accountId} não encontrada`);
      }

      const currentBalance = Number(account.balance);
      const targetBalance = Number(newBalance);
      const difference = targetBalance - currentBalance;

      if (difference === 0) {
        return account; // Nenhum ajuste necessário
      }

      // Cria transação de ajuste para auditoria
      const transactionType = difference > 0 ? 'INCOME' : 'EXPENSE';
      const transactionAmount = Math.abs(difference);

      await tx.financialTransaction.create({
        data: {
          description: `Ajuste de saldo: ${reason}`,
          amount: transactionAmount,
          date: new Date(),
          type: transactionType,
          status: 'COMPLETED',
          notes: `Ajuste manual. Saldo anterior: ${currentBalance}, Novo saldo: ${targetBalance}`,
          fromAccount: transactionType === 'EXPENSE' ? { connect: { id: accountId } } : undefined,
          toAccount: transactionType === 'INCOME' ? { connect: { id: accountId } } : undefined,
          company: { connect: { id: account.companyId } },
          createdByUser: { connect: { id: userId } }
        }
      });

      // Atualiza o saldo diretamente
      const updatedAccount = await tx.financialAccount.update({
        where: { id: accountId },
        data: { balance: targetBalance }
      });

      return updatedAccount;
    });
  }

    static async toggleNegativeBalance(
    accountId: number,
    allowNegativeBalance: boolean,
    companyId: number
  ): Promise<FinancialAccount> {
    return await prisma.$transaction(async (tx) => {
      // Verificar se conta existe e pertence à empresa
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, companyId }
      });

      if (!account) {
        throw new Error('Conta não encontrada ou não pertence à empresa');
      }

      // ✅ REGRA DE NEGÓCIO: Cartão de crédito não pode desabilitar saldo negativo
      if (account.type === 'CREDIT_CARD' && allowNegativeBalance === false) {
        throw new Error('Cartões de crédito devem permitir saldo negativo');
      }

      // ✅ VERIFICAÇÃO DE SEGURANÇA: Se desabilitando saldo negativo, verificar saldo atual
      if (allowNegativeBalance === false && account.allowNegativeBalance === true) {
        const currentBalance = parseDecimal(account.balance);
        if (currentBalance.lt(0)) {
          throw new Error(
            `Não é possível desabilitar saldo negativo. Saldo atual: ${currentBalance.toFixed(2)}. Regularize o saldo primeiro.`
          );
        }
      }

      const updatedAccount = await tx.financialAccount.update({
        where: { id: accountId },
        data: { allowNegativeBalance }
      });

      // ✅ LOG PARA AUDITORIA
      logger.info('Account negative balance policy toggled', {
        accountId,
        accountName: account.name,
        previousPolicy: account.allowNegativeBalance,
        newPolicy: allowNegativeBalance,
        currentBalance: account.balance.toString(),
        companyId
      });

      return updatedAccount;
    });
  }
}
