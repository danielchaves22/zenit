import {
  CreditCardInvoiceStatus,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import CreditCardReconciliationCategorySuggestionService from '../../src/services/credit-card-reconciliation-category-suggestion.service';
import CreditCardInvoiceService from '../../src/services/credit-card-invoice.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import CreditCardReconciliationSessionService, {
  CreditCardReconciliationSessionError,
  type CreditCardReconciliationSessionContext
} from '../../src/services/credit-card-reconciliation-session.service';
import CreditCardStatementReconciliationService from '../../src/services/credit-card-statement-reconciliation.service';

jest.mock('../../src/services/cache.service', () => ({
  __esModule: true,
  default: {
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getAccountBalanceKey: (id: number) => String(id)
  }
}));

jest.mock('../../src/services/credit-card-reconciliation-category-suggestion.service', () => ({
  __esModule: true,
  default: {
    suggestForItems: jest.fn(async ({ items }: { items: Array<{ id: string }> }) =>
      new Map(items.map((item) => [item.id, {
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        categoryIcon: null,
        source: null,
        reason: null
      }]))
    )
  }
}));

const prisma = new PrismaClient();

function nubankFile(rows: Array<[string, string, string]>) {
  return Buffer.from([
    'date,title,amount',
    ...rows.map(([date, title, amount]) => `${date},${title},"${amount}"`)
  ].join('\n')).toString('base64');
}

