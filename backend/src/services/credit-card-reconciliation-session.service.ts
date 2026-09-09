import { createHash, randomUUID } from 'crypto';
import {
  AccountType,
  CreditCardInvoiceStatus,
  CreditCardReconciliationItemResolution,
  CreditCardReconciliationSessionStatus,
  FinancialTransactionImportSourceType,
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import CreditCardStatementReconciliationService, {
  type CreditCardReconciliationSourceType,
  type ReconciliationCommitResult,
  type ReconciliationPreviewItem,
  type ReconciliationPreviewResult
} from './credit-card-statement-reconciliation.service';
import FinancialTransactionService from './financial-transaction.service';

const prisma = new PrismaClient();
const PARSER_VERSION = 1;
const ACTIVE_MUTATION_TTL_MS = 10 * 60 * 1000;

export type CreditCardReconciliationSessionContext = {
  accountId: number;
  companyId: number;
  userId: number;
};

export type CreditCardReconciliationSessionErrorCode =
  | 'ACCOUNT_INACTIVE'
  | 'ITEM_STATE_CONFLICT'
  | 'MUTATION_IN_PROGRESS'
  | 'RECONCILIATION_SESSION_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'SESSION_COMPLETED'
  | 'SESSION_FILE_CONFLICT'
  | 'SESSION_SNAPSHOT_MISMATCH'
  | 'SESSION_TARGET_PAID'
  | 'TRANSACTION_ALREADY_CLAIMED';

export class CreditCardReconciliationSessionError extends Error {
  readonly statusCode: number;
  readonly code: CreditCardReconciliationSessionErrorCode;
  readonly currentRevision?: number;
  readonly currentSessionId?: number;

  constructor(
    message: string,
    code: CreditCardReconciliationSessionErrorCode,
    statusCode = 400,
    context?: { currentRevision?: number; currentSessionId?: number }
  ) {
    super(message);
    this.name = 'CreditCardReconciliationSessionError';
    this.code = code;
    this.statusCode = statusCode;
    this.currentRevision = context?.currentRevision;
    this.currentSessionId = context?.currentSessionId;
  }
}

type StartSessionInput = {
  sourceType: CreditCardReconciliationSourceType;
  targetReferenceYear: number;
  targetReferenceMonth: number;
  fileBase64: string;
  fileName: string;
  replace?: boolean;
  expectedSessionId?: number;
  expectedRevision?: number;
};

type CommitSelection = {
  itemId: string;
  action?: 'IMPORT' | 'LINK_FIXED';
  description?: string;
  categoryId?: number;
};

type ItemDecisionInput = {
  expectedRevision: number;
  decision: 'CONFIRM_EXISTING' | 'IGNORE' | 'RESTORE';
  transactionIds?: number[];
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function decodeFile(fileBase64: string) {
  const normalized = fileBase64.includes(',')
    ? fileBase64.slice(fileBase64.indexOf(',') + 1)
    : fileBase64;
  const buffer = Buffer.from(normalized, 'base64');

  if (buffer.length === 0) {
    throw new Error('Arquivo da fatura invalido');
  }

  return buffer;
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function itemIdentitySeed(item: ReconciliationPreviewItem) {
  return JSON.stringify({
    kind: item.kind,
    direction: item.direction,
    amount: item.amount,
    signedAmount: item.signedAmount,
    purchaseDate: item.purchaseDate,
    datePrecision: item.datePrecision,
    installmentNumber: item.installmentNumber,
    totalInstallments: item.totalInstallments,
    sourceDescription: item.sourceDescription,
    sourceSection: item.sourceSection,
    cardSuffix: item.cardSuffix,
    canImport: item.canImport,
    nonImportableReason: item.nonImportableReason
  });
}

function buildPersistedItemRecords(preview: ReconciliationPreviewResult) {
  const occurrences = new Map<string, number>();

  return preview.items.map((item, index) => {
    const seed = itemIdentitySeed(item);
    const occurrence = (occurrences.get(seed) || 0) + 1;
    const position = index + 1;
    occurrences.set(seed, occurrence);

    return {
      sourceItemId: item.id,
      identityKey: sha256(`${seed}|occurrence:${occurrence}|position:${position}`),
      position,
      snapshot: asJson(item)
    };
  });
}

function getAutomaticLinkedFixedResolution(item: ReconciliationPreviewItem) {
  const uniqueMatch = item.matchedTransactions.length === 1
    ? item.matchedTransactions[0]
    : null;

  if (
    item.status !== 'OK' ||
    uniqueMatch?.matchSource !== 'PROJECTED_FIXED' ||
    !uniqueMatch.fixedTemplateId
  ) {
    return null;
  }

  return {
    resolution: CreditCardReconciliationItemResolution.LINKED_FIXED,
    resolutionData: asJson({
      mode: 'PROJECTED_MATCH',
      reason: item.reason,
      fixedTemplateId: uniqueMatch.fixedTemplateId,
      occurrenceKey: uniqueMatch.occurrenceKey
    })
  };
}

function buildInitialItemRecords(
  preview: ReconciliationPreviewResult,
  userId: number
) {
  const resolvedAt = new Date();

  return buildPersistedItemRecords(preview).map((record, index) => {
    const automaticResolution = getAutomaticLinkedFixedResolution(preview.items[index]!);
    return automaticResolution
      ? {
          ...record,
          ...automaticResolution,
          resolvedAt,
          resolvedBy: userId
        }
      : record;
  });
}

async function createAutomaticResolutionEvents(
  tx: Prisma.TransactionClient,
  sessionId: number,
  userId: number,
  itemRecords: ReturnType<typeof buildInitialItemRecords>
) {
  const automaticItems = itemRecords.filter(
    (item) =>
      'resolution' in item &&
      item.resolution === CreditCardReconciliationItemResolution.LINKED_FIXED
  );
  if (automaticItems.length === 0) {
    return;
  }

  const persistedItems = await tx.creditCardReconciliationItem.findMany({
    where: {
      sessionId,
      sourceItemId: { in: automaticItems.map((item) => item.sourceItemId) }
    },
    select: { id: true, sourceItemId: true, resolutionData: true }
  });

  await tx.creditCardReconciliationEvent.createMany({
    data: persistedItems.map((item) => ({
      sessionId,
      itemId: item.id,
      userId,
      action: 'AUTO_LINK_FIXED',
      details: item.resolutionData ?? Prisma.DbNull
    }))
  });
}

function isLiveMutation(session: { activeMutationToken: string | null; activeMutationAt: Date | null }) {
  return Boolean(
    session.activeMutationToken &&
      session.activeMutationAt &&
      session.activeMutationAt.getTime() > Date.now() - ACTIVE_MUTATION_TTL_MS
  );
}

function staleMutationCutoff() {
  return new Date(Date.now() - ACTIVE_MUTATION_TTL_MS);
}

function assertExpectedRevision(
  session: { id: number; revision: number },
  expectedRevision: number
) {
  if (session.revision !== expectedRevision) {
    throw new CreditCardReconciliationSessionError(
      'A conciliacao mudou durante a operacao. Atualize a tela e tente novamente.',
      'REVISION_CONFLICT',
      409,
      { currentRevision: session.revision, currentSessionId: session.id }
    );
  }
}

function assertNoLiveMutation(session: {
  id: number;
  revision: number;
  activeMutationToken: string | null;
  activeMutationAt: Date | null;
}) {
  if (isLiveMutation(session)) {
    throw new CreditCardReconciliationSessionError(
      'Outra alteracao desta conciliacao ainda esta em andamento.',
      'MUTATION_IN_PROGRESS',
      409,
      { currentRevision: session.revision, currentSessionId: session.id }
    );
  }
}

function revisionCasWhere(sessionId: number, expectedRevision: number) {
  return {
    id: sessionId,
    revision: expectedRevision,
    OR: [
      { activeMutationToken: null },
      { activeMutationAt: null },
      { activeMutationAt: { lte: staleMutationCutoff() } }
    ]
  };
}

async function ensureCreditCardAccount(
  db: Prisma.TransactionClient | PrismaClient,
  context: CreditCardReconciliationSessionContext,
  requireActive: boolean
) {
  const account = await db.financialAccount.findFirst({
    where: {
      id: context.accountId,
      companyId: context.companyId,
      type: AccountType.CREDIT_CARD
    },
    select: {
      id: true,
      companyId: true,
      isActive: true
    }
  });

  if (!account) {
    throw new CreditCardReconciliationSessionError(
      'Cartao de credito nao encontrado',
      'RECONCILIATION_SESSION_NOT_FOUND',
      404
    );
  }

  if (requireActive && !account.isActive) {
    throw new CreditCardReconciliationSessionError(
      'Cartao de credito inativo',
      'ACCOUNT_INACTIVE',
      409
    );
  }

  return account;
}

async function ensureTargetInvoiceIsNotPaid(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
  referenceYear: number,
  referenceMonth: number
) {
  const invoice = await db.creditCardInvoice.findUnique({
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
      paymentTransaction: {
        select: { status: true }
      }
    }
  });

  const invoiceIsSettled = Boolean(
    invoice &&
      (
        invoice.status === CreditCardInvoiceStatus.PAID ||
        invoice.settlementType !== null ||
        invoice.paymentTransaction?.status === TransactionStatus.COMPLETED
      )
  );
  if (invoiceIsSettled) {
    throw new CreditCardReconciliationSessionError(
      'Faturas liquidadas nao podem ser conciliadas',
      'SESSION_TARGET_PAID',
      409
    );
  }

  return invoice;
}

async function loadScopedSession(
  db: Prisma.TransactionClient | PrismaClient,
  context: CreditCardReconciliationSessionContext,
  sessionId: number
) {
  const session = await db.creditCardReconciliationSession.findFirst({
    where: {
      id: sessionId,
      accountId: context.accountId,
      account: {
        companyId: context.companyId,
        type: AccountType.CREDIT_CARD
      }
    }
  });

  if (!session) {
    throw new CreditCardReconciliationSessionError(
      'Sessao de conciliacao de cartao nao encontrada',
      'RECONCILIATION_SESSION_NOT_FOUND',
      404
    );
  }

  return session;
}

async function ensureMutationTarget(
  db: Prisma.TransactionClient,
  context: CreditCardReconciliationSessionContext,
  session: { referenceYear: number; referenceMonth: number }
) {
  await ensureCreditCardAccount(db, context, true);
  await ensureTargetInvoiceIsNotPaid(
    db,
    context.accountId,
    session.referenceYear,
    session.referenceMonth
  );
}

async function lockSessionEvidence(
  db: Prisma.TransactionClient,
  context: CreditCardReconciliationSessionContext,
  session: { referenceYear: number; referenceMonth: number }
) {
  const lockedAccounts = await db.$queryRaw<Array<{ id: number }>>`
    SELECT id
    FROM "FinancialAccount"
    WHERE id = ${context.accountId}
    FOR UPDATE
  `;
  if (lockedAccounts.length === 0) {
    throw new CreditCardReconciliationSessionError(
      'Cartao de credito nao encontrado',
      'RECONCILIATION_SESSION_NOT_FOUND',
      404
    );
  }

  // Reset is allowed for an inactive card, but the locked account must still
  // belong to the authenticated tenant and remain a credit-card account.
  await ensureCreditCardAccount(db, context, false);

  await db.$queryRaw<Array<{ id: number }>>`
    SELECT id
    FROM "CreditCardInvoice"
    WHERE "accountId" = ${context.accountId}
      AND "referenceYear" = ${session.referenceYear}
      AND "referenceMonth" = ${session.referenceMonth}
    FOR UPDATE
  `;
}

async function lockMutationTarget(
  db: Prisma.TransactionClient,
  context: CreditCardReconciliationSessionContext,
  session: { referenceYear: number; referenceMonth: number }
) {
  await lockSessionEvidence(db, context, session);

  await ensureMutationTarget(db, context, session);
}

function sessionDto(session: any) {
  return {
    id: session.id,
    accountId: session.accountId,
    referenceYear: session.referenceYear,
    referenceMonth: session.referenceMonth,
    sourceType: session.sourceType,
    fileName: session.fileName,
    fileHash: session.fileHash,
    status: session.status,
    revision: session.revision,
    parserVersion: session.parserVersion,
    createdBy: session.createdBy,
    updatedBy: session.updatedBy,
    completedAt: session.completedAt,
    completedBy: session.completedBy,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function progressDto(items: any[]) {
  const isTerminal = (item: any) => {
    const snapshot = item.snapshot as { canImport?: boolean } | null;
    return snapshot?.canImport === false || item.resolution !== CreditCardReconciliationItemResolution.PENDING;
  };
  const count = (resolution: CreditCardReconciliationItemResolution) =>
    items.filter((item) => item.resolution === resolution).length;

  return {
    totalCount: items.length,
    resolvedCount: items.filter(isTerminal).length,
    pendingCount: items.filter((item) => !isTerminal(item)).length,
    importedCount: count(CreditCardReconciliationItemResolution.IMPORTED),
    linkedFixedCount: count(CreditCardReconciliationItemResolution.LINKED_FIXED),
    confirmedExistingCount: count(CreditCardReconciliationItemResolution.CONFIRMED_EXISTING),
    ignoredCount: count(CreditCardReconciliationItemResolution.IGNORED)
  };
}

async function buildWorkspace(
  context: CreditCardReconciliationSessionContext,
  sessionId: number,
  allowInvalidation = true
) {
  const session = await prisma.creditCardReconciliationSession.findFirst({
    where: {
      id: sessionId,
      accountId: context.accountId,
      account: {
        companyId: context.companyId,
        type: AccountType.CREDIT_CARD
      }
    },
    include: {
      items: {
        include: {
          transactions: {
            include: {
              transaction: {
                select: {
                  id: true,
                  companyId: true,
                  fromAccountId: true,
                  type: true,
                  status: true,
                  archivedAt: true,
                  isExternalCreditCardSettlement: true,
                  installmentNumber: true,
                  totalInstallments: true,
                  amount: true,
                  date: true,
                  creditCardInvoice: {
                    select: {
                      accountId: true,
                      referenceYear: true,
                      referenceMonth: true
                    }
                  }
                }
              }
            },
            orderBy: { id: 'asc' }
          }
        },
        orderBy: { position: 'asc' }
      },
      events: {
        include: {
          item: {
            select: { sourceItemId: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      }
    }
  });

  if (!session) {
    throw new CreditCardReconciliationSessionError(
      'Sessao de conciliacao de cartao nao encontrada',
      'RECONCILIATION_SESSION_NOT_FOUND',
      404
    );
  }

  const categorySuggestionsByItemId = Object.fromEntries(
    session.items.map((item) => {
      const snapshot = item.snapshot as unknown as ReconciliationPreviewItem;
      return [item.sourceItemId, snapshot.categorySuggestion];
    })
  );
  const preview = await CreditCardStatementReconciliationService.buildPreview({
    accountId: context.accountId,
    companyId: context.companyId,
    sourceType: session.sourceType as CreditCardReconciliationSourceType,
    targetReferenceYear: session.referenceYear,
    targetReferenceMonth: session.referenceMonth,
    fileBase64: Buffer.from(session.fileData).toString('base64'),
    fileName: session.fileName,
    categorySuggestionsByItemId
  });
  const persistedBySourceId = new Map(
    session.items.map((item) => [item.sourceItemId, item])
  );
  const currentIdentityBySourceId = new Map(
    buildPersistedItemRecords(preview).map((item) => [item.sourceItemId, item.identityKey])
  );

  if (
    preview.items.length !== session.items.length ||
    preview.items.some((item) => !persistedBySourceId.has(item.id)) ||
    session.items.some(
      (item) => currentIdentityBySourceId.get(item.sourceItemId) !== item.identityKey
    )
  ) {
    throw new CreditCardReconciliationSessionError(
      'O arquivo salvo nao corresponde mais ao snapshot persistido da conciliacao',
      'SESSION_SNAPSHOT_MISMATCH',
      409,
      { currentRevision: session.revision, currentSessionId: session.id }
    );
  }

  if (allowInvalidation && await invalidateStaleResolutions(context, session, preview)) {
    return buildWorkspace(context, sessionId, false);
  }

  return {
    session: sessionDto(session),
    preview: {
      ...preview,
      items: preview.items.map((item) => {
        const persisted = persistedBySourceId.get(item.id)!;
        const terminal =
          item.canImport === false ||
          persisted.resolution !== CreditCardReconciliationItemResolution.PENDING;

        return {
          ...item,
          progress: {
            itemId: persisted.sourceItemId,
            identityKey: persisted.identityKey,
            resolution: persisted.resolution,
            resolutionData: persisted.resolutionData,
            transactionIds: persisted.transactions
              .map((link) => link.transactionId)
              .filter((id): id is number => id !== null),
            terminal,
            resolvedAt: persisted.resolvedAt,
            resolvedBy: persisted.resolvedBy
          }
        };
      })
    },
    progress: progressDto(session.items),
    events: session.events.reverse().map((event) => ({
      id: event.id,
      itemId: event.item?.sourceItemId || null,
      userId: event.userId,
      action: event.action,
      details: event.details,
      createdAt: event.createdAt
    }))
  };
}

function isOperationalTargetTransaction(
  transaction: any,
  context: CreditCardReconciliationSessionContext,
  session: { referenceYear: number; referenceMonth: number }
) {
  return Boolean(
    transaction &&
      transaction.companyId === context.companyId &&
      transaction.fromAccountId === context.accountId &&
      transaction.type === TransactionType.EXPENSE &&
      transaction.status !== TransactionStatus.CANCELED &&
      !transaction.archivedAt &&
      !transaction.isExternalCreditCardSettlement &&
      transaction.creditCardInvoice?.accountId === context.accountId &&
      transaction.creditCardInvoice?.referenceYear === session.referenceYear &&
      transaction.creditCardInvoice?.referenceMonth === session.referenceMonth
  );
}

function hasStableFinancialIdentity(link: any) {
  if (!link.transaction) {
    return false;
  }

  const snapshot = link.transactionSnapshot as any;
  const snapshotAmount = snapshot?.amount === undefined || snapshot?.amount === null
    ? null
    : String(snapshot.amount);
  const currentAmount = String(link.transaction.amount);
  const snapshotDate = snapshot?.date ? new Date(snapshot.date).toISOString() : null;
  const currentDate = link.transaction.date
    ? new Date(link.transaction.date).toISOString()
    : null;

  return (
    snapshotAmount === currentAmount &&
    snapshotDate === currentDate &&
    (snapshot?.installmentNumber ?? null) === (link.transaction.installmentNumber ?? null) &&
    (snapshot?.totalInstallments ?? null) === (link.transaction.totalInstallments ?? null)
  );
}

async function invalidateStaleResolutions(
  context: CreditCardReconciliationSessionContext,
  session: any,
  preview: ReconciliationPreviewResult
) {
  const previewById = new Map(preview.items.map((item) => [item.id, item]));
  const invalidItems = session.items.filter((item: any) => {
    if (item.resolution === CreditCardReconciliationItemResolution.CONFIRMED_EXISTING) {
      return item.transactions.length === 0 || item.transactions.some(
        (link: any) =>
          !isOperationalTargetTransaction(link.transaction, context, session) ||
          !hasStableFinancialIdentity(link)
      );
    }

    if (item.resolution === CreditCardReconciliationItemResolution.IMPORTED) {
      const snapshot = item.snapshot as ReconciliationPreviewItem;
      const anchorInstallmentNumber = snapshot.installmentNumber ?? 1;
      return !item.transactions.some((link: any) =>
        isOperationalTargetTransaction(link.transaction, context, session) &&
        hasStableFinancialIdentity(link) &&
        (link.transaction.installmentNumber ?? 1) === anchorInstallmentNumber
      );
    }

    if (item.resolution === CreditCardReconciliationItemResolution.LINKED_FIXED) {
      const current = previewById.get(item.sourceItemId);
      return !current || !(
        current.reason === 'MAPPED_FIXED' ||
        (
          current.status === 'OK' &&
          current.matchedTransactions.some((match) => match.matchSource === 'PROJECTED_FIXED')
        )
      );
    }

    return false;
  });

  if (invalidItems.length === 0) {
    return false;
  }

  return prisma.$transaction(async (tx) => {
    const current = await loadScopedSession(tx, context, session.id);
    if (current.revision !== session.revision || isLiveMutation(current)) {
      return false;
    }

    try {
      await lockMutationTarget(tx, context, current);
    } catch (error) {
      if (
        error instanceof CreditCardReconciliationSessionError &&
        (error.code === 'SESSION_TARGET_PAID' || error.code === 'ACCOUNT_INACTIVE')
      ) {
        return false;
      }
      throw error;
    }

    const updated = await tx.creditCardReconciliationSession.updateMany({
      where: revisionCasWhere(current.id, current.revision),
      data: {
        revision: { increment: 1 },
        status: CreditCardReconciliationSessionStatus.OPEN,
        completedAt: null,
        completedBy: null,
        activeMutationToken: null,
        activeMutationAt: null
      }
    });
    if (updated.count !== 1) {
      return false;
    }

    for (const invalidItem of invalidItems) {
      const reset = await tx.creditCardReconciliationItem.updateMany({
        where: {
          id: invalidItem.id,
          sessionId: current.id,
          resolution: invalidItem.resolution
        },
        data: {
          resolution: CreditCardReconciliationItemResolution.PENDING,
          resolutionData: Prisma.DbNull,
          resolvedAt: null,
          resolvedBy: null
        }
      });
      if (reset.count === 0) {
        throw new CreditCardReconciliationSessionError(
          'O andamento da conciliacao mudou durante a reavaliacao',
          'REVISION_CONFLICT',
          409,
          { currentRevision: current.revision, currentSessionId: current.id }
        );
      }
      await tx.creditCardReconciliationItemTransaction.deleteMany({
        where: { itemId: invalidItem.id }
      });
      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId: current.id,
          itemId: invalidItem.id,
          action: 'INVALIDATE',
          details: asJson({ previousResolution: invalidItem.resolution })
        }
      });
    }

    if (session.status === CreditCardReconciliationSessionStatus.COMPLETED) {
      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId: current.id,
          action: 'REOPEN',
          details: asJson({ reason: 'RESOLUTION_INVALIDATED' })
        }
      });
    }
    return true;
  });
}

async function clearMutationToken(sessionId: number, mutationToken: string, error?: unknown) {
  await prisma.$transaction(async (tx) => {
    const cleared = await tx.creditCardReconciliationSession.updateMany({
      where: {
        id: sessionId,
        activeMutationToken: mutationToken
      },
      data: {
        activeMutationToken: null,
        activeMutationAt: null
      }
    });

    if (cleared.count > 0 && error) {
      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId,
          action: 'COMMIT_FAILED',
          details: asJson({
            message: error instanceof Error ? error.message : 'Falha inesperada no commit'
          })
        }
      });
    }
  });
}

function isPrismaUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export default class CreditCardReconciliationSessionService {
  static async start(
    context: CreditCardReconciliationSessionContext,
    input: StartSessionInput
  ) {
    const fileData = decodeFile(input.fileBase64);
    const fileHash = sha256(fileData);
    const preflight = await prisma.$transaction(async (tx) => {
      await ensureCreditCardAccount(tx, context, true);
      await ensureTargetInvoiceIsNotPaid(
        tx,
        context.accountId,
        input.targetReferenceYear,
        input.targetReferenceMonth
      );
      return tx.creditCardReconciliationSession.findUnique({
        where: {
          unique_credit_card_reconciliation_session: {
            accountId: context.accountId,
            referenceYear: input.targetReferenceYear,
            referenceMonth: input.targetReferenceMonth
          }
        }
      });
    });

    if (preflight?.fileHash === fileHash && preflight.sourceType === input.sourceType) {
      return buildWorkspace(context, preflight.id);
    }

    if (preflight && !input.replace) {
      throw new CreditCardReconciliationSessionError(
        'Ja existe outro arquivo nesta conciliacao. Confirme a substituicao para continuar.',
        'SESSION_FILE_CONFLICT',
        409,
        { currentRevision: preflight.revision, currentSessionId: preflight.id }
      );
    }

    if (
      preflight &&
      (input.expectedSessionId !== preflight.id || input.expectedRevision !== preflight.revision)
    ) {
      throw new CreditCardReconciliationSessionError(
        'A sessao mudou antes da substituicao do arquivo. Atualize a tela e tente novamente.',
        'REVISION_CONFLICT',
        409,
        { currentRevision: preflight.revision, currentSessionId: preflight.id }
      );
    }

    const preview = await CreditCardStatementReconciliationService.buildPreview({
      accountId: context.accountId,
      companyId: context.companyId,
      sourceType: input.sourceType,
      targetReferenceYear: input.targetReferenceYear,
      targetReferenceMonth: input.targetReferenceMonth,
      fileBase64: fileData.toString('base64'),
      fileName: input.fileName
    });
    const itemRecords = buildInitialItemRecords(preview, context.userId);

    let sessionId: number;
    try {
      sessionId = await prisma.$transaction(async (tx) => {
        await lockMutationTarget(tx, context, {
          referenceYear: input.targetReferenceYear,
          referenceMonth: input.targetReferenceMonth
        });

        const current = await tx.creditCardReconciliationSession.findUnique({
          where: {
            unique_credit_card_reconciliation_session: {
              accountId: context.accountId,
              referenceYear: input.targetReferenceYear,
              referenceMonth: input.targetReferenceMonth
            }
          }
        });

        if (!current) {
          const created = await tx.creditCardReconciliationSession.create({
            data: {
              accountId: context.accountId,
              referenceYear: input.targetReferenceYear,
              referenceMonth: input.targetReferenceMonth,
              sourceType: input.sourceType as FinancialTransactionImportSourceType,
              fileHash,
              fileName: input.fileName,
              fileData,
              statementSnapshot: asJson(preview.statement),
              parserVersion: PARSER_VERSION,
              createdBy: context.userId,
              updatedBy: context.userId,
              items: {
                create: itemRecords
              }
            }
          });
          await tx.creditCardReconciliationEvent.create({
            data: {
              sessionId: created.id,
              userId: context.userId,
              action: 'START',
              details: asJson({ fileHash, fileName: input.fileName, itemCount: itemRecords.length })
            }
          });
          await createAutomaticResolutionEvents(
            tx,
            created.id,
            context.userId,
            itemRecords
          );
          return created.id;
        }

        if (current.fileHash === fileHash && current.sourceType === input.sourceType) {
          return current.id;
        }

        if (!input.replace) {
          throw new CreditCardReconciliationSessionError(
            'Ja existe outro arquivo nesta conciliacao. Confirme a substituicao para continuar.',
            'SESSION_FILE_CONFLICT',
            409,
            { currentRevision: current.revision, currentSessionId: current.id }
          );
        }

        if (
          input.expectedSessionId !== current.id ||
          input.expectedRevision !== current.revision
        ) {
          throw new CreditCardReconciliationSessionError(
            'A sessao mudou antes da substituicao do arquivo. Atualize a tela e tente novamente.',
            'REVISION_CONFLICT',
            409,
            { currentRevision: current.revision, currentSessionId: current.id }
          );
        }

        if (current.status !== CreditCardReconciliationSessionStatus.OPEN) {
          throw new CreditCardReconciliationSessionError(
            'Reabra a conciliacao antes de substituir o arquivo',
            'SESSION_COMPLETED',
            409,
            { currentRevision: current.revision, currentSessionId: current.id }
          );
        }
        assertNoLiveMutation(current);

        const replaced = await tx.creditCardReconciliationSession.updateMany({
          where: revisionCasWhere(current.id, current.revision),
          data: {
            sourceType: input.sourceType as FinancialTransactionImportSourceType,
            fileHash,
            fileName: input.fileName,
            fileData,
            statementSnapshot: asJson(preview.statement),
            parserVersion: PARSER_VERSION,
            revision: { increment: 1 },
            updatedBy: context.userId,
            activeMutationToken: null,
            activeMutationAt: null
          }
        });
        if (replaced.count !== 1) {
          throw new CreditCardReconciliationSessionError(
            'A conciliacao mudou durante a substituicao do arquivo.',
            'REVISION_CONFLICT',
            409,
            { currentRevision: current.revision, currentSessionId: current.id }
          );
        }

        await tx.creditCardReconciliationItem.deleteMany({ where: { sessionId: current.id } });
        await tx.creditCardReconciliationItem.createMany({
          data: itemRecords.map((item) => ({ ...item, sessionId: current.id }))
        });
        await tx.creditCardReconciliationEvent.create({
          data: {
            sessionId: current.id,
            userId: context.userId,
            action: 'REPLACE',
            details: asJson({
              previousFileHash: current.fileHash,
              fileHash,
              fileName: input.fileName,
              itemCount: itemRecords.length
            })
          }
        });
        await createAutomaticResolutionEvents(
          tx,
          current.id,
          context.userId,
          itemRecords
        );
        return current.id;
      });
    } catch (error) {
      if (!isPrismaUniqueError(error)) {
        throw error;
      }

      const concurrent = await prisma.creditCardReconciliationSession.findUnique({
        where: {
          unique_credit_card_reconciliation_session: {
            accountId: context.accountId,
            referenceYear: input.targetReferenceYear,
            referenceMonth: input.targetReferenceMonth
          }
        }
      });
      if (
        !concurrent ||
        concurrent.fileHash !== fileHash ||
        concurrent.sourceType !== input.sourceType
      ) {
        throw new CreditCardReconciliationSessionError(
          'Outra sessao ou item foi criado durante a operacao. Atualize a tela e tente novamente.',
          'SESSION_FILE_CONFLICT',
          409,
          {
            currentRevision: concurrent?.revision,
            currentSessionId: concurrent?.id
          }
        );
      }
      sessionId = concurrent.id;
    }

    return buildWorkspace(context, sessionId);
  }

  static async get(
    context: CreditCardReconciliationSessionContext,
    referenceYear: number,
    referenceMonth: number
  ) {
    await ensureCreditCardAccount(prisma, context, false);
    const session = await prisma.creditCardReconciliationSession.findUnique({
      where: {
        unique_credit_card_reconciliation_session: {
          accountId: context.accountId,
          referenceYear,
          referenceMonth
        }
      },
      select: { id: true }
    });

    if (!session) {
      return { session: null, preview: null, progress: null, events: [] };
    }

    return buildWorkspace(context, session.id);
  }

  static async commit(
    context: CreditCardReconciliationSessionContext,
    sessionId: number,
    expectedRevision: number,
    selectedItems: CommitSelection[]
  ) {
    // Reparse the persisted bytes and compare every identity key before any
    // financial effect. A concurrent replacement necessarily changes the
    // revision and is rejected by the CAS below.
    await buildWorkspace(context, sessionId);

    const mutationToken = randomUUID();
    const claimed = await prisma.$transaction(async (tx) => {
      const session = await loadScopedSession(tx, context, sessionId);
      await lockMutationTarget(tx, context, session);
      assertExpectedRevision(session, expectedRevision);
      assertNoLiveMutation(session);
      if (session.status !== CreditCardReconciliationSessionStatus.OPEN) {
        throw new CreditCardReconciliationSessionError(
          'Reabra a conciliacao antes de processar itens',
          'SESSION_COMPLETED',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      const itemIds = Array.from(new Set(selectedItems.map((item) => item.itemId)));
      if (itemIds.length !== selectedItems.length) {
        throw new Error('Itens repetidos nao sao permitidos');
      }
      const persistedItems = await tx.creditCardReconciliationItem.findMany({
        where: { sessionId, sourceItemId: { in: itemIds } }
      });
      if (persistedItems.length !== itemIds.length) {
        throw new Error('Um ou mais itens nao pertencem a esta conciliacao');
      }
      if (persistedItems.some((item) => item.resolution !== CreditCardReconciliationItemResolution.PENDING)) {
        throw new CreditCardReconciliationSessionError(
          'Um ou mais itens selecionados ja foram resolvidos',
          'ITEM_STATE_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      const updated = await tx.creditCardReconciliationSession.updateMany({
        where: {
          ...revisionCasWhere(session.id, expectedRevision),
          status: CreditCardReconciliationSessionStatus.OPEN
        },
        data: {
          updatedBy: context.userId,
          activeMutationToken: mutationToken,
          activeMutationAt: new Date()
        }
      });
      if (updated.count !== 1) {
        throw new CreditCardReconciliationSessionError(
          'A conciliacao mudou durante a operacao. Atualize a tela e tente novamente.',
          'REVISION_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId: session.id,
          userId: context.userId,
          action: 'COMMIT_STARTED',
          details: asJson({ itemIds })
        }
      });

      return {
        ...session,
        claimedRevision: expectedRevision,
        persistedItems
      };
    });

    let result: ReconciliationCommitResult;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await loadScopedSession(tx, context, sessionId);
        await lockMutationTarget(tx, context, current);
        if (
          current.activeMutationToken !== mutationToken ||
          current.revision !== claimed.claimedRevision
        ) {
          throw new CreditCardReconciliationSessionError(
            'A reserva da operacao de conciliacao nao e mais valida',
            'REVISION_CONFLICT',
            409,
            { currentRevision: current.revision, currentSessionId: current.id }
          );
        }

        const session = current;
        const persistedItems = claimed.persistedItems;

        const commitResult = await CreditCardStatementReconciliationService.commit({
          accountId: context.accountId,
          companyId: context.companyId,
          userId: context.userId,
          sourceType: session.sourceType as CreditCardReconciliationSourceType,
          targetReferenceYear: session.referenceYear,
          targetReferenceMonth: session.referenceMonth,
          fileBase64: Buffer.from(session.fileData).toString('base64'),
          fileName: session.fileName,
          selectedItems,
          allowExternalSettlement: false,
          allowPaidInvoiceSettlement: false,
          existingTx: tx,
          deferPostCommitEffects: true
        });

      const inputByItemId = new Map(selectedItems.map((item) => [item.itemId, item]));
      const persistedBySourceId = new Map(
        persistedItems.map((item) => [item.sourceItemId, item])
      );

      for (const itemResult of commitResult.results) {
        const persistedItem = persistedBySourceId.get(itemResult.itemId);
        const selectedInput = inputByItemId.get(itemResult.itemId);
        if (!persistedItem || !selectedInput) {
          throw new Error('Resultado de item nao pertence a operacao reservada');
        }

        let resolution: CreditCardReconciliationItemResolution | null = null;
        if (itemResult.status === 'CREATED') {
          resolution = CreditCardReconciliationItemResolution.IMPORTED;
        } else if (itemResult.status === 'LINKED_FIXED') {
          resolution = CreditCardReconciliationItemResolution.LINKED_FIXED;
        } else if (
          itemResult.status === 'SKIPPED_DUPLICATE' &&
          selectedInput.action === 'LINK_FIXED'
        ) {
          // LINK_FIXED can race with another request that persisted the same
          // alias first. The durable alias is already the intended outcome,
          // so this result is terminal and idempotent for the session item.
          resolution = CreditCardReconciliationItemResolution.LINKED_FIXED;
        }

        if (resolution) {
          const resolvedAt = new Date();
          await tx.creditCardReconciliationItem.update({
            where: { id: persistedItem.id },
            data: {
              resolution,
              resolutionData: asJson({
                action: selectedInput.action || 'IMPORT',
                mode: itemResult.status === 'SKIPPED_DUPLICATE'
                  ? 'ALREADY_MAPPED'
                  : null,
                description: selectedInput.description || null,
                categoryId: selectedInput.categoryId || null,
                transactionIds: itemResult.createdTransactionIds
              }),
              resolvedAt,
              resolvedBy: context.userId
            }
          });

          if (
            resolution === CreditCardReconciliationItemResolution.IMPORTED &&
            itemResult.createdTransactionIds.length > 0
          ) {
            const transactions = await tx.financialTransaction.findMany({
              where: {
                id: { in: itemResult.createdTransactionIds },
                companyId: context.companyId,
                fromAccountId: context.accountId
              },
              include: {
                creditCardInvoice: {
                  select: {
                    accountId: true,
                    referenceYear: true,
                    referenceMonth: true
                  }
                }
              }
            });
            if (transactions.length !== itemResult.createdTransactionIds.length) {
              throw new Error('Lancamento criado nao pode ser vinculado ao item da conciliacao');
            }

            const itemSnapshot = persistedItem.snapshot as unknown as ReconciliationPreviewItem;
            const anchorInstallmentNumber = itemSnapshot.installmentNumber ?? 1;
            const anchorTransactions = transactions.filter((transaction) =>
              transaction.creditCardInvoice?.accountId === context.accountId &&
              transaction.creditCardInvoice?.referenceYear === session.referenceYear &&
              transaction.creditCardInvoice?.referenceMonth === session.referenceMonth &&
              (transaction.installmentNumber ?? 1) === anchorInstallmentNumber
            );
            if (anchorTransactions.length !== 1) {
              throw new Error(
                'Nao foi possivel identificar a parcela ancora criada para esta conciliacao'
              );
            }

            const anchorTransaction = anchorTransactions[0]!;
            await tx.creditCardReconciliationItemTransaction.create({
              data: {
                itemId: persistedItem.id,
                transactionId: anchorTransaction.id,
                transactionSnapshot: asJson(anchorTransaction)
              }
            });
          }
        }

        await tx.creditCardReconciliationEvent.create({
          data: {
            sessionId,
            itemId: persistedItem.id,
            userId: context.userId,
            action: resolution || 'COMMIT_RESULT',
            details: asJson({
              resultStatus: itemResult.status,
              message: itemResult.message,
              createdTransactionIds: itemResult.createdTransactionIds
            })
          }
        });
      }

      const finalized = await tx.creditCardReconciliationSession.updateMany({
        where: {
          id: sessionId,
          revision: claimed.claimedRevision,
          activeMutationToken: mutationToken
        },
        data: {
          revision: { increment: 1 },
          updatedBy: context.userId,
          activeMutationToken: null,
          activeMutationAt: null
        }
      });
      if (finalized.count !== 1) {
        throw new CreditCardReconciliationSessionError(
          'A reserva da operacao de conciliacao nao e mais valida',
          'REVISION_CONFLICT',
          409,
          { currentRevision: current.revision, currentSessionId: current.id }
        );
      }

      return commitResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 120000,
      maxWait: 10000
    });
    } catch (error) {
      await clearMutationToken(sessionId, mutationToken, error);
      throw error;
    }

    await FinancialTransactionService.publishDeferredCommitEffects({
      companyId: context.companyId,
      accountIds: [context.accountId],
      transactionIds: result.results.flatMap((item) => item.createdTransactionIds),
      operation: 'CREDIT_CARD_RECONCILIATION'
    });

    return {
      ...(await buildWorkspace(context, sessionId)),
      commitResult: result
    };
  }

  static async decide(
    context: CreditCardReconciliationSessionContext,
    sessionId: number,
    sourceItemId: string,
    input: ItemDecisionInput
  ) {
    await prisma.$transaction(async (tx) => {
      const session = await loadScopedSession(tx, context, sessionId);
      await lockMutationTarget(tx, context, session);
      assertExpectedRevision(session, input.expectedRevision);
      assertNoLiveMutation(session);
      if (session.status !== CreditCardReconciliationSessionStatus.OPEN) {
        throw new CreditCardReconciliationSessionError(
          'Reabra a conciliacao antes de alterar itens',
          'SESSION_COMPLETED',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      const item = await tx.creditCardReconciliationItem.findUnique({
        where: {
          unique_credit_card_reconciliation_source_item: {
            sessionId,
            sourceItemId
          }
        },
        include: { transactions: true }
      });
      if (!item) {
        throw new CreditCardReconciliationSessionError(
          'Item da conciliacao nao encontrado',
          'RECONCILIATION_SESSION_NOT_FOUND',
          404
        );
      }

      if (input.decision === 'RESTORE') {
        if (item.resolution !== CreditCardReconciliationItemResolution.IGNORED) {
          throw new CreditCardReconciliationSessionError(
            'Somente itens ignorados podem voltar para conferencia',
            'ITEM_STATE_CONFLICT',
            409,
            { currentRevision: session.revision, currentSessionId: session.id }
          );
        }
      } else if (item.resolution !== CreditCardReconciliationItemResolution.PENDING) {
        throw new CreditCardReconciliationSessionError(
          'Este item ja foi resolvido',
          'ITEM_STATE_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      let transactions: any[] = [];
      if (input.decision === 'CONFIRM_EXISTING') {
        const transactionIds = Array.from(new Set(input.transactionIds || []));
        transactions = await tx.financialTransaction.findMany({
          where: {
            id: { in: transactionIds },
            companyId: context.companyId,
            fromAccountId: context.accountId,
            type: TransactionType.EXPENSE,
            status: { not: TransactionStatus.CANCELED },
            archivedAt: null,
            isExternalCreditCardSettlement: false,
            creditCardInvoice: {
              accountId: context.accountId,
              referenceYear: session.referenceYear,
              referenceMonth: session.referenceMonth
            }
          }
        });
        if (transactions.length !== transactionIds.length) {
          throw new Error(
            'Selecione apenas lancamentos reais, ativos e pertencentes a fatura desta conciliacao'
          );
        }

        const claimedElsewhere = await tx.creditCardReconciliationItemTransaction.findFirst({
          where: {
            transactionId: { in: transactionIds },
            itemId: { not: item.id }
          }
        });
        if (claimedElsewhere) {
          throw new CreditCardReconciliationSessionError(
            'Um dos lancamentos ja foi confirmado em outro item de conciliacao',
            'TRANSACTION_ALREADY_CLAIMED',
            409,
            { currentRevision: session.revision, currentSessionId: session.id }
          );
        }
      }

      const updated = await tx.creditCardReconciliationSession.updateMany({
        where: revisionCasWhere(session.id, input.expectedRevision),
        data: {
          revision: { increment: 1 },
          updatedBy: context.userId,
          activeMutationToken: null,
          activeMutationAt: null
        }
      });
      if (updated.count !== 1) {
        throw new CreditCardReconciliationSessionError(
          'A conciliacao mudou durante a operacao. Atualize a tela e tente novamente.',
          'REVISION_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      if (input.decision === 'RESTORE') {
        await tx.creditCardReconciliationItemTransaction.deleteMany({ where: { itemId: item.id } });
        await tx.creditCardReconciliationItem.update({
          where: { id: item.id },
          data: {
            resolution: CreditCardReconciliationItemResolution.PENDING,
            resolutionData: Prisma.DbNull,
            resolvedAt: null,
            resolvedBy: null
          }
        });
      } else {
        const resolution = input.decision === 'IGNORE'
          ? CreditCardReconciliationItemResolution.IGNORED
          : CreditCardReconciliationItemResolution.CONFIRMED_EXISTING;
        await tx.creditCardReconciliationItem.update({
          where: { id: item.id },
          data: {
            resolution,
            resolutionData: asJson({ transactionIds: transactions.map((transaction) => transaction.id) }),
            resolvedAt: new Date(),
            resolvedBy: context.userId
          }
        });

        for (const transaction of transactions) {
          await tx.creditCardReconciliationItemTransaction.create({
            data: {
              itemId: item.id,
              transactionId: transaction.id,
              transactionSnapshot: asJson(transaction)
            }
          });
        }
      }

      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId,
          itemId: item.id,
          userId: context.userId,
          action: input.decision,
          details: asJson({ transactionIds: transactions.map((transaction) => transaction.id) })
        }
      });
    }).catch((error) => {
      if (isPrismaUniqueError(error)) {
        throw new CreditCardReconciliationSessionError(
          'Um dos lancamentos ja foi confirmado em outro item de conciliacao',
          'TRANSACTION_ALREADY_CLAIMED',
          409
        );
      }
      throw error;
    });

    return buildWorkspace(context, sessionId);
  }

  static async updateStatus(
    context: CreditCardReconciliationSessionContext,
    sessionId: number,
    expectedRevision: number,
    status: 'OPEN' | 'COMPLETED'
  ) {
    await prisma.$transaction(async (tx) => {
      const session = await loadScopedSession(tx, context, sessionId);
      await lockMutationTarget(tx, context, session);
      assertExpectedRevision(session, expectedRevision);
      assertNoLiveMutation(session);

      const nextStatus = status as CreditCardReconciliationSessionStatus;
      if (session.status === nextStatus) {
        return;
      }

      if (nextStatus === CreditCardReconciliationSessionStatus.COMPLETED) {
        const items = await tx.creditCardReconciliationItem.findMany({
          where: { sessionId },
          select: { resolution: true, snapshot: true }
        });
        const unresolvedImportable = items.filter((item) => {
          const snapshot = item.snapshot as { canImport?: boolean } | null;
          return snapshot?.canImport !== false &&
            item.resolution === CreditCardReconciliationItemResolution.PENDING;
        });
        if (unresolvedImportable.length > 0) {
          throw new Error(
            `Resolva ou ignore os ${unresolvedImportable.length} item(ns) importavel(is) pendente(s) antes de concluir`
          );
        }
      }

      const updated = await tx.creditCardReconciliationSession.updateMany({
        where: revisionCasWhere(session.id, expectedRevision),
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          updatedBy: context.userId,
          completedAt: nextStatus === CreditCardReconciliationSessionStatus.COMPLETED
            ? new Date()
            : null,
          completedBy: nextStatus === CreditCardReconciliationSessionStatus.COMPLETED
            ? context.userId
            : null,
          activeMutationToken: null,
          activeMutationAt: null
        }
      });
      if (updated.count !== 1) {
        throw new CreditCardReconciliationSessionError(
          'A conciliacao mudou durante a operacao. Atualize a tela e tente novamente.',
          'REVISION_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      await tx.creditCardReconciliationEvent.create({
        data: {
          sessionId,
          userId: context.userId,
          action: nextStatus === CreditCardReconciliationSessionStatus.COMPLETED
            ? 'COMPLETE'
            : 'REOPEN'
        }
      });
    });

    return buildWorkspace(context, sessionId);
  }

  static async reset(
    context: CreditCardReconciliationSessionContext,
    sessionId: number,
    expectedRevision: number
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const session = await loadScopedSession(tx, context, sessionId);
      await lockSessionEvidence(tx, context, session);
      assertExpectedRevision(session, expectedRevision);
      assertNoLiveMutation(session);
      if (session.status !== CreditCardReconciliationSessionStatus.OPEN) {
        throw new CreditCardReconciliationSessionError(
          'Nao e possivel reiniciar uma conciliacao concluida',
          'SESSION_COMPLETED',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      const deleted = await tx.creditCardReconciliationSession.deleteMany({
        where: revisionCasWhere(session.id, expectedRevision)
      });
      if (deleted.count !== 1) {
        throw new CreditCardReconciliationSessionError(
          'A conciliacao mudou durante a operacao. Atualize a tela e tente novamente.',
          'REVISION_CONFLICT',
          409,
          { currentRevision: session.revision, currentSessionId: session.id }
        );
      }

      return {
        reset: true as const,
        referenceYear: session.referenceYear,
        referenceMonth: session.referenceMonth
      };
    });

    return result;
  }
}

export const __private__ = {
  buildPersistedItemRecords,
  decodeFile,
  itemIdentitySeed,
  progressDto,
  sha256
};
