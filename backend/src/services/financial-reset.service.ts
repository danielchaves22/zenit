import {
  AccountType,
  FinancialAccountPurpose,
  Prisma,
  PrismaClient,
  RecurringFrequency,
  TransactionType
} from '@prisma/client';
import cacheService from './cache.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export type FinancialResetPreview = {
  preserved: {
    accounts: number;
    creditCards: number;
    categories: number;
    fixedTemplates: number;
  };
  deleted: {
    transactions: number;
    creditCardPurchases: number;
    creditCardInvoices: number;
    fixedOccurrences: number;
    invoicePayments: number;
  };
  balances: {
    accountsToZero: number;
  };
  safeguards: {
    budgetsUnaffected: true;
  };
};

export default class FinancialResetService {
  private static buildGeneralAccountWhere(
    companyId: number
  ): Prisma.FinancialAccountWhereInput {
    return {
      companyId,
      purpose: FinancialAccountPurpose.GENERAL
    };
  }

  private static buildResetTransactionWhere(
    companyId: number
  ): Prisma.FinancialTransactionWhereInput {
    return {
      companyId,
      budgetEntry: {
        is: null
      },
      AND: [
        {
          NOT: {
            fromAccount: {
              is: {
                purpose: FinancialAccountPurpose.BUDGET
              }
            }
          }
        },
        {
          NOT: {
            toAccount: {
              is: {
                purpose: FinancialAccountPurpose.BUDGET
              }
            }
          }
        }
      ]
    };
  }

  private static buildOrphanGeneralInvoiceWhere(
    companyId: number
  ): Prisma.CreditCardInvoiceWhereInput {
    return {
      account: {
        companyId,
        purpose: FinancialAccountPurpose.GENERAL
      },
      transactions: {
        none: {}
      },
      paymentTransactionId: null
    };
  }

  private static async deleteTargetTransactionTagLinksTx(
    tx: Prisma.TransactionClient,
    companyId: number
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "_FinancialTagToFinancialTransaction"
      WHERE "B" IN (
        SELECT ft.id
        FROM "FinancialTransaction" ft
        LEFT JOIN "FinancialAccount" fa_from ON fa_from.id = ft."fromAccountId"
        LEFT JOIN "FinancialAccount" fa_to ON fa_to.id = ft."toAccountId"
        LEFT JOIN "BudgetEntry" be ON be."financialTransactionId" = ft.id
        WHERE ft."companyId" = ${companyId}
          AND be.id IS NULL
          AND (fa_from.id IS NULL OR fa_from.purpose::text <> 'BUDGET')
          AND (fa_to.id IS NULL OR fa_to.purpose::text <> 'BUDGET')
      )
    `);
  }

  private static async invalidateCaches(
    companyId: number,
    accountIds: number[]
  ): Promise<void> {
    await Promise.all([
      cacheService.invalidatePattern(`dashboard:${companyId}:*`),
      cacheService.invalidatePattern(`transactions:${companyId}:*`),
      ...accountIds.map((accountId) =>
        cacheService.del(cacheService.getAccountBalanceKey(accountId))
      )
    ]);
  }

  static async getResetPreview(companyId: number): Promise<FinancialResetPreview> {
    const resetTransactionWhere = this.buildResetTransactionWhere(companyId);
    const generalAccountWhere = this.buildGeneralAccountWhere(companyId);

    const [
      accounts,
      creditCards,
      categories,
      fixedTemplates,
      transactions,
      fixedOccurrences,
      invoicePayments,
      creditCardInvoices,
      purchaseGroups
    ] = await Promise.all([
      prisma.financialAccount.count({
        where: {
          ...generalAccountWhere,
          type: {
            not: AccountType.CREDIT_CARD
          }
        }
      }),
      prisma.financialAccount.count({
        where: {
          ...generalAccountWhere,
          type: AccountType.CREDIT_CARD
        }
      }),
      prisma.financialCategory.count({
        where: { companyId }
      }),
      prisma.recurringTransaction.count({
        where: {
          companyId,
          frequency: RecurringFrequency.MONTHLY,
          type: {
            in: [TransactionType.INCOME, TransactionType.EXPENSE]
          }
        }
      }),
      prisma.financialTransaction.count({
        where: resetTransactionWhere
      }),
      prisma.financialTransaction.count({
        where: {
          ...resetTransactionWhere,
          recurringTransactionId: {
            not: null
          }
        }
      }),
      prisma.creditCardInvoice.count({
        where: {
          account: {
            companyId,
            purpose: FinancialAccountPurpose.GENERAL
          },
          paymentTransactionId: {
            not: null
          }
        }
      }),
      prisma.creditCardInvoice.count({
        where: {
          account: {
            companyId,
            purpose: FinancialAccountPurpose.GENERAL
          }
        }
      }),
      prisma.financialTransaction.groupBy({
        by: ['purchaseGroupId'],
        where: {
          ...resetTransactionWhere,
          purchaseGroupId: {
            not: null
          }
        }
      })
    ]);

    return {
      preserved: {
        accounts,
        creditCards,
        categories,
        fixedTemplates
      },
      deleted: {
        transactions,
        creditCardPurchases: purchaseGroups.length,
        creditCardInvoices,
        fixedOccurrences,
        invoicePayments
      },
      balances: {
        accountsToZero: accounts + creditCards
      },
      safeguards: {
        budgetsUnaffected: true
      }
    };
  }

  static async executeReset(params: {
    companyId: number;
    actorUserId: number;
  }): Promise<FinancialResetPreview & { executedAt: string }> {
    const { companyId, actorUserId } = params;
    const preview = await this.getResetPreview(companyId);
    const generalAccounts = await prisma.financialAccount.findMany({
      where: this.buildGeneralAccountWhere(companyId),
      select: {
        id: true
      }
    });

    await prisma.$transaction(
      async (tx) => {
        await this.deleteTargetTransactionTagLinksTx(tx, companyId);

        await tx.financialTransaction.deleteMany({
          where: this.buildResetTransactionWhere(companyId)
        });

        await tx.creditCardInvoice.deleteMany({
          where: this.buildOrphanGeneralInvoiceWhere(companyId)
        });

        await tx.financialAccount.updateMany({
          where: this.buildGeneralAccountWhere(companyId),
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

    await this.invalidateCaches(
      companyId,
      generalAccounts.map((account) => account.id)
    );

    logger.warn('Financial history reset executed', {
      actorUserId,
      companyId,
      ...preview.deleted,
      accountsToZero: preview.balances.accountsToZero
    });

    return {
      ...preview,
      executedAt: new Date().toISOString()
    };
  }
}
