import {
  AccountType,
  CreditCardInvoiceStatus,
  Prisma,
  PrismaClient,
  RecurringFrequency,
  TransactionType
} from '@prisma/client';
import FixedTransactionService, { buildOccurrenceKeyValue } from './fixed-transaction.service';
import SystemJobRunService from './system-job-run.service';

const prisma = new PrismaClient();

const FIXED_MATERIALIZER_JOB = 'fixed-transaction-materializer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scopeJobRunToCompany<TRun extends {
  status: string;
  errorMessage: string | null;
  errorDetails: Prisma.JsonValue | null;
}>(run: TRun, companyId: number) {
  const companyErrorDetails = Array.isArray(run.errorDetails)
    ? run.errorDetails.filter(
        (detail) => isRecord(detail) && detail.companyId === companyId
      )
    : [];

  return {
    ...run,
    // Job runs aggregate every company. Never expose an unscoped backend message or stack
    // through a tenant-scoped overview.
    errorMessage: run.status === 'FAILED'
      ? 'A execucao global falhou. Detalhes tecnicos globais nao sao exibidos neste painel.'
      : null,
    errorDetails: companyErrorDetails.length > 0 ? companyErrorDetails : null,
    companyErrorDetailCount: companyErrorDetails.length,
    countsScope: 'GLOBAL' as const,
    errorDetailsScope: 'COMPANY' as const
  };
}

function buildProjectionWindow(now: Date = new Date()) {
  return Array.from({ length: 10 }, (_, index) => {
    const referenceBase = new Date(now.getFullYear(), now.getMonth() + index, 1, 12, 0, 0, 0);

    return {
      referenceYear: referenceBase.getFullYear(),
      referenceMonth: referenceBase.getMonth() + 1,
      projectionKey: `${referenceBase.getFullYear()}-${String(referenceBase.getMonth() + 1).padStart(2, '0')}`
    };
  });
}

function getOperationHealthStatus(params: {
  latestRun?: { status: string; finishedAt: Date | null; startedAt: Date } | null;
  blockingIssueCount: number;
  missingConfigurationCount: number;
}) {
  if (!params.latestRun) {
    return 'WARNING';
  }

  if (params.latestRun.status === 'FAILED') {
    return 'ERROR';
  }

  if (params.blockingIssueCount > 0 || params.missingConfigurationCount > 0) {
    return 'WARNING';
  }

  return 'OK';
}

function getJobHealth(run?: { status: string; finishedAt: Date | null; startedAt: Date } | null) {
  if (!run) {
    return {
      status: 'WARNING',
      message: 'Nenhuma execucao registrada'
    };
  }

  if (run.status === 'FAILED') {
    return {
      status: 'ERROR',
      message: 'Ultima execucao falhou'
    };
  }

  if (run.status === 'PARTIAL') {
    return {
      status: 'WARNING',
      message: 'Ultima execucao concluiu com alertas'
    };
  }

  const lastFinishedAt = run.finishedAt || run.startedAt;
  const hoursSinceLastRun = (Date.now() - lastFinishedAt.getTime()) / (60 * 60 * 1000);

  if (hoursSinceLastRun > 30) {
    return {
      status: 'WARNING',
      message: 'Sem execucao recente nas ultimas 30 horas'
    };
  }

  return {
    status: 'OK',
    message: 'Executando normalmente'
  };
}

type PendingFixedOccurrence = {
  templateId: number;
  description: string;
  amount: string;
  occurrenceKey: string;
  occurrenceDate: Date;
};

