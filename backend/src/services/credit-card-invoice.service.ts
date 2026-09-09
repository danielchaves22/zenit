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
import FixedTransactionService, {
  buildOccurrenceKeyValue,
  FixedMaterializationInvoiceReference
} from './fixed-transaction.service';
import {
  buildCreditCardInvoiceReferenceForMonth,
  getDerivedInvoiceStatus,
  resolveCreditCardInvoiceReference,
  resolveCreditCardInvoiceStatus
} from '../utils/credit-card';
import { getBankIconPath } from '../catalogs/bank-catalog';

const prisma = new PrismaClient();
const CREDIT_CARD_RECONCILIATION_MUTATION_TTL_MS = 10 * 60 * 1000;

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

function sameNullableDate(left: Date | null | undefined, right: Date | null | undefined) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
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
  isActive: boolean;
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

type FixedMaterializationReason =
  | 'READY'
  | 'INVOICE_OPEN'
  | 'INVOICE_PAID'
  | 'ACCOUNT_INACTIVE'
  | 'NOTHING_TO_MATERIALIZE';

type FixedMaterializationMissingOccurrence = {
  templateId: number;
  description: string;
  amount: string;
  occurrenceKey: string;
  occurrenceDate: Date;
  templateIsActive: boolean;
};

type FixedMaterializationMaterializedOccurrence = FixedMaterializationMissingOccurrence & {
  transactionId: number;
  transactionDescription: string;
  transactionAmount: string;
  transactionStatus: TransactionStatus;
  archivedAt: Date | null;
  isIgnored: boolean;
  matchedBy: 'OCCURRENCE_KEY' | 'LEGACY_RECURRING_COMPETENCE';
};

type FixedMaterializationInconsistency = FixedMaterializationMissingOccurrence & {
  issue:
    | 'OCCURRENCE_KEY_WITHOUT_INVOICE'
    | 'OCCURRENCE_KEY_WRONG_INVOICE'
    | 'AMBIGUOUS_LEGACY_OCCURRENCES'
    | 'DUPLICATE_EXACT_AND_LEGACY_OCCURRENCES';
  transactionIds: number[];
  message: string;
};

export type CreditCardFixedMaterializationPreview = {
  accountId: number;
  invoiceId: number | null;
  referenceYear: number;
  referenceMonth: number;
  status: CreditCardInvoiceStatus;
  canMaterialize: boolean;
  reason: FixedMaterializationReason;
  expectedCount: number;
  materializedCount: number;
  ignoredCount: number;
  missingCount: number;
  inconsistencyCount: number;
  excludedUnboundedInactiveTemplateCount: number;
  warnings: string[];
  missingOccurrences: FixedMaterializationMissingOccurrence[];
  materializedOccurrences: FixedMaterializationMaterializedOccurrence[];
  inconsistentOccurrences: FixedMaterializationInconsistency[];
};

