import {
  AccountType,
  FinancialAccountPurpose,
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import cacheService from './cache.service';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';

const prisma = new PrismaClient();

type CreditCardResetTarget = {
  id: number;
  name: string;
  balance: Prisma.Decimal;
  creditLimit: Prisma.Decimal | null;
};

type CreditCardResetTransaction = {
  id: number;
  amount: Prisma.Decimal;
  type: TransactionType;
  status: TransactionStatus;
  fromAccountId: number | null;
  toAccountId: number | null;
  recurringTransactionId: number | null;
  purchaseGroupId: string | null;
  isExternalCreditCardSettlement: boolean;
};

export type CreditCardResetPreview = {
  card: {
    id: number;
    name: string;
    currentBalance: string;
    creditLimit: string | null;
  };
  preserved: {
    cardMetadata: true;
  };
  deleted: {
    transactions: number;
    creditCardPurchases: number;
    creditCardInvoices: number;
    fixedTemplates: number;
    fixedOccurrences: number;
    invoicePayments: number;
  };
  balances: {
    affectedAccounts: number;
    cardBalanceAfterReset: '0.00';
  };
  safeguards: {
    affectsOnlySelectedCard: true;
    budgetsUnaffected: true;
  };
};

export default class CreditCardResetService {
  private static async getResetTarget(
    companyId: number,
    accountId: number
  ): Promise<CreditCardResetTarget> {
    const card = await prisma.financialAccount.findFirst({
      where: {
        id: accountId,
        companyId,
        purpose: FinancialAccountPurpose.GENERAL
      },
      select: {
        id: true,
        name: true,
        type: true,
        balance: true,
        creditLimit: true
      }
    });

    if (!card) {
      throw new Error('Cartao nao encontrado para a empresa atual');
    }

    if (card.type !== AccountType.CREDIT_CARD) {
      throw new Error('A conta selecionada nao e um cartao de credito');
    }

    return {
      id: card.id,
      name: card.name,
      balance: card.balance,
      creditLimit: card.creditLimit
    };
  }

  private static async listTargetRecurringTemplateIds(
    client: PrismaClient | Prisma.TransactionClient,
    companyId: number,
    accountId: number
  ): Promise<number[]> {
    const templates = await client.recurringTransaction.findMany({
      where: {
        companyId,
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }]
      },
      select: {
        id: true
      }
    });

    return templates.map((template) => template.id);
  }

  private static buildTargetTransactionWhere(params: {
    companyId: number;
    accountId: number;
    recurringTemplateIds: number[];
  }): Prisma.FinancialTransactionWhereInput {
    const { companyId, accountId, recurringTemplateIds } = params;
    const orFilters: Prisma.FinancialTransactionWhereInput[] = [
      { fromAccountId: accountId },
      { toAccountId: accountId }
    ];

    if (recurringTemplateIds.length > 0) {
      orFilters.push({
        recurringTransactionId: {
          in: recurringTemplateIds
        }
      });
    }

    return {
      companyId,
      budgetEntry: {
        is: null
      },
      OR: orFilters
    };
  }

  private static async listTargetTransactions(
    client: PrismaClient | Prisma.TransactionClient,
    companyId: number,
    accountId: number,
    recurringTemplateIds: number[]
  ): Promise<CreditCardResetTransaction[]> {
    return client.financialTransaction.findMany({
      where: this.buildTargetTransactionWhere({
        companyId,
        accountId,
        recurringTemplateIds
      }),
      select: {
        id: true,
        amount: true,
        type: true,
        status: true,
        fromAccountId: true,
        toAccountId: true,
        recurringTransactionId: true,
        purchaseGroupId: true,
        isExternalCreditCardSettlement: true
      }
    });
  }

  private static countCreditCardPurchases(
    accountId: number,
    transactions: CreditCardResetTransaction[]
  ): number {
    const groupedPurchaseIds = new Set<string>();
    let legacySinglePurchases = 0;

    for (const transaction of transactions) {
      if (
        transaction.type !== TransactionType.EXPENSE ||
        transaction.fromAccountId !== accountId
      ) {
        continue;
      }

      if (transaction.purchaseGroupId) {
        groupedPurchaseIds.add(transaction.purchaseGroupId);
        continue;
      }

      legacySinglePurchases += 1;
    }

    return groupedPurchaseIds.size + legacySinglePurchases;
  }

  private static addBalanceDelta(
    deltas: Map<number, Prisma.Decimal>,
    accountId: number | null,
    delta: Prisma.Decimal
  ): void {
    if (!accountId || delta.eq(0)) {
      return;
    }

    const current = deltas.get(accountId) ?? new Prisma.Decimal(0);
    deltas.set(accountId, current.plus(delta));
  }

  private static buildNonCardBalanceReversalMap(
    accountId: number,
    transactions: CreditCardResetTransaction[]
  ): Map<number, Prisma.Decimal> {
    const deltas = new Map<number, Prisma.Decimal>();

    for (const transaction of transactions) {
      if (
        transaction.status !== TransactionStatus.COMPLETED ||
        transaction.isExternalCreditCardSettlement
      ) {
        continue;
      }

      const amount = parseDecimal(transaction.amount);

      if (transaction.type === TransactionType.INCOME) {
        if (transaction.toAccountId !== accountId) {
          this.addBalanceDelta(deltas, transaction.toAccountId, amount.negated());
        }
        continue;
      }

      if (transaction.type === TransactionType.EXPENSE) {
        if (transaction.fromAccountId !== accountId) {
          this.addBalanceDelta(deltas, transaction.fromAccountId, amount);
        }
        continue;
      }

      if (transaction.type === TransactionType.TRANSFER) {
        if (transaction.fromAccountId !== accountId) {
          this.addBalanceDelta(deltas, transaction.fromAccountId, amount);
        }

        if (transaction.toAccountId !== accountId) {
          this.addBalanceDelta(deltas, transaction.toAccountId, amount.negated());
        }
      }
    }

    return deltas;
  }

  private static async deleteTransactionTagLinksTx(
    tx: Prisma.TransactionClient,
    transactionIds: number[]
  ): Promise<void> {
    if (transactionIds.length === 0) {
      return;
    }

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "_FinancialTagToFinancialTransaction"
      WHERE "B" IN (${Prisma.join(transactionIds)})
    `);
  }

  private static async applyBalanceReversalsTx(
    tx: Prisma.TransactionClient,
    deltas: Map<number, Prisma.Decimal>
  ): Promise<void> {
    for (const [accountId, delta] of deltas.entries()) {
      if (delta.eq(0)) {
        continue;
      }

      await tx.$executeRaw`
        UPDATE "FinancialAccount"
        SET balance = balance + ${delta}, "updatedAt" = NOW()
        WHERE id = ${accountId}
      `;
    }
  }

  private static async invalidateCaches(
    companyId: number,
    accountIds: number[]
  ): Promise<void> {
    const uniqueAccountIds = Array.from(new Set(accountIds));

    await Promise.all([
      cacheService.invalidatePattern(`dashboard:${companyId}:*`),
      cacheService.invalidatePattern(`transactions:${companyId}:*`),
      ...uniqueAccountIds.map((accountId) =>
        cacheService.del(cacheService.getAccountBalanceKey(accountId))
      )
    ]);
  }

  static async getResetPreview(
    companyId: number,
    accountId: number
  ): Promise<CreditCardResetPreview> {
    const card = await this.getResetTarget(companyId, accountId);
    const recurringTemplateIds = await this.listTargetRecurringTemplateIds(
      prisma,
      companyId,
      accountId
    );
    const transactions = await this.listTargetTransactions(
      prisma,
      companyId,
      accountId,
      recurringTemplateIds
    );

    const [creditCardInvoices, invoicePayments] = await Promise.all([
      prisma.creditCardInvoice.count({
        where: {
          accountId
        }
      }),
      prisma.creditCardInvoice.count({
        where: {
          accountId,
          paymentTransactionId: {
            not: null
          }
        }
      })
    ]);

    const nonCardBalanceReversals = this.buildNonCardBalanceReversalMap(accountId, transactions);
    const fixedOccurrences = transactions.filter(
      (transaction) => transaction.recurringTransactionId !== null
    ).length;

    return {
      card: {
        id: card.id,
        name: card.name,
        currentBalance: card.balance.toString(),
        creditLimit: card.creditLimit?.toString() ?? null
      },
      preserved: {
        cardMetadata: true
      },
      deleted: {
        transactions: transactions.length,
        creditCardPurchases: this.countCreditCardPurchases(accountId, transactions),
        creditCardInvoices,
        fixedTemplates: recurringTemplateIds.length,
        fixedOccurrences,
        invoicePayments
      },
      balances: {
        affectedAccounts: nonCardBalanceReversals.size,
        cardBalanceAfterReset: '0.00'
      },
      safeguards: {
        affectsOnlySelectedCard: true,
        budgetsUnaffected: true
      }
    };
  }

  static async executeReset(params: {
    companyId: number;
    accountId: number;
    actorUserId: number;
  }): Promise<CreditCardResetPreview & { executedAt: string }> {
    const { companyId, accountId, actorUserId } = params;
    const preview = await this.getResetPreview(companyId, accountId);
    let affectedAccountIds: number[] = [];

    await prisma.$transaction(
      async (tx) => {
        const recurringTemplateIds = await this.listTargetRecurringTemplateIds(
          tx,
          companyId,
          accountId
        );
        const transactions = await this.listTargetTransactions(
          tx,
          companyId,
          accountId,
          recurringTemplateIds
        );
        const nonCardBalanceReversals = this.buildNonCardBalanceReversalMap(
          accountId,
          transactions
        );
        affectedAccountIds = Array.from(nonCardBalanceReversals.keys());
        const transactionIds = transactions.map((transaction) => transaction.id);

        await this.deleteTransactionTagLinksTx(tx, transactionIds);

        if (transactionIds.length > 0) {
          await tx.financialTransaction.deleteMany({
            where: {
              id: {
                in: transactionIds
              }
            }
          });
        }

        if (recurringTemplateIds.length > 0) {
          await tx.recurringTransaction.deleteMany({
            where: {
              id: {
                in: recurringTemplateIds
              }
            }
          });
        }

        await tx.creditCardInvoice.deleteMany({
          where: {
            accountId
          }
        });

        await this.applyBalanceReversalsTx(tx, nonCardBalanceReversals);

        await tx.financialAccount.update({
          where: {
            id: accountId
          },
          data: {
            balance: new Prisma.Decimal(0),
            updatedAt: new Date()
          }
        });
      },
      {
        timeout: 30000
      }
    );

    await this.invalidateCaches(companyId, [accountId, ...affectedAccountIds]);

    logger.warn('Credit card financial history reset executed', {
      actorUserId,
      companyId,
      accountId,
      deletedTransactions: preview.deleted.transactions,
      deletedCreditCardPurchases: preview.deleted.creditCardPurchases,
      deletedCreditCardInvoices: preview.deleted.creditCardInvoices,
      deletedFixedTemplates: preview.deleted.fixedTemplates,
      deletedFixedOccurrences: preview.deleted.fixedOccurrences,
      affectedAccounts: preview.balances.affectedAccounts
    });

    return {
      ...preview,
      executedAt: new Date().toISOString()
    };
  }
}
