import { Prisma } from '@prisma/client';
import {
  loadCreditCardDescriptionHistory,
  normalizeCreditCardHistoryDescription,
  recordCreditCardDescriptionHistory
} from '../../src/services/credit-card-reconciliation-history.service';

const item = { id: 'item-1', kind: 'PURCHASE', direction: 'DEBIT', sourceDescription: 'Café - 012' };
const input = {
  companyId: 3, accountId: 7, sourceType: 'NUBANK_OFX' as const,
  targetReferenceYear: 2027, targetReferenceMonth: 1, items: [item]
};

describe('credit card description history', () => {
  it('keeps merchant numbers and meaningful symbols while folding accents, case and separators', () => {
    expect(normalizeCreditCardHistoryDescription(' Café  -  012 ')).toBe('CAFE 012');
    expect(normalizeCreditCardHistoryDescription('cafe/012')).toBe('CAFE 012');
    expect(normalizeCreditCardHistoryDescription('Café 12')).not.toBe('CAFE 012');
    expect(normalizeCreditCardHistoryDescription('A&B')).not.toBe(normalizeCreditCardHistoryDescription('A+B'));
  });

  it('queries only invoices before the target, including December when reconciling January', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const existingTx = { creditCardDescriptionHistory: { findMany } } as unknown as Prisma.TransactionClient;
    await loadCreditCardDescriptionHistory({ ...input, existingTx });
    const { where } = findMany.mock.calls[0][0];
    expect(where.sourceType).toEqual({ in: ['NUBANK_CSV', 'NUBANK_OFX'] });
    expect(where.transaction).toMatchObject({ companyId: 3, fromAccountId: 7, type: 'EXPENSE' });
    expect(where.transaction.creditCardInvoice).toEqual({
      accountId: 7,
      OR: [{ referenceYear: { lt: 2027 } }, { referenceYear: 2027, referenceMonth: { lt: 1 } }]
    });
  });

  it('counts independent confirmations, keeps conflicting categories and discards changed financial evidence', async () => {
    const upsert = jest.fn();
    const findMany = jest.fn();
    const db = { creditCardDescriptionHistory: { upsert, findMany } } as unknown as Prisma.TransactionClient;
    const date = new Date('2026-12-06T00:00:00Z');
    const anchor = {
      id: 21, amount: new Prisma.Decimal('15.20'), date, fromAccountId: 7, creditCardInvoiceId: 13,
      installmentNumber: null, totalInstallments: null
    };
    await recordCreditCardDescriptionHistory(db, 'NUBANK_CSV', 45, item, anchor);
    const saved = upsert.mock.calls[0][0].create;
    const category = { id: 4, name: 'Alimentação', companyId: 3, type: 'EXPENSE' };
    const row = { ...saved, transaction: { ...anchor, description: 'Meu café', category } };
    findMany.mockResolvedValue([
      row, { ...row, transactionId: 22 },
      { ...row, transactionId: 23, transaction: { ...row.transaction, category: { ...category, id: 5, name: 'Viagem' } } },
      { ...row, transactionId: 24, transaction: { ...row.transaction, amount: new Prisma.Decimal(17) } }
    ]);
    const result = await loadCreditCardDescriptionHistory({ ...input, existingTx: db });
    expect(result.get(item.id)).toEqual([
      { description: 'Meu café', categoryId: 4, categoryName: 'Alimentação', count: 2 },
      { description: 'Meu café', categoryId: 5, categoryName: 'Viagem', count: 1 }
    ]);
  });
});
