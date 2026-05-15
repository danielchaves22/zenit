import { AccountType, FinancialAccount, Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import cacheService from './cache.service';
import BankService from './bank.service';
import { parseDecimal } from '../utils/money';

const prisma = new PrismaClient();

function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    CHECKING: 'conta corrente',
    SAVINGS: 'poupanca',
    CREDIT_CARD: 'cartao de credito',
    INVESTMENT: 'investimento',
    CASH: 'dinheiro'
  };

  return labels[type];
}

function normalizeCreditCardConfig(
  type: AccountType,
  creditLimit?: number | string | null,
  statementClosingDay?: number | null,
  statementDueDay?: number | null
) {
  if (type !== 'CREDIT_CARD') {
    return {
      creditLimit: null,
      statementClosingDay: null,
      statementDueDay: null
    };
  }

  const normalizedCreditLimit =
    creditLimit === undefined || creditLimit === null || creditLimit === ''
      ? null
      : Number(creditLimit);

  if (
    normalizedCreditLimit === null ||
    Number.isNaN(normalizedCreditLimit) ||
    normalizedCreditLimit <= 0
  ) {
    throw new Error('Cartoes de credito exigem limite maior que zero');
  }

  if (!statementClosingDay || statementClosingDay < 1 || statementClosingDay > 31) {
    throw new Error('Cartoes de credito exigem dia de fechamento entre 1 e 31');
  }

  if (!statementDueDay || statementDueDay < 1 || statementDueDay > 31) {
    throw new Error('Cartoes de credito exigem dia de vencimento entre 1 e 31');
  }

  return {
    creditLimit: parseDecimal(normalizedCreditLimit),
    statementClosingDay,
    statementDueDay
  };
}

function ensureNegativeBalancePolicy(
  currentAccount: FinancialAccount,
  nextType: AccountType,
  nextAllowNegativeBalance: boolean
) {
  if (nextType === 'CREDIT_CARD' && nextAllowNegativeBalance === false) {
    throw new Error('Cartoes de credito devem permitir saldo negativo');
  }

  if (nextAllowNegativeBalance === false && currentAccount.allowNegativeBalance === true) {
    const currentBalance = parseDecimal(currentAccount.balance);
    if (currentBalance.lt(0)) {
      throw new Error(
        `Nao e possivel desabilitar saldo negativo. Saldo atual: ${currentBalance.toFixed(2)}. Regularize o saldo primeiro.`
      );
    }
  }
}

export default class FinancialAccountService {
  static async createAccount(data: {
    name: string;
    type: AccountType;
    initialBalance?: string | number;
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    bankId?: number | null;
    allowNegativeBalance?: boolean;
    creditLimit?: number | string | null;
    cardColor?: string | null;
    statementClosingDay?: number | null;
    statementDueDay?: number | null;
    companyId: number;
  }): Promise<FinancialAccount> {
    const {
      name,
      type,
      initialBalance = 0,
      accountNumber,
      bankName,
      bankCode,
      bankId,
      allowNegativeBalance = false,
      creditLimit,
      cardColor,
      statementClosingDay,
      statementDueDay,
      companyId
    } = data;

    const existingAccount = await prisma.financialAccount.findFirst({
      where: { name, type, companyId }
    });

    if (existingAccount) {
      throw new Error(
        `Ja existe uma ${getAccountTypeLabel(type)} com o nome "${name}" nesta empresa`
      );
    }

    const finalAllowNegativeBalance = type === 'CREDIT_CARD' ? true : allowNegativeBalance;
    const creditCardConfig = normalizeCreditCardConfig(
      type,
      creditLimit,
      statementClosingDay,
      statementDueDay
    );
    const linkedBank = await BankService.resolveLinkedBank(bankId);

    return prisma.financialAccount.create({
      data: {
        name,
        type,
        balance: initialBalance,
        accountNumber,
        bankName: linkedBank.bankName ?? bankName ?? null,
        bankCode: linkedBank.bankCode ?? bankCode ?? null,
        bankId: linkedBank.bankId,
        allowNegativeBalance: finalAllowNegativeBalance,
        creditLimit: creditCardConfig.creditLimit,
        cardColor,
        statementClosingDay: creditCardConfig.statementClosingDay,
        statementDueDay: creditCardConfig.statementDueDay,
        companyId
      }
    });
  }