export default class SystemOperationsService {
  private static async listCreditCardInvoiceProjectionBlocks(companyId: number) {
    const now = new Date();
    const window = buildProjectionWindow(now);
    const referenceFilters = window.map((entry) => ({
      referenceYear: entry.referenceYear,
      referenceMonth: entry.referenceMonth
    }));

    const invoices = await prisma.creditCardInvoice.findMany({
      where: {
        status: {
          not: CreditCardInvoiceStatus.PAID
        },
        closingDate: {
          lte: now
        },
        OR: referenceFilters,
        account: {
          companyId,
          type: AccountType.CREDIT_CARD
        }
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            statementClosingDay: true,
            statementDueDay: true
          }
        }
      },
      orderBy: [
        { referenceYear: 'desc' },
        { referenceMonth: 'desc' }
      ]
    });

    if (invoices.length === 0) {
      return [];
    }

    const accountIds = Array.from(new Set(invoices.map((invoice) => invoice.accountId)));
    const rangeStart = new Date(window[0].referenceYear, window[0].referenceMonth - 1, 1, 0, 0, 0, 0);
    const lastWindowEntry = window[window.length - 1];
    const rangeEnd = new Date(
      lastWindowEntry.referenceYear,
      lastWindowEntry.referenceMonth,
      0,
      23,
      59,
      59,
      999
    );

    const templates = await prisma.recurringTransaction.findMany({
      where: {
        companyId,
        isActive: true,
        frequency: RecurringFrequency.MONTHLY,
        type: TransactionType.EXPENSE,
        fromAccountId: {
          in: accountIds
        },
        startDate: {
          lte: rangeEnd
        },
        OR: [
          { endDate: null },
          { endDate: { gte: rangeStart } }
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
      }
    });

    if (templates.length === 0) {
      return [];
    }

    const candidateByInvoiceId = new Map<number, PendingFixedOccurrence[]>();
    const allOccurrenceKeys: string[] = [];

    for (const invoice of invoices) {
      const accountTemplates = templates.filter((template) => template.fromAccountId === invoice.accountId);

      for (const template of accountTemplates) {
        if (!FixedTransactionService.isCreditCardFixedExpenseTemplate(template)) {
          continue;
        }

        const occurrenceDate = FixedTransactionService.buildVirtualDateForMonth(
          template,
          invoice.referenceYear,
          invoice.referenceMonth - 1
        );

        if (template.startDate > occurrenceDate || (template.endDate && template.endDate < occurrenceDate)) {
          continue;
        }

        const occurrenceKey = buildOccurrenceKeyValue(template.id, occurrenceDate);
        const current = candidateByInvoiceId.get(invoice.id) || [];
        current.push({
          templateId: template.id,
          description: template.description,
          amount: template.amount.toString(),
          occurrenceKey,
          occurrenceDate
        });
        candidateByInvoiceId.set(invoice.id, current);
        allOccurrenceKeys.push(occurrenceKey);
      }
    }

    if (allOccurrenceKeys.length === 0) {
      return [];
    }

    const materializedOccurrences = await prisma.financialTransaction.findMany({
      where: {
        companyId,
        occurrenceKey: {
          in: allOccurrenceKeys
        }
      },
      select: {
        occurrenceKey: true
      }
    });
    const materializedOccurrenceKeys = new Set(
      materializedOccurrences
        .map((transaction) => transaction.occurrenceKey)
        .filter((occurrenceKey): occurrenceKey is string => Boolean(occurrenceKey))
    );

    return invoices
      .map((invoice) => {
        const pendingOccurrences = (candidateByInvoiceId.get(invoice.id) || [])
          .filter((candidate) => !materializedOccurrenceKeys.has(candidate.occurrenceKey));
        const fixedSubtotal = pendingOccurrences.reduce(
          (sum, occurrence) => sum.plus(occurrence.amount),
          new Prisma.Decimal(0)
        );

        return {
          invoiceId: invoice.id,
          accountId: invoice.accountId,
          accountName: invoice.account.name,
          referenceYear: invoice.referenceYear,
          referenceMonth: invoice.referenceMonth,
          invoiceKey: `invoice:${invoice.id}`,
          status: invoice.status,
          closingDate: invoice.closingDate,
          dueDate: invoice.dueDate,
          pendingFixedCount: pendingOccurrences.length,
          pendingFixedSubtotal: fixedSubtotal.toString(),
          pendingOccurrences: pendingOccurrences.slice(0, 10).map((occurrence) => ({
            ...occurrence,
            occurrenceDate: occurrence.occurrenceDate.toISOString()
          }))
        };
      })
      .filter((invoice) => invoice.pendingFixedCount > 0);
  }

  private static async listCreditCardConfigurationIssues(companyId: number) {
    return prisma.financialAccount.findMany({
      where: {
        companyId,
        type: AccountType.CREDIT_CARD,
        isActive: true,
        OR: [
          { statementClosingDay: null },
          { statementDueDay: null }
        ]
      },
      select: {
        id: true,
        name: true,
        statementClosingDay: true,
        statementDueDay: true
      },
      orderBy: {
        name: 'asc'
      }
    });
  }

  static async getOverview(companyId: number) {
    const [recentRuns, creditCardInvoiceProjectionBlocks, creditCardConfigurationIssues] = await Promise.all([
      SystemJobRunService.listRecent(FIXED_MATERIALIZER_JOB, 10),
      this.listCreditCardInvoiceProjectionBlocks(companyId),
      this.listCreditCardConfigurationIssues(companyId)
    ]);
    const companyScopedRecentRuns = recentRuns.map((run) => scopeJobRunToCompany(run, companyId));
    const latestRun = companyScopedRecentRuns[0] || null;
    const jobHealth = getJobHealth(latestRun);

    return {
      generatedAt: new Date().toISOString(),
      status: getOperationHealthStatus({
        latestRun,
        blockingIssueCount: creditCardInvoiceProjectionBlocks.length,
        missingConfigurationCount: creditCardConfigurationIssues.length
      }),
      jobs: [
        {
          name: FIXED_MATERIALIZER_JOB,
          displayName: 'Materializacao diaria de transacoes fixas',
          schedule: 'Startup e depois de hora em hora; no maximo uma execucao diaria por processo',
          healthStatus: jobHealth.status,
          healthMessage: jobHealth.message,
          latestRun,
          recentRuns: companyScopedRecentRuns
        }
      ],
      issues: {
        creditCardInvoiceProjectionBlocks,
        creditCardConfigurationIssues
      }
    };
  }
}
