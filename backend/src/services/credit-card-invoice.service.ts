import {
  CreditCardInvoiceStatus,
  Prisma,
  PrismaClient,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import { CreditCardInvoiceSettlementType } from '@prisma/client';
import FinancialTransactionService from './financial-transaction.service';
import FixedTransactionService, { buildOccurrenceKeyValue } from './fixed-transaction.service';
import {
  getDerivedInvoiceStatus,
  resolveCreditCardInvoiceReference,
  resolveCreditCardInvoiceStatus
} from '../utils/credit-card';
import { getBankIconPath } from '../catalogs/bank-catalog';

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

function toDecimal(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) {
    return new Prisma.Decimal(0);
  }

  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
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

function buildProjectionKey(referenceYear: number, referenceMonth: number) {
  return `${referenceYear}-${String(referenceMonth).padStart(2, '0')}`;
}

function parseProjectionKey(projectionKey: string) {
  const match = projectionKey.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    throw new Error('Chave de projeção de fatura inválida');
  }

  const referenceYear = Number(match[1]);
  const referenceMonth = Number(match[2]);

  if (referenceMonth < 1 || referenceMonth > 12) {
    throw new Error('Chave de projeção de fatura inválida');
  }

  return { referenceYear, referenceMonth };
}

function buildProjectionWindow(now: Date = new Date()) {
  return Array.from({ length: 10 }, (_, index) => {
    const referenceBase = new Date(now.getFullYear(), now.getMonth() + index, 1, 12, 0, 0, 0);

    return {
      referenceYear: referenceBase.getFullYear(),
      referenceMonth: referenceBase.getMonth() + 1,
      projectionKey: buildProjectionKey(referenceBase.getFullYear(), referenceBase.getMonth() + 1)
    };
  });
}

function isProjectionInWindow(referenceYear: number, referenceMonth: number, now: Date = new Date()) {
  return buildProjectionWindow(now).some(
    (entry) => entry.referenceYear === referenceYear && entry.referenceMonth === referenceMonth
  );
}

type CardAccountWithConfig = {
  id: number;
  name: string;
  type: string;
  balance: Prisma.Decimal;
  bankName: string | null;
  bankCode: string | null;
  bankId: number | null;
  accountNumber: string | null;
  creditLimit: Prisma.Decimal | null;
  cardColor: string | null;
  statementClosingDay: number | null;
  statementDueDay: number | null;
};

type ProjectedFixedInvoiceTransaction = {
  id: null;
  description: string;
  amount: string;
  installmentNumber: null;
  totalInstallments: null;
  dueDate: string;
  date: string;
  effectiveDate: null;
  isExternalCreditCardSettlement: false;
  isProjected: true;
  isFixedProjection: true;
  fixedTemplateId: number;
  occurrenceKey: string;
  category: {
    id: number;
    name: string;
    color: string;
  } | null;
};

type InvoiceProjectionBucket = {
  referenceYear: number;
  referenceMonth: number;
  projectionKey: string;
  closingDate: Date;
  dueDate: Date;
  projectedTransactions: ProjectedFixedInvoiceTransaction[];
};