type CreditCardFixedMaterializationContext = {
  preview: CreditCardFixedMaterializationPreview;
  invoiceReference: FixedMaterializationInvoiceReference;
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

  static async syncInvoicesForAccount(
    accountId: number,
    options?: { includePaid?: boolean }
  ): Promise<void> {
    const invoices = await prisma.creditCardInvoice.findMany({
      where: {
        accountId,
        ...(options?.includePaid === false
          ? {
              OR: [
                { status: { not: CreditCardInvoiceStatus.PAID } },
                {
                  paymentTransaction: {
                    is: {
                      status: { not: TransactionStatus.COMPLETED }
                    }
                  }
                }
              ]
            }
          : {})
      },
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

    if (invoices.length === 0) {
      return;
    }

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const [transactionTotals, externalSettlementCounts] = await Promise.all([
      prisma.financialTransaction.groupBy({
        by: ['creditCardInvoiceId'],
        where: {
          creditCardInvoiceId: { in: invoiceIds },
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED
        },
        _sum: {
          amount: true
        }
      }),
      prisma.financialTransaction.groupBy({
        by: ['creditCardInvoiceId'],
        where: {
          creditCardInvoiceId: { in: invoiceIds },
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          isExternalCreditCardSettlement: true
        },
        _count: {
          _all: true
        }
      })
    ]);

    const totalByInvoiceId = new Map(
      transactionTotals
        .filter((item) => item.creditCardInvoiceId !== null)
        .map((item) => [
          item.creditCardInvoiceId as number,
          item._sum.amount ?? new Prisma.Decimal(0)
        ])
    );
    const externalSettlementCountByInvoiceId = new Map(
      externalSettlementCounts
        .filter((item) => item.creditCardInvoiceId !== null)
        .map((item) => [item.creditCardInvoiceId as number, item._count._all])
    );
    const writeOperations: Prisma.PrismaPromise<unknown>[] = [];

    for (const invoice of invoices) {
      const totalAmount = totalByInvoiceId.get(invoice.id) ?? new Prisma.Decimal(0);
      const hasCompletedPayment = invoice.paymentTransaction?.status === TransactionStatus.COMPLETED;
      const paymentTransactionId = hasCompletedPayment ? invoice.paymentTransactionId : null;
      const hasExternalSettlements = (externalSettlementCountByInvoiceId.get(invoice.id) ?? 0) > 0;

      if (totalAmount.eq(0) && !paymentTransactionId && !hasExternalSettlements) {
        writeOperations.push(prisma.creditCardInvoice.delete({ where: { id: invoice.id } }));
        continue;
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
      const status = settlementType
        ? CreditCardInvoiceStatus.PAID
        : resolveCreditCardInvoiceStatus(invoice.closingDate, false);

      const hasChanges =
        !invoice.totalAmount.eq(totalAmount) ||
        invoice.paymentTransactionId !== paymentTransactionId ||
        invoice.status !== status ||
        invoice.settlementType !== settlementType ||
        !sameNullableDate(invoice.settledAt, settledAt);

      if (!hasChanges) {
        continue;
      }

      writeOperations.push(
        prisma.creditCardInvoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount,
            paymentTransactionId,
            status,
            settlementType,
            settledAt
          }
        })
      );
    }

    const batchSize = 25;
    for (let index = 0; index < writeOperations.length; index += batchSize) {
      await prisma.$transaction(writeOperations.slice(index, index + batchSize));
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
        isActive: true,
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
        OR: [
          {
            occurrenceKey: {
              in: projectedCandidates.map((candidate) => candidate.occurrenceKey)
            }
          },
          {
            occurrenceKey: null,
            recurringTransactionId: {
              in: Array.from(new Set(
                projectedCandidates.map((candidate) => candidate.template.id)
              ))
            },
            fromAccountId: account.id,
            type: TransactionType.EXPENSE,
            OR: [
              {
                creditCardInvoice: {
                  is: {
                    accountId: account.id,
                    OR: window.map((entry) => ({
                      referenceYear: entry.referenceYear,
                      referenceMonth: entry.referenceMonth
                    }))
                  }
                }
              },
              {
                creditCardInvoiceId: null,
                date: {
                  gte: rangeStart,
                  lte: rangeEnd
                }
              }
            ]
          }
        ]
      },
      select: {
        occurrenceKey: true,
        recurringTransactionId: true,
        date: true,
        creditCardInvoice: {
          select: {
            referenceYear: true,
            referenceMonth: true
          }
        }
      }
    });

    const existingOccurrenceKeys = new Set(
      existingOccurrences
        .map((transaction) => transaction.occurrenceKey)
        .filter((occurrenceKey): occurrenceKey is string => Boolean(occurrenceKey))
    );
    const existingLegacyCompetences = new Set(
      existingOccurrences.flatMap((transaction) => {
        if (transaction.occurrenceKey || !transaction.recurringTransactionId) {
          return [];
        }

        const referenceYear = transaction.creditCardInvoice?.referenceYear
          ?? transaction.date.getFullYear();
        const referenceMonth = transaction.creditCardInvoice?.referenceMonth
          ?? transaction.date.getMonth() + 1;

        return [
          `${transaction.recurringTransactionId}:${buildProjectionKey(referenceYear, referenceMonth)}`
        ];
      })
    );

    for (const candidate of projectedCandidates) {
      if (
        existingOccurrenceKeys.has(candidate.occurrenceKey) ||
        existingLegacyCompetences.has(`${candidate.template.id}:${candidate.projectionKey}`)
      ) {
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

  private static async buildFixedMaterializationContext(params: {
    accountId: number;
    referenceYear: number;
    referenceMonth: number;
    companyId: number;
    now?: Date;
  }): Promise<CreditCardFixedMaterializationContext | null> {
    const { accountId, referenceYear, referenceMonth, companyId, now = new Date() } = params;
    const account = await this.getCardAccount(accountId, companyId);

    if (!account) {
      return null;
    }

    const invoice = await prisma.creditCardInvoice.findUnique({
      where: {
        unique_credit_card_invoice_reference: {
          accountId,
          referenceYear,
          referenceMonth
        }
      },
      select: {
        id: true,
        status: true,
        settlementType: true,
        closingDate: true,
        dueDate: true,
        paymentTransaction: {
          select: {
            status: true
          }
        }
      }
    });

    if (
      !invoice &&
      (!account.statementClosingDay || !account.statementDueDay)
    ) {
      throw new Error('Cartão de crédito sem fechamento e vencimento configurados');
    }

    const calculatedReference = invoice
      ? {
          referenceYear,
          referenceMonth,
          closingDate: invoice.closingDate,
          dueDate: invoice.dueDate
        }
      : buildCreditCardInvoiceReferenceForMonth(
          referenceYear,
          referenceMonth,
          account.statementClosingDay as number,
          account.statementDueDay as number
        );
    const invoiceReference: FixedMaterializationInvoiceReference = {
      ...calculatedReference,
      accountId
    };
    const invoiceIsPaid = Boolean(
      invoice && (
        invoice.status === CreditCardInvoiceStatus.PAID ||
        invoice.paymentTransaction?.status === TransactionStatus.COMPLETED ||
        invoice.settlementType === CreditCardInvoiceSettlementType.EXTERNAL
      )
    );
    const status = invoiceIsPaid
      ? CreditCardInvoiceStatus.PAID
      : resolveCreditCardInvoiceStatus(calculatedReference.closingDate, false, now);
    const occurrenceDate = new Date(calculatedReference.closingDate);
    occurrenceDate.setHours(0, 0, 0, 0);

    const templates = await prisma.recurringTransaction.findMany({
      where: {
        companyId,
        frequency: RecurringFrequency.MONTHLY,
        type: TransactionType.EXPENSE,
        fromAccountId: accountId,
        startDate: { lte: occurrenceDate },
        OR: [
          { endDate: null },
          { endDate: { gte: occurrenceDate } }
        ]
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            type: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });
    const cardTemplates = templates.filter((template) =>
      FixedTransactionService.isCreditCardFixedExpenseTemplate(template)
    );
    // isActive=false has no historical timestamp. Only an explicit endDate is
    // evidence that an inactive template was valid for a past competence.
    const excludedUnboundedInactiveTemplates = cardTemplates.filter(
      (template) => !template.isActive && template.endDate === null
    );
    const expectedTemplates = cardTemplates.filter(
      (template) => template.isActive || template.endDate !== null
    );
    const expectedOccurrences = expectedTemplates.map((template) => ({
      template,
      templateId: template.id,
      description: template.description,
      amount: template.amount.toString(),
      occurrenceKey: buildOccurrenceKeyValue(template.id, occurrenceDate),
      occurrenceDate,
      templateIsActive: template.isActive
    }));

    let existingOccurrences: Array<{
      id: number;
      description: string;
      amount: Prisma.Decimal;
      date: Date;
      status: TransactionStatus;
      recurringTransactionId: number | null;
      occurrenceKey: string | null;
      archivedAt: Date | null;
      creditCardInvoiceId: number | null;
      creditCardInvoice: {
        id: number;
        accountId: number;
        referenceYear: number;
        referenceMonth: number;
      } | null;
    }> = [];

    if (expectedOccurrences.length > 0) {
      const referenceMonthStart = new Date(referenceYear, referenceMonth - 1, 1, 0, 0, 0, 0);
      const referenceMonthEnd = new Date(referenceYear, referenceMonth, 0, 23, 59, 59, 999);
      const templateIds = expectedOccurrences.map((occurrence) => occurrence.templateId);

      existingOccurrences = await prisma.financialTransaction.findMany({
        where: {
          companyId,
          OR: [
            {
              occurrenceKey: {
                in: expectedOccurrences.map((occurrence) => occurrence.occurrenceKey)
              }
            },
            {
              occurrenceKey: null,
              recurringTransactionId: { in: templateIds },
              fromAccountId: accountId,
              type: TransactionType.EXPENSE,
              OR: [
                {
                  creditCardInvoice: {
                    is: {
                      accountId,
                      referenceYear,
                      referenceMonth
                    }
                  }
                },
                {
                  creditCardInvoiceId: null,
                  date: {
                    gte: referenceMonthStart,
                    lte: referenceMonthEnd
                  }
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          status: true,
          recurringTransactionId: true,
          occurrenceKey: true,
          archivedAt: true,
          creditCardInvoiceId: true,
          creditCardInvoice: {
            select: {
              id: true,
              accountId: true,
              referenceYear: true,
              referenceMonth: true
            }
          }
        },
        orderBy: { id: 'asc' }
      });
    }

    const exactByOccurrenceKey = new Map<string, (typeof existingOccurrences)[number]>();
    const legacyByTemplateId = new Map<number, Array<(typeof existingOccurrences)[number]>>();

    for (const transaction of existingOccurrences) {
      if (transaction.occurrenceKey && !exactByOccurrenceKey.has(transaction.occurrenceKey)) {
        exactByOccurrenceKey.set(transaction.occurrenceKey, transaction);
      }

      if (
        !transaction.occurrenceKey &&
        transaction.recurringTransactionId
      ) {
        const occurrences = legacyByTemplateId.get(transaction.recurringTransactionId) ?? [];
        occurrences.push(transaction);
        legacyByTemplateId.set(transaction.recurringTransactionId, occurrences);
      }
    }

    const missingOccurrences: FixedMaterializationMissingOccurrence[] = [];
    const materializedOccurrences: FixedMaterializationMaterializedOccurrence[] = [];
    const inconsistentOccurrences: FixedMaterializationInconsistency[] = [];

    for (const expected of expectedOccurrences) {
      const exact = exactByOccurrenceKey.get(expected.occurrenceKey);
      const legacy = legacyByTemplateId.get(expected.templateId) ?? [];
      const materialized = exact ?? legacy[0];
      const occurrenceIdentity = {
        templateId: expected.templateId,
        description: expected.description,
        amount: expected.amount,
        occurrenceKey: expected.occurrenceKey,
        occurrenceDate: expected.occurrenceDate,
        templateIsActive: expected.templateIsActive
      };

      if (!materialized) {
        missingOccurrences.push(occurrenceIdentity);
        continue;
      }

      if (exact) {
        if (!exact.creditCardInvoice) {
          inconsistentOccurrences.push({
            ...occurrenceIdentity,
            issue: 'OCCURRENCE_KEY_WITHOUT_INVOICE',
            transactionIds: [exact.id],
            message: 'A ocorrencia possui a chave esperada, mas nao esta vinculada a uma fatura'
          });
        } else if (
          exact.creditCardInvoice.accountId !== accountId ||
          exact.creditCardInvoice.referenceYear !== referenceYear ||
          exact.creditCardInvoice.referenceMonth !== referenceMonth
        ) {
          inconsistentOccurrences.push({
            ...occurrenceIdentity,
            issue: 'OCCURRENCE_KEY_WRONG_INVOICE',
            transactionIds: [exact.id],
            message: 'A ocorrencia possui a chave esperada, mas esta vinculada a outro cartao ou competencia'
          });
        } else if (legacy.length > 0) {
          inconsistentOccurrences.push({
            ...occurrenceIdentity,
            issue: 'DUPLICATE_EXACT_AND_LEGACY_OCCURRENCES',
            transactionIds: [exact.id, ...legacy.map((occurrence) => occurrence.id)],
            message: 'Existem ocorrencias exata e legada para o mesmo template e competencia'
          });
        }
      } else if (legacy.length > 1) {
        inconsistentOccurrences.push({
          ...occurrenceIdentity,
          issue: 'AMBIGUOUS_LEGACY_OCCURRENCES',
          transactionIds: legacy.map((occurrence) => occurrence.id),
          message: 'Existem multiplas ocorrencias legadas para o mesmo template e competencia'
        });
      }

      materializedOccurrences.push({
        ...occurrenceIdentity,
        transactionId: materialized.id,
        transactionDescription: materialized.description,
        transactionAmount: materialized.amount.toString(),
        transactionStatus: materialized.status,
        archivedAt: materialized.archivedAt,
        isIgnored: Boolean(materialized.archivedAt),
        matchedBy: exact ? 'OCCURRENCE_KEY' : 'LEGACY_RECURRING_COMPETENCE'
      });
    }

    const missingCount = missingOccurrences.length;
    const canMaterialize =
      account.isActive &&
      status === CreditCardInvoiceStatus.CLOSED &&
      missingCount > 0;
    const reason: FixedMaterializationReason = status === CreditCardInvoiceStatus.OPEN
      ? 'INVOICE_OPEN'
      : status === CreditCardInvoiceStatus.PAID
        ? 'INVOICE_PAID'
        : missingCount === 0
          ? 'NOTHING_TO_MATERIALIZE'
          : !account.isActive
            ? 'ACCOUNT_INACTIVE'
            : 'READY';

    return {
      invoiceReference,
      preview: {
        accountId,
        invoiceId: invoice?.id ?? null,
        referenceYear,
        referenceMonth,
        status,
        canMaterialize,
        reason,
        expectedCount: expectedOccurrences.length,
        materializedCount: materializedOccurrences.length,
        ignoredCount: materializedOccurrences.filter((occurrence) => occurrence.isIgnored).length,
        missingCount,
        inconsistencyCount: inconsistentOccurrences.length,
        excludedUnboundedInactiveTemplateCount: excludedUnboundedInactiveTemplates.length,
        warnings: excludedUnboundedInactiveTemplates.length > 0
          ? [
              'Templates inativos sem data final foram excluidos porque nao ha historico suficiente para confirmar sua vigencia nesta competencia'
            ]
          : [],
        missingOccurrences,
        materializedOccurrences,
        inconsistentOccurrences
      }
    };
  }

  static async getFixedMaterializationPreview(params: {
    accountId: number;
    referenceYear: number;
    referenceMonth: number;
    companyId: number;
  }): Promise<CreditCardFixedMaterializationPreview | null> {
    const context = await this.buildFixedMaterializationContext(params);
    return context?.preview ?? null;
  }

  static async materializeMissingFixedOccurrences(params: {
    accountId: number;
    referenceYear: number;
    referenceMonth: number;
    companyId: number;
    userId: number;
  }) {
    const context = await this.buildFixedMaterializationContext(params);

    if (!context) {
      return null;
    }

    if (context.preview.status === CreditCardInvoiceStatus.OPEN) {
      throw new Error('A fatura ainda esta aberta e nao pode materializar transacoes fixas');
    }

    if (context.preview.status === CreditCardInvoiceStatus.PAID) {
      throw new Error('A fatura ja esta paga e nao pode materializar transacoes fixas');
    }

    if (context.preview.reason === 'ACCOUNT_INACTIVE') {
      throw new Error('O cartao de credito esta inativo e nao pode receber materializacoes');
    }

    let createdCount = 0;
    const errors: Array<{
      templateId: number;
      description: string;
      occurrenceKey: string;
      error: string;
    }> = [];
    const attemptedCount = context.preview.missingOccurrences.length;

    for (const occurrence of context.preview.missingOccurrences) {
      try {
        const result = await FixedTransactionService.materializeOccurrence({
          templateId: occurrence.templateId,
          occurrenceDate: context.invoiceReference.closingDate,
          companyId: params.companyId,
          userId: params.userId,
          creditCardInvoiceReference: context.invoiceReference,
          allowInactiveTemplate: true
        });

        if (result.created) {
          createdCount += 1;
        }
      } catch (error: any) {
        errors.push({
          templateId: occurrence.templateId,
          description: occurrence.description,
          occurrenceKey: occurrence.occurrenceKey,
          error: error?.message ?? String(error)
        });
      }
    }

    const refreshed = await this.buildFixedMaterializationContext(params);

    if (!refreshed) {
      return null;
    }

    return {
      ...refreshed.preview,
      attemptedCount,
      createdCount,
      failedCount: errors.length,
      errors
    };
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
    includePaid?: boolean;
  }) {
    const card = await this.getCardAccount(params.accountId, params.companyId);
    if (!card) {
      return [];
    }

    const includePaid = params.includePaid ?? true;

    await this.syncInvoicesForAccount(params.accountId, { includePaid });

    const [invoices, projectedBuckets] = await Promise.all([
      prisma.creditCardInvoice.findMany({
        where: {
          accountId: params.accountId,
          ...(includePaid
            ? {}
            : { status: { not: CreditCardInvoiceStatus.PAID } }),
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
    const invoiceIdentity = await prisma.creditCardInvoice.findFirst({
      where: {
        id: params.invoiceId,
        account: {
          companyId: params.companyId
        }
      },
      select: {
        id: true,
        accountId: true
      }
    });

    if (!invoiceIdentity) {
      throw new Error('Fatura nao encontrada');
    }

    if (params.fromAccountId === invoiceIdentity.accountId) {
      throw new Error('Conta pagadora deve ser diferente do cartao de credito');
    }

    const paymentDate = params.paymentDate ?? new Date();
    const paidInvoiceId = await prisma.$transaction(async (tx) => {
      // Every credit-card expense locks the card account before linking an
      // invoice. Taking the same lock before calculating the payment amount
      // serializes payment with fixed/manual materialization without a new DB
      // object or migration.
      const accountIds = Array.from(new Set([
        params.fromAccountId,
        invoiceIdentity.accountId
      ])).sort((left, right) => left - right);

      for (const accountId of accountIds) {
        const lockedAccounts = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id
          FROM "FinancialAccount"
          WHERE id = ${accountId}
          FOR UPDATE
        `;

        if (lockedAccounts.length === 0) {
          throw new Error(`Account ID ${accountId} not found`);
        }
      }

      const lockedInvoices = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id
        FROM "CreditCardInvoice"
        WHERE id = ${params.invoiceId}
        FOR UPDATE
      `;

      if (lockedInvoices.length === 0) {
        throw new Error('Fatura nao encontrada');
      }

      const invoice = await tx.creditCardInvoice.findFirst({
        where: {
          id: params.invoiceId,
          account: {
            companyId: params.companyId
          }
        },
        include: {
          account: {
            select: {
              id: true,
              name: true
            }
          },
          paymentTransaction: {
            select: {
              status: true
            }
          }
        }
      });

      if (!invoice) {
        throw new Error('Fatura nao encontrada');
      }

      const invoiceIsPaid =
        invoice.status === CreditCardInvoiceStatus.PAID ||
        invoice.paymentTransaction?.status === TransactionStatus.COMPLETED ||
        invoice.settlementType !== null;

      if (invoiceIsPaid) {
        throw new Error('Fatura ja esta paga');
      }

      const activeReconciliation = await tx.creditCardReconciliationSession.findFirst({
        where: {
          accountId: invoice.accountId,
          referenceYear: invoice.referenceYear,
          referenceMonth: invoice.referenceMonth,
          activeMutationToken: { not: null },
          activeMutationAt: {
            gt: new Date(Date.now() - CREDIT_CARD_RECONCILIATION_MUTATION_TTL_MS)
          }
        },
        select: { id: true }
      });
      if (activeReconciliation) {
        throw new Error(
          'A conciliacao desta fatura esta em processamento. Aguarde a operacao terminar antes de pagar.'
        );
      }

      const aggregate = await tx.financialTransaction.aggregate({
        where: {
          creditCardInvoiceId: invoice.id,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED
        },
        _sum: {
          amount: true
        }
      });
      const totalAmount = aggregate._sum.amount ?? new Prisma.Decimal(0);

      if (totalAmount.lte(0)) {
        throw new Error('Fatura sem saldo para pagamento');
      }

      const label = formatInvoiceLabel(invoice.referenceMonth, invoice.referenceYear);
      const createdPayment = await FinancialTransactionService.createCreditCardInvoicePaymentTx(
        tx,
        {
          description: `Pagamento fatura ${invoice.account.name} ${label}`,
          amount: totalAmount.toString(),
          date: paymentDate,
          dueDate: paymentDate,
          effectiveDate: paymentDate,
          notes: params.notes || `Pagamento integral da fatura ${label}`,
          fromAccountId: params.fromAccountId,
          toAccountId: invoice.accountId,
          companyId: params.companyId,
          createdBy: params.userId
        }
      );

      await tx.creditCardInvoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount,
          paymentTransactionId: createdPayment.id,
          status: CreditCardInvoiceStatus.PAID,
          settlementType: CreditCardInvoiceSettlementType.TRANSFER,
          settledAt: paymentDate
        }
      });

      return invoice.id;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
      maxWait: 10000
    });

    return this.getInvoiceById(paidInvoiceId, params.companyId);
  }

  static async reopenInvoice(params: {
    invoiceId: number;
    companyId: number;
  }) {
    const invoice = await this.getInvoiceById(params.invoiceId, params.companyId, false);

    if (!invoice) {
      throw new Error('Fatura nao encontrada');
    }

    if (invoice.status !== CreditCardInvoiceStatus.PAID) {
      throw new Error('Apenas faturas pagas podem ser reabertas');
    }

    if (invoice.settlementType !== CreditCardInvoiceSettlementType.TRANSFER) {
      throw new Error('Apenas faturas pagas por transferencia podem ser reabertas');
    }

    if (invoice.hasExternalSettlements) {
      throw new Error('Faturas com liquidacoes fora do sistema nao podem ser reabertas');
    }

    if (!invoice.paymentTransaction?.id) {
      throw new Error('Pagamento vinculado nao encontrado');
    }

    await FinancialTransactionService.deleteTransaction(invoice.paymentTransaction.id, {
      companyId: params.companyId
    });

    const reopenedInvoice = await this.getInvoiceById(invoice.id, params.companyId);

    if (!reopenedInvoice) {
      throw new Error('Fatura nao encontrada apos a reabertura');
    }

    return reopenedInvoice;
  }
}