describe('Credit-card reconciliation persisted sessions', () => {
  let companyId: number;
  let userId: number;
  let accountId: number;
  let categoryId: number;
  let context: CreditCardReconciliationSessionContext;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Credit-card reconciliation session test',
        code: Number(`6${String(Date.now()).slice(-7)}`)
      }
    });
    companyId = company.id;
    const user = await prisma.user.create({
      data: {
        name: 'Card reconciler',
        email: `card-reconciliation-${Date.now()}@test.invalid`,
        password: 'not-a-real-password',
        role: 'ADMIN'
      }
    });
    userId = user.id;
  });

  beforeEach(async () => {
    jest.mocked(CreditCardReconciliationCategorySuggestionService.suggestForItems).mockClear();
    await prisma.creditCardReconciliationSession.deleteMany({
      where: { account: { companyId } }
    });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });

    const account = await prisma.financialAccount.create({
      data: {
        name: `Nubank card ${Date.now()}`,
        type: 'CREDIT_CARD',
        balance: 0,
        creditLimit: 5000,
        statementClosingDay: 10,
        statementDueDay: 15,
        bankName: 'Nubank',
        bankCode: 'NUBANK',
        companyId
      }
    });
    accountId = account.id;
    categoryId = (await prisma.financialCategory.create({
      data: { name: 'Compras', type: 'EXPENSE', companyId }
    })).id;
    context = { accountId, companyId, userId };
  });

  afterAll(async () => {
    await prisma.creditCardReconciliationSession.deleteMany({
      where: { account: { companyId } }
    });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('starts once per invoice, resumes the same hash without AI or revision changes, and replaces by exact CAS', async () => {
    const originalFile = nubankFile([['2026-08-05', 'Mercado', '45,90']]);
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: originalFile,
      fileName: 'original.csv'
    });
    expect(started.session).toMatchObject({ revision: 1, status: 'OPEN' });
    expect(started.progress).toMatchObject({ totalCount: 1, pendingCount: 1 });
    expect(CreditCardReconciliationCategorySuggestionService.suggestForItems).toHaveBeenCalledTimes(1);

    const ignored = await CreditCardReconciliationSessionService.decide(
      context,
      started.session.id,
      started.preview.items[0].id,
      { expectedRevision: 1, decision: 'IGNORE' }
    );
    expect(ignored.session.revision).toBe(2);
    expect(ignored.progress).toMatchObject({ ignoredCount: 1, pendingCount: 0 });

    const replay = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: originalFile,
      fileName: 'renamed.csv'
    });
    expect(replay.session).toMatchObject({ id: started.session.id, revision: 2, fileName: 'original.csv' });
    expect(replay.progress.ignoredCount).toBe(1);
    expect(CreditCardReconciliationCategorySuggestionService.suggestForItems).toHaveBeenCalledTimes(1);

    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'BRADESCO_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: originalFile,
      fileName: 'same-bytes-other-source.csv'
    })).rejects.toMatchObject({ code: 'SESSION_FILE_CONFLICT' });

    const replacementFile = nubankFile([['2026-08-06', 'Farmacia', '20,00']]);
    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: replacementFile,
      fileName: 'replacement.csv'
    })).rejects.toMatchObject({ code: 'SESSION_FILE_CONFLICT' });

    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: replacementFile,
      fileName: 'replacement.csv',
      replace: true,
      expectedSessionId: started.session.id + 1,
      expectedRevision: 2
    })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    const replaced = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: replacementFile,
      fileName: 'replacement.csv',
      replace: true,
      expectedSessionId: started.session.id,
      expectedRevision: 2
    });
    expect(replaced.session).toMatchObject({ id: started.session.id, revision: 3, fileName: 'replacement.csv' });
    expect(replaced.progress).toMatchObject({ ignoredCount: 0, pendingCount: 1 });
  });

  it('persists imported progress, enforces revision CAS, completes and resets without deleting financial transactions', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'invoice.csv'
    });
    const itemId = started.preview.items[0].id;
    const committed = await CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      1,
      [{ itemId, action: 'IMPORT', description: 'Mercado', categoryId }]
    );
    expect(committed.session.revision).toBe(2);
    expect(committed.commitResult.summary).toMatchObject({ createdCount: 1, failedCount: 0 });
    expect(committed.progress).toMatchObject({ importedCount: 1, pendingCount: 0 });

    const closedInvoice = await prisma.creditCardInvoice.findUnique({
      where: {
        unique_credit_card_invoice_reference: {
          accountId,
          referenceYear: 2026,
          referenceMonth: 8
        }
      }
    });
    expect(closedInvoice).toMatchObject({ status: 'CLOSED', settlementType: null });
    const importedTransaction = await prisma.financialTransaction.findFirstOrThrow({
      where: { companyId, fromAccountId: accountId }
    });
    expect(importedTransaction.isExternalCreditCardSettlement).toBe(false);

    await expect(CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      1,
      [{ itemId, action: 'IMPORT', description: 'Mercado', categoryId }]
    )).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    const resumed = await CreditCardReconciliationSessionService.get(context, 2026, 8);
    expect(resumed.session?.revision).toBe(2);
    expect(resumed.preview?.items[0].progress.resolution).toBe('IMPORTED');

    const completed = await CreditCardReconciliationSessionService.updateStatus(
      context,
      started.session.id,
      2,
      'COMPLETED'
    );
    expect(completed.session).toMatchObject({ status: 'COMPLETED', revision: 3 });
    await expect(CreditCardReconciliationSessionService.reset(
      context,
      started.session.id,
      3
    )).rejects.toMatchObject({ code: 'SESSION_COMPLETED' });

    const reopened = await CreditCardReconciliationSessionService.updateStatus(
      context,
      started.session.id,
      3,
      'OPEN'
    );
    const transactionCount = await prisma.financialTransaction.count({ where: { companyId } });
    const reset = await CreditCardReconciliationSessionService.reset(
      context,
      started.session.id,
      reopened.session.revision
    );
    expect(reset).toEqual({ reset: true, referenceYear: 2026, referenceMonth: 8 });
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(transactionCount);
    expect((await CreditCardReconciliationSessionService.get(context, 2026, 8)).session).toBeNull();
  });

  it('resets OPEN evidence after the card becomes inactive and the target becomes settled', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'reset-after-settlement.csv'
    });
    await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.PAID,
        settlementType: 'EXTERNAL',
        settledAt: new Date('2026-08-15T12:00:00.000Z'),
        totalAmount: 0
      }
    });
    await prisma.financialAccount.update({
      where: { id: accountId },
      data: { isActive: false }
    });

    const reset = await CreditCardReconciliationSessionService.reset(
      context,
      started.session.id,
      started.session.revision
    );
    expect(reset).toEqual({ reset: true, referenceYear: 2026, referenceMonth: 8 });
    expect(await prisma.creditCardReconciliationSession.findUnique({
      where: { id: started.session.id }
    })).toBeNull();
    expect(await prisma.creditCardInvoice.count({ where: { accountId } })).toBe(1);
  });

  it('rejects a snapshot identity mismatch before reserving or creating financial effects', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'snapshot.csv'
    });
    await prisma.creditCardReconciliationItem.update({
      where: {
        unique_credit_card_reconciliation_source_item: {
          sessionId: started.session.id,
          sourceItemId: started.preview.items[0].id
        }
      },
      data: { identityKey: '0'.repeat(64) }
    });

    await expect(CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      started.session.revision,
      [{
        itemId: started.preview.items[0].id,
        description: 'Mercado',
        categoryId
      }]
    )).rejects.toMatchObject({ code: 'SESSION_SNAPSHOT_MISMATCH' });

    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    const persisted = await prisma.creditCardReconciliationSession.findUniqueOrThrow({
      where: { id: started.session.id }
    });
    expect(persisted).toMatchObject({ revision: started.session.revision });
    expect(persisted.activeMutationToken).toBeNull();
  });

  it('confirms only real target-invoice transactions, claims each transaction once, and restores ignored items', async () => {
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.OPEN,
        totalAmount: 30
      }
    });
    const existing = await prisma.financialTransaction.create({
      data: {
        description: 'Existente',
        amount: 10,
        date: new Date('2026-08-04T12:00:00.000Z'),
        effectiveDate: new Date('2026-08-04T12:00:00.000Z'),
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        fromAccountId: accountId,
        creditCardInvoiceId: invoice.id,
        categoryId,
        companyId,
        createdBy: userId
      }
    });
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([
        ['2026-08-04', 'Existente', '10,00'],
        ['2026-08-05', 'Outro', '20,00']
      ]),
      fileName: 'two.csv'
    });
    const [first, second] = started.preview.items;
    const confirmed = await CreditCardReconciliationSessionService.decide(
      context,
      started.session.id,
      first.id,
      { expectedRevision: 1, decision: 'CONFIRM_EXISTING', transactionIds: [existing.id] }
    );
    expect(confirmed.progress.confirmedExistingCount).toBe(1);

    await expect(CreditCardReconciliationSessionService.decide(
      context,
      started.session.id,
      second.id,
      { expectedRevision: 2, decision: 'CONFIRM_EXISTING', transactionIds: [existing.id] }
    )).rejects.toMatchObject({ code: 'TRANSACTION_ALREADY_CLAIMED' });

    const ignored = await CreditCardReconciliationSessionService.decide(
      context,
      started.session.id,
      second.id,
      { expectedRevision: 2, decision: 'IGNORE' }
    );
    expect(ignored.progress).toMatchObject({ confirmedExistingCount: 1, ignoredCount: 1, pendingCount: 0 });
    const restored = await CreditCardReconciliationSessionService.decide(
      context,
      started.session.id,
      second.id,
      { expectedRevision: 3, decision: 'RESTORE' }
    );
    expect(restored.progress).toMatchObject({ ignoredCount: 0, pendingCount: 1 });
  });

  it('reopens a completed session when a linked financial transaction is materially changed', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'invoice.csv'
    });
    const committed = await CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      1,
      [{ itemId: started.preview.items[0].id, description: 'Mercado', categoryId }]
    );
    const completed = await CreditCardReconciliationSessionService.updateStatus(
      context,
      started.session.id,
      committed.session.revision,
      'COMPLETED'
    );
    const transactionId = completed.preview.items[0].progress.transactionIds[0];
    await prisma.financialTransaction.update({
      where: { id: transactionId },
      data: { amount: 46 }
    });

    const invalidated = await CreditCardReconciliationSessionService.get(context, 2026, 8);
    expect(invalidated.session).toMatchObject({ status: 'OPEN', revision: 4 });
    expect(invalidated.preview?.items[0].progress.resolution).toBe('PENDING');
    expect(invalidated.events.some((event) => event.action === 'INVALIDATE')).toBe(true);
  });

  it('rejects paid targets and scopes every lookup to the authenticated company and card', async () => {
    await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.PAID,
        totalAmount: 0
      }
    });
    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'paid.csv'
    })).rejects.toMatchObject({ code: 'SESSION_TARGET_PAID' });

    await expect(CreditCardReconciliationSessionService.get(
      { ...context, companyId: companyId + 999999 },
      2026,
      8
    )).rejects.toBeInstanceOf(CreditCardReconciliationSessionError);
  });

  it('rejects every persisted settlement signal even when invoice status says CLOSED', async () => {
    await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.CLOSED,
        settlementType: 'EXTERNAL',
        settledAt: new Date('2026-08-15T12:00:00.000Z'),
        totalAmount: 0
      }
    });

    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'settled-status-mismatch.csv'
    })).rejects.toMatchObject({ code: 'SESSION_TARGET_PAID' });
  });

  it('rejects a completed payment link even when status and settlement type are inconsistent', async () => {
    const payer = await prisma.financialAccount.create({
      data: {
        name: 'Conta pagadora inconsistente',
        type: 'CHECKING',
        balance: 1000,
        companyId
      }
    });
    const payment = await prisma.financialTransaction.create({
      data: {
        description: 'Pagamento persistido',
        amount: 50,
        date: new Date('2026-08-15T12:00:00.000Z'),
        effectiveDate: new Date('2026-08-15T12:00:00.000Z'),
        type: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        fromAccountId: payer.id,
        toAccountId: accountId,
        companyId,
        createdBy: userId
      }
    });
    await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.CLOSED,
        settlementType: null,
        paymentTransactionId: payment.id,
        totalAmount: 50
      }
    });

    await expect(CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'paid-link-status-mismatch.csv'
    })).rejects.toMatchObject({ code: 'SESSION_TARGET_PAID' });
  });

  it('automatically persists a unique projected fixed match as terminal progress', async () => {
    const fixedPreview = {
      statement: {
        sourceType: 'NUBANK_CSV',
        fileName: 'fixed.csv',
        dueDate: '2026-08-15T12:00:00.000Z',
        totalAmount: '25',
        parsedNetAmount: '25',
        referenceYear: 2026,
        referenceMonth: 8
      },
      summary: {
        totalItems: 1,
        okCount: 1,
        similarCount: 0,
        pendingCount: 0,
        notImportableCount: 0,
        importableCount: 1,
        importableAmount: '25',
        okAmount: '25',
        similarAmount: '0',
        pendingAmount: '0',
        notImportableAmount: '0'
      },
      items: [{
        id: 'item-0001',
        sequence: 1,
        status: 'OK',
        reason: 'EXACT',
        kind: 'PURCHASE',
        direction: 'DEBIT',
        amount: '25',
        signedAmount: '25',
        purchaseDate: '2026-08-05T12:00:00.000Z',
        datePrecision: 'PURCHASE_DATE',
        installmentNumber: null,
        totalInstallments: null,
        sourceDescription: 'Assinatura',
        sourceSection: 'PURCHASES',
        cardSuffix: null,
        canImport: true,
        nonImportableReason: null,
        categorySuggestion: {
          categoryId: null,
          categoryName: null,
          categoryColor: null,
          categoryIcon: null,
          source: null,
          reason: null
        },
        matchedTransactions: [{
          matchKey: 'fixed:77:2026-08',
          matchSource: 'PROJECTED_FIXED',
          id: null,
          fixedTemplateId: 77,
          occurrenceKey: '2026-08',
          description: 'Assinatura',
          amount: '25',
          date: '2026-08-05T12:00:00.000Z',
          status: 'PENDING',
          installmentNumber: null,
          totalInstallments: null,
          purchaseGroupId: null,
          invoiceReference: '08/2026',
          invoiceStatus: 'OPEN'
        }]
      }]
    } as any;
    const previewSpy = jest.spyOn(
      CreditCardStatementReconciliationService,
      'buildPreview'
    ).mockResolvedValue(fixedPreview);

    try {
      const started = await CreditCardReconciliationSessionService.start(context, {
        sourceType: 'NUBANK_CSV',
        targetReferenceYear: 2026,
        targetReferenceMonth: 8,
        fileBase64: nubankFile([['2026-08-05', 'Assinatura', '25,00']]),
        fileName: 'fixed.csv'
      });

      expect(started.progress).toMatchObject({ linkedFixedCount: 1, pendingCount: 0 });
      expect(started.preview.items[0].progress).toMatchObject({
        resolution: 'LINKED_FIXED',
        terminal: true,
        resolutionData: {
          mode: 'PROJECTED_MATCH',
          fixedTemplateId: 77
        }
      });
      expect(started.events.some((event: any) => event.action === 'AUTO_LINK_FIXED')).toBe(true);
    } finally {
      previewSpy.mockRestore();
    }
  });

  it('treats an already-mapped LINK_FIXED race as terminal and idempotent', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Assinatura', '25,00']]),
      fileName: 'fixed-race.csv'
    });
    const fixedPreview = {
      ...started.preview,
      items: [{
        ...started.preview.items[0],
        status: 'OK',
        reason: 'MAPPED_FIXED',
        matchedTransactions: [{
          matchKey: 'fixed:88:2026-08',
          matchSource: 'PROJECTED_FIXED',
          id: null,
          fixedTemplateId: 88,
          occurrenceKey: '2026-08',
          description: 'Assinatura',
          amount: '25',
          date: '2026-08-05T12:00:00.000Z',
          status: 'PENDING',
          installmentNumber: null,
          totalInstallments: null,
          purchaseGroupId: null,
          invoiceReference: '08/2026',
          invoiceStatus: 'OPEN'
        }]
      }]
    } as any;
    const previewSpy = jest.spyOn(
      CreditCardStatementReconciliationService,
      'buildPreview'
    ).mockResolvedValue(fixedPreview);
    const commitSpy = jest.spyOn(
      CreditCardStatementReconciliationService,
      'commit'
    ).mockResolvedValue({
      statement: fixedPreview.statement,
      summary: {
        selectedCount: 1,
        createdCount: 0,
        linkedFixedCount: 0,
        skippedDuplicateCount: 1,
        skippedNotImportableCount: 0,
        failedCount: 0
      },
      results: [{
        itemId: started.preview.items[0].id,
        status: 'SKIPPED_DUPLICATE',
        message: 'Descricao ja vinculada',
        createdTransactionIds: []
      }]
    });

    try {
      const committed = await CreditCardReconciliationSessionService.commit(
        context,
        started.session.id,
        started.session.revision,
        [{ itemId: started.preview.items[0].id, action: 'LINK_FIXED' }]
      );
      expect(committed.progress).toMatchObject({ linkedFixedCount: 1, pendingCount: 0 });
      expect(committed.preview.items[0].progress.resolutionData).toMatchObject({
        mode: 'ALREADY_MAPPED'
      });
    } finally {
      commitSpy.mockRestore();
      previewSpy.mockRestore();
    }
  });

  it('claims only the target anchor of an imported installment group', async () => {
    const first = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-06-05', 'Notebook - Parcela 3/5', '100,00']]),
      fileName: 'installment-3.csv'
    });
    const committed = await CreditCardReconciliationSessionService.commit(
      context,
      first.session.id,
      first.session.revision,
      [{
        itemId: first.preview.items[0].id,
        action: 'IMPORT',
        description: 'Notebook',
        categoryId
      }]
    );
    const createdTransactionIds = committed.commitResult.results[0].createdTransactionIds;
    expect(createdTransactionIds).toHaveLength(5);

    const claims = await prisma.creditCardReconciliationItemTransaction.findMany({
      where: { transactionId: { in: createdTransactionIds } },
      include: { transaction: true }
    });
    expect(claims).toHaveLength(1);
    expect(claims[0].transaction?.installmentNumber).toBe(3);

    const fourthInstallment = await prisma.financialTransaction.findFirstOrThrow({
      where: {
        id: { in: createdTransactionIds },
        installmentNumber: 4
      }
    });
    const second = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 9,
      fileBase64: nubankFile([['2026-06-05', 'Notebook - Parcela 4/5', '100,00']]),
      fileName: 'installment-4.csv'
    });
    const confirmed = await CreditCardReconciliationSessionService.decide(
      context,
      second.session.id,
      second.preview.items[0].id,
      {
        expectedRevision: second.session.revision,
        decision: 'CONFIRM_EXISTING',
        transactionIds: [fourthInstallment.id]
      }
    );
    expect(confirmed.progress).toMatchObject({ confirmedExistingCount: 1, pendingCount: 0 });
  });

  it('rolls back earlier installments and the checkpoint when a later installment fails', async () => {
    const publishSpy = jest.spyOn(
      FinancialTransactionService,
      'publishDeferredCommitEffects'
    );
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-06-05', 'Notebook - Parcela 3/5', '100,00']]),
      fileName: 'atomic-installment.csv'
    });
    const futureSettledInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 9,
        closingDate: new Date('2026-09-10T12:00:00.000Z'),
        dueDate: new Date('2026-09-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.PAID,
        settlementType: 'EXTERNAL',
        settledAt: new Date('2026-09-15T12:00:00.000Z'),
        totalAmount: 0
      }
    });

    await expect(CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      started.session.revision,
      [{
        itemId: started.preview.items[0].id,
        action: 'IMPORT',
        description: 'Notebook',
        categoryId
      }]
    )).rejects.toThrow('fatura selecionada ja esta paga');

    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    expect(await prisma.creditCardInvoice.count({ where: { accountId } })).toBe(1);
    const afterRollback = await CreditCardReconciliationSessionService.get(context, 2026, 8);
    expect(afterRollback.session).toMatchObject({
      revision: started.session.revision,
      status: 'OPEN'
    });
    expect(afterRollback.preview?.items[0].progress.resolution).toBe('PENDING');
    expect(afterRollback.events.some((event) => event.action === 'COMMIT_FAILED')).toBe(true);
    expect(publishSpy).not.toHaveBeenCalled();

    await prisma.creditCardInvoice.update({
      where: { id: futureSettledInvoice.id },
      data: {
        status: CreditCardInvoiceStatus.CLOSED,
        settlementType: null,
        settledAt: null
      }
    });
    const retried = await CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      started.session.revision,
      [{
        itemId: started.preview.items[0].id,
        action: 'IMPORT',
        description: 'Notebook',
        categoryId
      }]
    );
    expect(retried.commitResult.summary.createdCount).toBe(1);
    expect(retried.commitResult.results[0].createdTransactionIds).toHaveLength(5);
    expect(retried.progress).toMatchObject({ importedCount: 1, pendingCount: 0 });
    expect(publishSpy).toHaveBeenCalledTimes(1);
    publishSpy.mockRestore();
  });

  it('rejects commit when the target becomes paid after the session starts', async () => {
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-05', 'Mercado', '45,90']]),
      fileName: 'paid-after-start.csv'
    });
    await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.PAID,
        totalAmount: 0
      }
    });

    await expect(CreditCardReconciliationSessionService.commit(
      context,
      started.session.id,
      started.session.revision,
      [{
        itemId: started.preview.items[0].id,
        description: 'Mercado',
        categoryId
      }]
    )).rejects.toMatchObject({ code: 'SESSION_TARGET_PAID' });
  });

  it('blocks invoice payment while a reconciliation commit token is active', async () => {
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId,
        referenceYear: 2026,
        referenceMonth: 8,
        closingDate: new Date('2026-08-10T12:00:00.000Z'),
        dueDate: new Date('2026-08-15T12:00:00.000Z'),
        status: CreditCardInvoiceStatus.CLOSED,
        totalAmount: 50
      }
    });
    await prisma.financialTransaction.create({
      data: {
        description: 'Compra da fatura',
        amount: 50,
        date: new Date('2026-08-04T12:00:00.000Z'),
        effectiveDate: new Date('2026-08-04T12:00:00.000Z'),
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        fromAccountId: accountId,
        creditCardInvoiceId: invoice.id,
        categoryId,
        companyId,
        createdBy: userId
      }
    });
    const payer = await prisma.financialAccount.create({
      data: {
        name: 'Conta pagadora',
        type: 'CHECKING',
        balance: 1000,
        companyId
      }
    });
    const started = await CreditCardReconciliationSessionService.start(context, {
      sourceType: 'NUBANK_CSV',
      targetReferenceYear: 2026,
      targetReferenceMonth: 8,
      fileBase64: nubankFile([['2026-08-04', 'Compra da fatura', '50,00']]),
      fileName: 'active-commit.csv'
    });
    await prisma.creditCardReconciliationSession.update({
      where: { id: started.session.id },
      data: {
        activeMutationToken: '00000000-0000-4000-8000-000000000001',
        activeMutationAt: new Date()
      }
    });

    await expect(CreditCardInvoiceService.payInvoice({
      invoiceId: invoice.id,
      fromAccountId: payer.id,
      companyId,
      userId
    })).rejects.toThrow('conciliacao desta fatura esta em processamento');
  });
});