function sumProjectedTransactionAmounts(
  projectedTransactions: Array<{ amount: Prisma.Decimal | number | string | null | undefined }>
) {
  return projectedTransactions.reduce(
    (sum, transaction) => sum.plus(toDecimal(transaction.amount)),
    new Prisma.Decimal(0)
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

  private static async getCardAccount(accountId: number, companyId: number): Promise<CardAccountWithConfig | null> {
    return prisma.financialAccount.findFirst({
      where: {
        id: accountId,
        companyId,
        type: 'CREDIT_CARD'
      },
      select: {
        id: true,
        name: true,
        type: true,
        balance: true,
        bankName: true,
        bankCode: true,
        bankId: true,
        accountNumber: true,
        creditLimit: true,
        cardColor: true,
        statementClosingDay: true,
        statementDueDay: true
      }
    });
  }

  private static buildInvoiceBucketForMonth(
    account: CardAccountWithConfig,
    referenceYear: number,
    referenceMonth: number
  ): InvoiceProjectionBucket {
    if (!account.statementClosingDay || !account.statementDueDay) {
      throw new Error('Cartão de crédito sem fechamento e vencimento configurados');
    }

    const occurrenceDate = new Date(
      referenceYear,
      referenceMonth - 1,
      1,
      12,
      0,
      0,
      0
    );
    occurrenceDate.setDate(
      Math.min(
        account.statementClosingDay,
        new Date(referenceYear, referenceMonth, 0).getDate()
      )
    );

    const reference = resolveCreditCardInvoiceReference(
      occurrenceDate,
      account.statementClosingDay,
      account.statementDueDay
    );

    return {
      referenceYear,
      referenceMonth,
      projectionKey: buildProjectionKey(referenceYear, referenceMonth),
      closingDate: reference.closingDate,
      dueDate: reference.dueDate,
      projectedTransactions: []
    };
  }

  private static async buildProjectedInvoiceBuckets(params: {
    account: CardAccountWithConfig;
    companyId: number;
    now?: Date;
  }): Promise<Map<string, InvoiceProjectionBucket>> {
    const { account, companyId, now = new Date() } = params;
    const window = buildProjectionWindow(now);
    const firstWindowMonth = window[0];
    const lastWindowMonth = window[window.length - 1];
    const rangeStart = new Date(firstWindowMonth.referenceYear, firstWindowMonth.referenceMonth - 1, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(lastWindowMonth.referenceYear, lastWindowMonth.referenceMonth, 0, 23, 59, 59, 999);

    const buckets = new Map<string, InvoiceProjectionBucket>(
      window.map((entry) => [
        entry.projectionKey,
        this.buildInvoiceBucketForMonth(account, entry.referenceYear, entry.referenceMonth)
      ])
    );

    const templates = await prisma.recurringTransaction.findMany({
      where: {
        companyId,
        isActive: true,
        frequency: RecurringFrequency.MONTHLY,
        type: TransactionType.EXPENSE,
        fromAccountId: account.id,
        startDate: { lte: rangeEnd },
        OR: [{ endDate: null }, { endDate: { gte: rangeStart } }]
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });

    if (templates.length === 0) {
      return buckets;
    }

    const projectedCandidates = templates.flatMap((template) => {
      return window.flatMap((entry) => {
        const occurrenceDate = FixedTransactionService.buildVirtualDateForMonth(
          template,
          entry.referenceYear,
          entry.referenceMonth - 1
        );

        if (template.startDate > occurrenceDate || (template.endDate && template.endDate < occurrenceDate)) {
          return [];
        }

        return [{
          template,
          occurrenceDate,
          projectionKey: entry.projectionKey,
          occurrenceKey: buildOccurrenceKeyValue(template.id, occurrenceDate)
        }];
      });
    });

    if (projectedCandidates.length === 0) {
      return buckets;
    }

    const existingOccurrences = await prisma.financialTransaction.findMany({
      where: {
        companyId,
        occurrenceKey: {
          in: projectedCandidates.map((candidate) => candidate.occurrenceKey)
        }
      },
      select: {
        occurrenceKey: true
      }
    });

    const existingOccurrenceKeys = new Set(
      existingOccurrences
        .map((transaction) => transaction.occurrenceKey)
        .filter((occurrenceKey): occurrenceKey is string => Boolean(occurrenceKey))
    );

    for (const candidate of projectedCandidates) {
      if (existingOccurrenceKeys.has(candidate.occurrenceKey)) {
        continue;
      }

      if (!FixedTransactionService.isCreditCardFixedExpenseTemplate(candidate.template)) {
        continue;
      }

      const bucket = buckets.get(candidate.projectionKey);
      if (!bucket) {
        continue;
      }

      bucket.projectedTransactions.push({
        id: null,
        description: candidate.template.description,
        amount: candidate.template.amount.toString(),
        installmentNumber: null,
        totalInstallments: null,
        dueDate: bucket.dueDate.toISOString(),
        date: candidate.occurrenceDate.toISOString(),
        effectiveDate: null,
        isExternalCreditCardSettlement: false,
        isProjected: true,
        isFixedProjection: true,
        fixedTemplateId: candidate.template.id,
        occurrenceKey: candidate.occurrenceKey,
        category: candidate.template.category
          ? {
              id: candidate.template.category.id,
              name: candidate.template.category.name,
              color: candidate.template.category.color
            }
          : null
      });
    }

    for (const bucket of buckets.values()) {
      bucket.projectedTransactions.sort((left, right) =>
        left.description.localeCompare(right.description, 'pt-BR')
      );
    }

    return buckets;
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
      include: {
        bank: true
      },
      orderBy: { name: 'asc' }
    });

    if (cards.length === 0) {
      return [];
    }

    const cardIds = cards.map((card) => card.id);
    const nextInvoices = await prisma.creditCardInvoice.findMany({
      where: {
        accountId: {
          in: cardIds
        },
        status: {
          not: CreditCardInvoiceStatus.PAID
        }
      },
      orderBy: [
        { accountId: 'asc' },
        { dueDate: 'asc' },
        { referenceYear: 'asc' },
        { referenceMonth: 'asc' }
      ]
    });
    const nextInvoiceByAccountId = new Map<number, (typeof nextInvoices)[number]>();

    for (const invoice of nextInvoices) {
      if (!nextInvoiceByAccountId.has(invoice.accountId)) {
        nextInvoiceByAccountId.set(invoice.accountId, invoice);
      }
    }

    const projectedSubtotalByInvoiceKey = new Map<string, Prisma.Decimal>();

    await Promise.all(
      cards.map(async (card) => {
        const nextInvoice = nextInvoiceByAccountId.get(card.id);
        if (!nextInvoice || !card.statementClosingDay || !card.statementDueDay) {
          return;
        }

        const projectionKey = buildProjectionKey(
          nextInvoice.referenceYear,
          nextInvoice.referenceMonth
        );
        const projectedBucket = (await this.buildProjectedInvoiceBuckets({
          account: card as CardAccountWithConfig,
          companyId: params.companyId
        })).get(projectionKey);

        if (!projectedBucket || projectedBucket.projectedTransactions.length === 0) {
          return;
        }

        projectedSubtotalByInvoiceKey.set(
          `${card.id}:${projectionKey}`,
          sumProjectedTransactionAmounts(projectedBucket.projectedTransactions)
        );
      })
    );

    const result = [];

    for (const card of cards) {
      const nextInvoice = nextInvoiceByAccountId.get(card.id) || null;
      const nextInvoiceProjectionKey = nextInvoice
        ? buildProjectionKey(nextInvoice.referenceYear, nextInvoice.referenceMonth)
        : null;
      const projectedSubtotal = nextInvoiceProjectionKey
        ? projectedSubtotalByInvoiceKey.get(`${card.id}:${nextInvoiceProjectionKey}`) ??
          new Prisma.Decimal(0)
        : new Prisma.Decimal(0);

      const balance = normalizeMoney(card.balance);
      const creditLimit = normalizeMoney(card.creditLimit);
      const usedLimit = Math.abs(Math.min(balance, 0));
      const availableLimit = card.creditLimit === null
        ? null
        : creditLimit - usedLimit;

      result.push({
        ...card,
        bank: card.bank
          ? {
              ...card.bank,
              iconPath: getBankIconPath(card.bank.iconSlug)
            }
          : null,
        availableLimit,
        usedLimit,
        nextInvoice: nextInvoice
          ? {
              ...nextInvoice,
              itemsSubtotal: nextInvoice.totalAmount.toString(),
              fixedSubtotal: projectedSubtotal.toString(),
              totalAmount: toDecimal(nextInvoice.totalAmount).plus(projectedSubtotal).toString(),
              hasProjectedTransactions: projectedSubtotal.gt(0),
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
    const card = await this.getCardAccount(params.accountId, params.companyId);
    if (!card) {
      return [];
    }

    await this.syncInvoicesForAccount(params.accountId);

    const [invoices, projectedBuckets] = await Promise.all([
      prisma.creditCardInvoice.findMany({
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
      }),
      this.buildProjectedInvoiceBuckets({
        account: card,
        companyId: params.companyId
      })
    ]);

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

    const mergedInvoices = new Map<string, any>();

    for (const invoice of invoices) {
      const projectionKey = buildProjectionKey(invoice.referenceYear, invoice.referenceMonth);
      const projectedTransactions = projectedBuckets.get(projectionKey)?.projectedTransactions ?? [];
      const fixedSubtotalValue = sumProjectedTransactionAmounts(projectedTransactions);

      mergedInvoices.set(projectionKey, {
        ...invoice,
        projectionKey,
        isProjected: false,
        hasProjectedTransactions: projectedTransactions.length > 0,
        itemsSubtotal: invoice.totalAmount.toString(),
        fixedSubtotal: fixedSubtotalValue.toString(),
        totalAmount: toDecimal(invoice.totalAmount).plus(fixedSubtotalValue).toString(),
        itemCount: invoice._count.transactions,
        fixedItemCount: projectedTransactions.length,
        displayStatus: getDerivedInvoiceStatus(invoice.status, invoice.dueDate),
        externalSettledAmount: externalSettlementMap.get(invoice.id)?.amount || '0',
        hasExternalSettlements: (externalSettlementMap.get(invoice.id)?.count || 0) > 0
      });
    }

    for (const bucket of projectedBuckets.values()) {
      if (mergedInvoices.has(bucket.projectionKey) || bucket.projectedTransactions.length === 0) {
        continue;
      }

      const fixedSubtotalValue = sumProjectedTransactionAmounts(bucket.projectedTransactions);
      const status = resolveCreditCardInvoiceStatus(bucket.closingDate, false);

      mergedInvoices.set(bucket.projectionKey, {
        id: null,
        accountId: card.id,
        referenceYear: bucket.referenceYear,
        referenceMonth: bucket.referenceMonth,
        closingDate: bucket.closingDate,
        dueDate: bucket.dueDate,
        status,
        settlementType: null,
        settledAt: null,
        paymentTransaction: null,
        projectionKey: bucket.projectionKey,
        isProjected: true,
        hasProjectedTransactions: true,
        itemsSubtotal: '0',
        fixedSubtotal: fixedSubtotalValue.toString(),
        totalAmount: fixedSubtotalValue.toString(),
        itemCount: 0,
        fixedItemCount: bucket.projectedTransactions.length,
        displayStatus: getDerivedInvoiceStatus(status, bucket.dueDate),
        externalSettledAmount: '0',
        hasExternalSettlements: false
      });
    }

    return [...mergedInvoices.values()].sort((left, right) => {
      if (left.referenceYear !== right.referenceYear) {
        return right.referenceYear - left.referenceYear;
      }

      if (left.referenceMonth !== right.referenceMonth) {
        return right.referenceMonth - left.referenceMonth;
      }

      return new Date(right.dueDate).getTime() - new Date(left.dueDate).getTime();
    });
  }

  static async getInvoiceById(invoiceId: number, companyId: number, includeProjected = true) {
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
    const projectionKey = buildProjectionKey(invoice.referenceYear, invoice.referenceMonth);
    const shouldIncludeProjected =
      includeProjected &&
      isProjectionInWindow(invoice.referenceYear, invoice.referenceMonth) &&
      invoice.account.type === 'CREDIT_CARD';
    const projectedTransactions = shouldIncludeProjected
      ? (await this.buildProjectedInvoiceBuckets({
          account: invoice.account as CardAccountWithConfig,
          companyId
        })).get(projectionKey)?.projectedTransactions ?? []
      : [];
    const fixedSubtotalValue = sumProjectedTransactionAmounts(projectedTransactions);

    return {
      ...invoice,
      projectionKey,
      isProjected: false,
      hasProjectedTransactions: projectedTransactions.length > 0,
      itemsSubtotal: invoice.totalAmount.toString(),
      fixedSubtotal: fixedSubtotalValue.toString(),
      totalAmount: toDecimal(invoice.totalAmount).plus(fixedSubtotalValue).toString(),
      itemCount: invoice.transactions.length,
      fixedItemCount: projectedTransactions.length,
      transactions: [
        ...invoice.transactions.map((transaction) => ({
          ...transaction,
          isProjected: false,
          isFixedProjection: false,
          fixedTemplateId: null
        })),
        ...projectedTransactions
      ],
      displayStatus: getDerivedInvoiceStatus(invoice.status, invoice.dueDate),
      externalSettledAmount: externalSettledAmount.toString(),
      hasExternalSettlements: externalSettledAmount.gt(0)
    };
  }

  static async getProjectedInvoiceByKey(params: {
    accountId: number;
    projectionKey: string;
    companyId: number;
  }) {
    const { referenceYear, referenceMonth } = parseProjectionKey(params.projectionKey);
    const card = await this.getCardAccount(params.accountId, params.companyId);

    if (!card) {
      return null;
    }

    const projectedBuckets = await this.buildProjectedInvoiceBuckets({
      account: card,
      companyId: params.companyId
    });
    const bucket = projectedBuckets.get(params.projectionKey);

    if (!bucket || bucket.projectedTransactions.length === 0) {
      return null;
    }

    const fixedSubtotalValue = sumProjectedTransactionAmounts(bucket.projectedTransactions);
    const status = resolveCreditCardInvoiceStatus(bucket.closingDate, false);

    return {
      id: null,
      accountId: card.id,
      referenceYear,
      referenceMonth,
      closingDate: bucket.closingDate,
      dueDate: bucket.dueDate,
      status,
      displayStatus: getDerivedInvoiceStatus(status, bucket.dueDate),
      settlementType: null,
      settledAt: null,
      paymentTransaction: null,
      account: card,
      projectionKey: params.projectionKey,
      isProjected: true,
      hasProjectedTransactions: true,
      itemsSubtotal: '0',
      fixedSubtotal: fixedSubtotalValue.toString(),
      totalAmount: fixedSubtotalValue.toString(),
      itemCount: 0,
      fixedItemCount: bucket.projectedTransactions.length,
      externalSettledAmount: '0',
      hasExternalSettlements: false,
      transactions: bucket.projectedTransactions
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
    const invoice = await this.getInvoiceById(params.invoiceId, params.companyId, false);

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
