import { CreditCardInvoiceStatus, Prisma, TransactionStatus } from '@prisma/client';
import { __private__ } from '../../src/services/credit-card-statement-reconciliation.service';

const item = __private__.parseNubankStatementText(
  'date,title,amount\n2026-12-05,Dropbox AB12,"53,40"', 'Nubank_2026-12-17.csv'
).items[0]!;
type Candidate = Parameters<typeof __private__.classifyMatches>[1][number];
const occurrence: Candidate = {
  id: null, matchKey: 'projected-fixed:71:71:2026-12', matchSource: 'PROJECTED_FIXED',
  fixedTemplateId: 71, occurrenceKey: '71:2026-12', description: 'Armazenamento',
  date: new Date('2026-12-10T12:00:00Z'), amount: new Prisma.Decimal('11.00'),
  installmentNumber: null, totalInstallments: null, status: TransactionStatus.PENDING, purchaseGroupId: null,
  creditCardInvoice: { id: 95, referenceYear: 2026, referenceMonth: 12, status: CreditCardInvoiceStatus.OPEN }
};
const materialized: Candidate = {
  ...occurrence, id: 54, matchKey: 'transaction:54', matchSource: 'TRANSACTION', status: TransactionStatus.COMPLETED
};
const classify = (candidates: Candidate[], sourceDescription = item.sourceDescription) =>
  __private__.classifyMatches({ ...item, sourceDescription }, candidates, 2026, 12, new Map([['DROPBOX AB12', 71]]));

it.each([occurrence, materialized])('offers $matchSource from the mapped series with any amount difference for review', candidate => {
  expect(classify([candidate])).toMatchObject({ status: 'SIMILAR', reason: 'AMOUNT_DIVERGENCE', matchedTransactions: [candidate] });
  const centDifference = { ...candidate, amount: new Prisma.Decimal('53.41') };
  expect(classify([centDifference])).toMatchObject({ status: 'SIMILAR', reason: 'AMOUNT_DIVERGENCE', matchedTransactions: [centDifference] });
});

it('retains an unrelated exact candidate for review when it conflicts with the explicitly mapped series', () => {
  const other = { ...materialized, id: 55, matchKey: 'transaction:55', fixedTemplateId: null,
    amount: new Prisma.Decimal(item.amount), date: item.purchaseDate! };
  expect(classify([other, occurrence])).toMatchObject({ status: 'SIMILAR', reason: 'AMBIGUOUS_EXACT', matchedTransactions: [occurrence, other] });
});

it('prefers a proven exact import over a mapped series and leaves multiple proven imports ambiguous', () => {
  const imported = { ...materialized, fixedTemplateId: null, importSourceDescription: '  Drópbox AB12',
    amount: new Prisma.Decimal(item.amount), date: item.purchaseDate! };
  expect(classify([occurrence, imported])).toMatchObject({ status: 'OK', reason: 'EXACT', matchedTransactions: [imported] });
  const duplicate = { ...imported, id: 55, matchKey: 'transaction:55' };
  expect(classify([occurrence, imported, duplicate])).toMatchObject({
    status: 'SIMILAR', reason: 'AMBIGUOUS_EXACT', matchedTransactions: [imported, duplicate]
  });
});

it('requires the full alias, target invoice, same direction and eligible purchase', () => {
  const previous = { ...occurrence, creditCardInvoice: { ...occurrence.creditCardInvoice!, referenceMonth: 11 } };
  const wrong = { ...occurrence, fixedTemplateId: 72 };
  expect(classify([occurrence], '  drópbox   ab12 ').matchedTransactions).toEqual([occurrence]);
  expect(classify([occurrence], 'Dropbox XY73').matchedTransactions).toEqual([]);
  expect(classify([wrong, previous, { ...occurrence, direction: 'CREDIT' }]).matchedTransactions).toEqual([]);
  expect(__private__.classifyMatches({ ...item, kind: 'INSTALLMENT', installmentNumber: 1, totalInstallments: 2 },
    [occurrence], 2026, 12, new Map([['DROPBOX AB12', 71]])).matchedTransactions).toEqual([]);
});

it('does not use a catalogue-only occurrence as a generic exact match for an unrelated purchase', () => {
  const outside = { ...occurrence, requiresFixedAlias: true, amount: new Prisma.Decimal(item.amount), date: item.purchaseDate! };
  expect(classify([outside], 'Outro fornecedor')).toMatchObject({ status: 'PENDING', matchedTransactions: [] });
  expect(classify([outside]).matchedTransactions).toEqual([outside]);
});

it('does not resolve several occurrences of one mapped series or a dated materialized transaction on another day', () => {
  const equal = { ...materialized, amount: new Prisma.Decimal(item.amount) };
  expect(classify([equal])).toMatchObject({ status: 'SIMILAR', reason: 'DATE_DIVERGENCE', matchedTransactions: [equal] });
  const second = { ...equal, id: 55, matchKey: 'transaction:55' };
  expect(classify([equal, second])).toMatchObject({ status: 'SIMILAR', matchedTransactions: [equal, second] });
});