  static async updateAccount(
    id: number,
    data: Partial<{
      name: string;
      type: AccountType;
      accountNumber?: string | null;
      bankName?: string | null;
      bankCode?: string | null;
      bankId?: number | null;
      isActive: boolean;
      allowNegativeBalance: boolean;
      creditLimit?: number | string | null;
      cardColor?: string | null;
      statementClosingDay?: number | null;
      statementDueDay?: number | null;
    }>
  ): Promise<FinancialAccount> {
    const account = await prisma.financialAccount.findUnique({
      where: { id }
    });

    if (!account) {
      throw new Error(`Conta financeira ID ${id} nao encontrada`);
    }

    const nextType = data.type ?? account.type;
    const nextAllowNegativeBalance =
      nextType === 'CREDIT_CARD'
        ? true
        : data.allowNegativeBalance ?? account.allowNegativeBalance;

    ensureNegativeBalancePolicy(account, nextType, nextAllowNegativeBalance);

    if (
      (data.name && data.name !== account.name) ||
      (data.type && data.type !== account.type)
    ) {
      const existingAccount = await prisma.financialAccount.findFirst({
        where: {
          name: data.name ?? account.name,
          type: nextType,
          companyId: account.companyId,
          id: { not: id }
        }
      });

      if (existingAccount) {
        throw new Error(
          `Ja existe uma ${getAccountTypeLabel(nextType)} com o nome "${data.name ?? account.name}" nesta empresa`
        );
      }
    }

    const creditCardConfig = normalizeCreditCardConfig(
      nextType,
      data.creditLimit !== undefined ? data.creditLimit : account.creditLimit?.toString() ?? null,
      data.statementClosingDay !== undefined
        ? data.statementClosingDay
        : account.statementClosingDay,
      data.statementDueDay !== undefined ? data.statementDueDay : account.statementDueDay
    );
    const linkedBank =
      data.bankId !== undefined ? await BankService.resolveLinkedBank(data.bankId) : null;

    const updatedAccount = await prisma.financialAccount.update({
      where: { id },
      data: {
        name: data.name,
        type: nextType,
        accountNumber: data.accountNumber,
        bankName: data.bankId !== undefined ? linkedBank?.bankName : data.bankName,
        bankCode: data.bankId !== undefined ? linkedBank?.bankCode : data.bankCode,
        bankId: data.bankId !== undefined ? linkedBank?.bankId : undefined,
        isActive: data.isActive,
        allowNegativeBalance: nextAllowNegativeBalance,
        creditLimit: creditCardConfig.creditLimit,
        cardColor: data.cardColor,
        statementClosingDay: creditCardConfig.statementClosingDay,
        statementDueDay: creditCardConfig.statementDueDay
      }
    });

    if (nextAllowNegativeBalance !== account.allowNegativeBalance) {
      logger.info('Account negative balance policy changed', {
        accountId: id,
        accountName: account.name,
        previousPolicy: account.allowNegativeBalance,
        newPolicy: nextAllowNegativeBalance,
        currentBalance: account.balance.toString()
      });
    }

    return updatedAccount;
  }

  static async listAccounts(params: {
    companyId: number;
    type?: AccountType;
    isActive?: boolean;
    allowNegativeBalance?: boolean;
    search?: string;
    accountIds?: number[];
  }): Promise<FinancialAccount[]> {
    const { companyId, type, isActive, allowNegativeBalance, search, accountIds } = params;

    if (accountIds && accountIds.length === 0) {
      return [];
    }

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
      orderBy: [{ name: 'asc' }, { type: 'asc' }]
    });
  }

  static async getAccountById(id: number): Promise<FinancialAccount | null> {
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
      await cacheService.set(cacheKey, account, 300);
    }

    return account;
  }

  static async deleteAccount(id: number): Promise<void> {
    const transactionCount = await prisma.financialTransaction.count({
      where: {
        OR: [{ fromAccountId: id }, { toAccountId: id }]
      }
    });

    if (transactionCount > 0) {
      throw new Error(
        `Nao e possivel excluir a conta pois existem ${transactionCount} transacoes associadas. Considere inativa-la.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.recurringTransaction.updateMany({
        where: { fromAccountId: id },
        data: { fromAccountId: null }
      });

      await tx.recurringTransaction.updateMany({
        where: { toAccountId: id },
        data: { toAccountId: null }
      });

      await tx.financialAccount.delete({
        where: { id }
      });
    });
  }

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
        throw new Error(`Conta financeira ID ${accountId} nao encontrada`);
      }

      const currentBalance = Number(account.balance);
      const targetBalance = Number(newBalance);
      const difference = targetBalance - currentBalance;

      if (difference === 0) {
        return account;
      }

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
          fromAccount:
            transactionType === 'EXPENSE' ? { connect: { id: accountId } } : undefined,
          toAccount:
            transactionType === 'INCOME' ? { connect: { id: accountId } } : undefined,
          company: { connect: { id: account.companyId } },
          createdByUser: { connect: { id: userId } }
        }
      });

      return tx.financialAccount.update({
        where: { id: accountId },
        data: { balance: targetBalance }
      });
    });
  }

  static async toggleNegativeBalance(
    accountId: number,
    allowNegativeBalance: boolean,
    companyId: number
  ): Promise<FinancialAccount> {
    return prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, companyId }
      });

      if (!account) {
        throw new Error('Conta nao encontrada ou nao pertence a empresa');
      }

      ensureNegativeBalancePolicy(account, account.type, allowNegativeBalance);

      const updatedAccount = await tx.financialAccount.update({
        where: { id: accountId },
        data: { allowNegativeBalance }
      });

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
