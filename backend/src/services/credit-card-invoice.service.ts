import {
  CreditCardInvoiceStatus,
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import { CreditCardInvoiceSettlementType } from '@prisma/client';
import FinancialTransactionService from './financial-transaction.service';
import { getDerivedInvoiceStatus, resolveCreditCardInvoiceStatus } from '../utils/credit-card';

const prisma = new PrismaClient();

function formatInvoiceLabel(referenceMonth: number, referenceYear: number) {
  return `${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
}

function normalizeMoney(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function resolveTransferSettledAt(invoice: {
  dueDate: Date;
  settledAt?: Date | null;
  paymentTransaction?: {
    effectiveDate?: Date | null;
    date?: Date | null;
  } | null;
}) {
  return (
    invoice.paymentTransaction?.effectiveDate ||
    invoice.paymentTransaction?.date ||
    invoice.settledAt ||
    invoice.dueDate
  );
}

export default class CreditCardInvoiceService {
  private static async syncInvoice(invoiceId: number) {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentTransaction: {
          select: {
            id: true,
            status: true,
            effectiveDate: true,
            date: true
          }
        }
      }
    });

    if (!invoice) {
      return null;
    }

    const [aggregate, externalSettlementCount] = await Promise.all([
      prisma.financialTransaction.aggregate({
        where: {
          creditCardInvoiceId: invoiceId,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED
        },
        _sum: {
          amount: true
        }
      }),
      prisma.financialTransaction.count({
        where: {
          creditCardInvoiceId: invoiceId,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          isExternalCreditCardSettlement: true
        }
      })
    ]);

    const totalAmount = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const hasCompletedPayment = invoice.paymentTransaction?.status === TransactionStatus.COMPLETED;
    const paymentTransactionId = hasCompletedPayment ? invoice.paymentTransactionId : null;
    const hasExternalSettlements = externalSettlementCount > 0;

    if (totalAmount.eq(0) && !paymentTransactionId && !hasExternalSettlements) {
      await prisma.creditCardInvoice.delete({
        where: { id: invoiceId }
      });
      return null;
    }

    const settlementType = hasCompletedPayment
      ? CreditCardInvoiceSettlementType.TRANSFER
      : hasExternalSettlements
        ? CreditCardInvoiceSettlementType.EXTERNAL
        : null;
    const settledAt = hasCompletedPayment
      ? resolveTransferSettledAt(invoice)
      : settlementType === CreditCardInvoiceSettlementType.EXTERNAL
        ? invoice.settledAt || invoice.dueDate
        : null;

    return prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount,
        paymentTransactionId,
        status: settlementType
          ? CreditCardInvoiceStatus.PAID
          : resolveCreditCardInvoiceStatus(invoice.closingDate, false),
        settlementType,
        settledAt
      },
      include: {
        account: true,
        paymentTransaction: {
          select: {
            id: true,
            description: true,
            status: true,
            effectiveDate: true,
            date: true,
            amount: true
          }
        }
      }
    });
  }

  static async syncInvoicesForAccount(accountId: number): Promise<void> {
    const invoices = await prisma.creditCardInvoice.findMany({
      where: { accountId },
      select: { id: true }
    });

    for (const invoice of invoices) {
      await this.syncInvoice(invoice.id);
    }
  }

  static async listCreditCards(params: {
    companyId: number;
    accountIds?: number[];
  }) {
    if (params.accountIds && params.accountIds.length === 0) {
      return [];
    }

    const cards = await prisma.financialAccount.findMany({
      where: {
        companyId: params.companyId,
        type: 'CREDIT_CARD',
        ...(params.accountIds && params.accountIds.length > 0
          ? { id: { in: params.accountIds } }
          : {})
      },
      orderBy: { name: 'asc' }
    });

    const result = [];

    for (const card of cards) {
      await this.syncInvoicesForAccount(card.id);

      const nextInvoice = await prisma.creditCardInvoice.findFirst({
        where: {
          accountId: card.id,
          status: {
            not: CreditCardInvoiceStatus.PAID
          }
        },
        orderBy: [
          { dueDate: 'asc' },
          { referenceYear: 'asc' },
          { referenceMonth: 'asc' }
        ]
      });

      const balance = normalizeMoney(card.balance);
      const creditLimit = normalizeMoney(card.creditLimit);
      const usedLimit = Math.abs(Math.min(balance, 0));
      const availableLimit = card.creditLimit === null
        ? null
        : creditLimit - usedLimit;

      result.push({
        ...card,
        availableLimit,
        usedLimit,
        nextInvoice: nextInvoice
          ? {
              ...nextInvoice,
              displayStatus: getDerivedInvoiceStatus(nextInvoice.status, nextInvoice.dueDate)
            }
          : null
      });
    }

    return result;
  }

  static async listInvoicesByAccount(params: {
    accountId: number;
    companyId: number;
  }) {
    await this.syncInvoicesForAccount(params.accountId);

    const invoices = await prisma.creditCardInvoice.findMany({
      where: {
        accountId: params.accountId,
        account: {
          companyId: params.companyId
        }
      },
      include: {
        paymentTransaction: {
          select: {
            id: true,
            description: true,
            status: true,
            effectiveDate: true,
            date: true,
            amount: true
          }
        },
        _count: {
          select: {
            transactions: true
          }
        }
      },
      orderBy: [
        { referenceYear: 'desc' },
        { referenceMonth: 'desc' }
      ]
    });

    const externalSettlements = invoices.length === 0
      ? []
      : await prisma.financialTransaction.groupBy({
          by: ['creditCardInvoiceId'],
          where: {
            creditCardInvoiceId: {
              in: invoices.map((invoice) => invoice.id)
            },
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            isExternalCreditCardSettlement: true
          },
          _sum: {
            amount: true
          },
          _count: {
            _all: true
          }
        });

    const externalSettlementMap = new Map(
      externalSettlements.map((item) => [
        item.creditCardInvoiceId,
        {
          amount: item._sum.amount?.toString() || '0',
          count: item._count._all
        }
      ])
    );

    return invoices.map((invoice) => ({
      ...invoice,
      displayStatus: getDerivedInvoiceStatus(invoice.status, invoice.dueDate),
      itemCount: invoice._count.transactions,
      externalSettledAmount: externalSettlementMap.get(invoice.id)?.amount || '0',
      hasExternalSettlements: (externalSettlementMap.get(invoice.id)?.count || 0) > 0
    }));
  }

  static async getInvoiceById(invoiceId: number, companyId: number) {
    const synced = await this.syncInvoice(invoiceId);
    if (!synced) {
      return null;
    }

    const invoice = await prisma.creditCardInvoice.findFirst({
      where: {
        id: invoiceId,
        account: {
          companyId
        }
      },
      include: {
        account: true,
        paymentTransaction: {
          select: {
            id: true,
            description: true,
            status: true,
            effectiveDate: true,
            date: true,
            amount: true,
            fromAccount: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        transactions: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          },
          orderBy: [
            { installmentNumber: 'asc' },
            { id: 'asc' }
          ]
        }
      }
    });

    if (!invoice) {
      return null;
    }

    const externalSettledAmount = invoice.transactions
      .filter((transaction) => transaction.isExternalCreditCardSettlement)
      .reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));

    return {
      ...invoice,
      displayStatus: getDerivedInvoiceStatus(invoice.status, invoice.dueDate),
      externalSettledAmount: externalSettledAmount.toString(),
      hasExternalSettlements: externalSettledAmount.gt(0)
    };
  }

  static async payInvoice(params: {
    invoiceId: number;
    fromAccountId: number;
    paymentDate?: Date;
    notes?: string;
    companyId: number;
    userId: number;
  }) {
    const invoice = await this.getInvoiceById(params.invoiceId, params.companyId);

    if (!invoice) {
      throw new Error('Fatura nao encontrada');
    }

    if (invoice.status === CreditCardInvoiceStatus.PAID) {
      throw new Error('Fatura ja esta paga');
    }

    if (normalizeMoney(invoice.totalAmount) <= 0) {
      throw new Error('Fatura sem saldo para pagamento');
    }

    if (params.fromAccountId === invoice.accountId) {
      throw new Error('Conta pagadora deve ser diferente do cartao de credito');
    }

    const paymentDate = params.paymentDate ?? new Date();
    const label = formatInvoiceLabel(invoice.referenceMonth, invoice.referenceYear);

    const createdPayment = await FinancialTransactionService.createTransaction({
      description: `Pagamento fatura ${invoice.account.name} ${label}`,
      amount: normalizeMoney(invoice.totalAmount),
      date: paymentDate,
      dueDate: paymentDate,
      effectiveDate: paymentDate,
      type: TransactionType.TRANSFER,
      status: TransactionStatus.COMPLETED,
      notes: params.notes || `Pagamento integral da fatura ${label}`,
      fromAccountId: params.fromAccountId,
      toAccountId: invoice.accountId,
      companyId: params.companyId,
      createdBy: params.userId
    });

    if (Array.isArray(createdPayment)) {
      throw new Error('Pagamento da fatura retornou formato inesperado');
    }

    await prisma.creditCardInvoice.update({
      where: { id: invoice.id },
      data: {
        paymentTransactionId: createdPayment.id,
        status: CreditCardInvoiceStatus.PAID,
        settlementType: CreditCardInvoiceSettlementType.TRANSFER,
        settledAt: paymentDate
      }
    });

    return this.getInvoiceById(invoice.id, params.companyId);
  }
}
