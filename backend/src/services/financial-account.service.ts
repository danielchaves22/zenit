import { PrismaClient, FinancialAccount, Prisma, AccountType } from '@prisma/client';
import { logger } from '../utils/logger';

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
    companyId: number;
  }): Promise<FinancialAccount> {
    const { name, type, initialBalance = 0, accountNumber, bankName, companyId } = data;

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

    return prisma.financialAccount.create({
      data: {
        name,
        type,
        balance: initialBalance,
        accountNumber,
        bankName,
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
    }>
  ): Promise<FinancialAccount> {
    // Não permitimos atualização direta do saldo para manter integridade
    const { name, type, accountNumber, bankName, isActive } = data;

    // Verificamos se a conta existe
    const account = await prisma.financialAccount.findUnique({
      where: { id }
    });

    if (!account) {
      throw new Error(`Conta financeira ID ${id} não encontrada`);
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

    return prisma.financialAccount.update({
      where: { id },
      data: {
        name,
        type,
        accountNumber,
        bankName,
        isActive
      }
    });
  }

  /**
   * Lista contas financeiras de uma empresa com filtros opcionais
   */
  static async listAccounts(params: {
    companyId: number;
    type?: AccountType;
    isActive?: boolean;
    search?: string;
  }): Promise<FinancialAccount[]> {
    const { companyId, type, isActive, search } = params;

    const where: Prisma.FinancialAccountWhereInput = {
      companyId,
      ...(type && { type }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { bankName: { contains: search, mode: 'insensitive' } }
        ]
      })
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
    return prisma.financialAccount.findUnique({
      where: { id }
    });
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
}
