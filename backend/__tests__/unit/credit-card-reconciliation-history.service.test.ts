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
    const { where, orderBy } = findMany.mock.calls[0][0];
    expect(orderBy).toEqual([{ confirmedAt: { sort: 'desc', nulls: 'last' } }, { transactionId: 'desc' }]);
    expect(where.sourceType).toEqual({ in: ['NUBANK_CSV', 'NUBANK_OFX'] });
    expect(where.transaction).toMatchObject({ companyId: 3, fromAccountId: 7, type: 'EXPENSE' });
    expect(where.transaction.creditCardInvoice).toEqual({
      accountId: 7,
      OR: [{ referenceYear: { lt: 2027 } }, { referenceYear: 2027, referenceMonth: { lt: 1 } }]
    });
  });

  it('prioritizes the latest decision, retains use counts and places unverified dates after known decisions', async () => {
    const upsert = jest.fn();
    const findMany = jest.fn();
    const db = { creditCardDescriptionHistory: { upsert, findMany } } as unknown as Prisma.TransactionClient;
    const date = new Date('2026-12-06T00:00:00Z');
    const anchor = {
      id: 21, amount: new Prisma.Decimal('15.20'), date, fromAccountId: 7, creditCardInvoiceId: 13,
      installmentNumber: null, totalInstallments: null
    };
    const confirmedAt = new Date('2026-12-30T18:43:00Z');
    await recordCreditCardDescriptionHistory(db, 'NUBANK_CSV', 45, item, anchor, confirmedAt);
    const saved = upsert.mock.calls[0][0].create;
    expect(saved.confirmedAt).toEqual(confirmedAt);
    expect(upsert.mock.calls[0][0].update.confirmedAt).toEqual(confirmedAt);
    const category = { id: 4, name: 'Alimentação', companyId: 3, type: 'EXPENSE' };
    const row = { ...saved, transaction: { ...anchor, description: 'Meu café', category } };
    const older = new Date('2026-12-20T09:00:00Z');
    const laterPurchase = new Date('2026-12-18T00:00:00Z');
    const otherCategory = (id: number, name: string) => ({
      ...row.transaction, category: { ...category, id, name }
    });
    // The query returns known decision dates first, independently of purchase date.
    findMany.mockResolvedValue([
      { ...row, transactionId: 23, transaction: otherCategory(5, 'Viagem') },
      { ...row, transactionId: 29, confirmedAt: older, date: laterPurchase, transaction: { ...otherCategory(8, 'Outro'), date: laterPurchase } },
      { ...row, transactionId: 28, confirmedAt: older, transaction: otherCategory(7, 'Trabalho') },
      { ...row, transactionId: 22, confirmedAt: older }, { ...row, confirmedAt: older },
      { ...row, transactionId: 24, confirmedAt: older, transaction: { ...row.transaction, amount: new Prisma.Decimal(17) } },
      { ...row, transactionId: 33, confirmedAt: null, transaction: otherCategory(9, 'Sem data') },
      { ...row, transactionId: 32, confirmedAt: null, transaction: otherCategory(9, 'Sem data') }
    ]);
    const result = await loadCreditCardDescriptionHistory({ ...input, existingTx: db });
    expect(result.get(item.id)).toEqual([
      { description: 'Meu café', categoryId: 5, categoryName: 'Viagem', count: 1, lastConfirmedAt: confirmedAt.toISOString() },
      { description: 'Meu café', categoryId: 4, categoryName: 'Alimentação', count: 2, lastConfirmedAt: older.toISOString() },
      { description: 'Meu café', categoryId: 8, categoryName: 'Outro', count: 1, lastConfirmedAt: older.toISOString() },
      { description: 'Meu café', categoryId: 7, categoryName: 'Trabalho', count: 1, lastConfirmedAt: older.toISOString() },
      { description: 'Meu café', categoryId: 9, categoryName: 'Sem data', count: 2, lastConfirmedAt: null }
    ]);
  });
});
