import { candidateFor, hasConfidentBankMatch, MatchItem, MatchTransaction, rankBankCandidates, signedTransactionAmount } from '../../src/services/bank-reconciliation-matching';

const date = new Date('2026-08-22T00:00:00Z');
const item = (id: number, amount: string): MatchItem => ({ id, amount, description: 'Padaria', date });
const transaction = (id: number, amount: string, overrides: Partial<MatchTransaction> = {}): MatchTransaction => ({ id, amount, description: 'Padaria', date, effectiveDate: date, dueDate: new Date('2026-09-10'), fromAccountId: 1, toAccountId: null, status: 'COMPLETED', type: 'EXPENSE', updatedAt: date, ...overrides });
describe('Bank candidate matching', () => {
  it('uses liquidation date, preserves ambiguity, and never marks a suggestion confirmed', () => {
    const ranked = rankBankCandidates([item(1, '-20.00')], [transaction(1, '20.00'), transaction(2, '20.00')], 1);
    expect(ranked).toHaveLength(2);
    expect(ranked.every(c => c.reason.includes('mesma data') && c.source === 'RULE')).toBe(true);
  });
  it('matches multiple bank rows to one transaction and one bank row to several transactions in exact cents', () => {
    const grouped = rankBankCandidates([item(1, '-38.34')], [transaction(1, '46.64')], 1, [item(2, '-8.30')]);
    expect(grouped[0].itemIds).toEqual([1, 2]);
    expect(grouped[0].difference).toBe('0.00');
    const split = rankBankCandidates([item(3, '-46.64')], [transaction(1, '38.34'), transaction(2, '8.30')], 1);
    expect(split[0].transactions).toHaveLength(2);
    expect(split[0].difference).toBe('0.00');
  });
  it('projects both sides of a transfer and excludes the wrong direction', () => {
    const transfer = transaction(1, '100.00', { type: 'TRANSFER', toAccountId: 2 });
    expect(signedTransactionAmount(transfer, 1)).toBe(-10000);
    expect(signedTransactionAmount(transfer, 2)).toBe(10000);
    expect(rankBankCandidates([item(1, '100.00')], [transfer], 1)).toEqual([]);
  });
  it('shows amount differences and makes updated candidates a different feedback context', () => {
    const original = candidateFor([item(1, '-10.00')], [transaction(1, '11.00')], 1);
    expect(original.difference).toBe('1.00');
    expect(candidateFor([item(1, '-10.00')], [transaction(1, '11.00', { updatedAt: new Date('2026-09-01') })], 1).key).not.toBe(original.key);
  });
  it('requires corroborating descriptions or confirmed history before skipping AI', () => {
    const strong = candidateFor([item(1, '-20.00')], [transaction(1, '20.00')], 1);
    expect(hasConfidentBankMatch([strong])).toBe(true);
    const unrelated = candidateFor([item(1, '-20.00')], [transaction(1, '20.00', { description: 'Outro nome' })], 1);
    expect(hasConfidentBankMatch([unrelated])).toBe(false);
    expect(hasConfidentBankMatch([{ ...unrelated, source: 'HISTORY' }])).toBe(true);
  });
  it('keeps duplicate transactions, competing statement rows and limited searches ambiguous', () => {
    const candidates = rankBankCandidates([item(1, '-20.00')], [transaction(1, '20.00'), transaction(2, '20.00')], 1);
    expect(hasConfidentBankMatch(candidates)).toBe(false);
    expect(hasConfidentBankMatch([candidates[0]], [item(2, '-20.00')])).toBe(false);
    expect(hasConfidentBankMatch([candidates[0]], [], true)).toBe(false);
  });
  it('does not treat grouped, pending, distant or mismatched candidates as strong', () => {
    const choices = [
      candidateFor([item(1, '-20.00'), item(2, '-10.00')], [transaction(1, '30.00')], 1),
      candidateFor([item(1, '-20.00')], [transaction(1, '20.00', { status: 'PENDING', dueDate: date })], 1),
      candidateFor([item(1, '-20.00')], [transaction(1, '20.00', { effectiveDate: new Date('2026-08-25') })], 1),
      candidateFor([item(1, '-20.00')], [transaction(1, '21.00')], 1)
    ];
    expect(choices.every(candidate => !hasConfidentBankMatch([candidate]))).toBe(true);
  });
});
