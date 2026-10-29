import { BankCandidate, candidateFor, classifyBankCandidates, MatchItem, MatchTransaction, rankBankCandidates } from '../../src/services/bank-reconciliation-matching';
import { bankDescriptionSimilarity, diagnoseBankCandidates, guidedBankCandidates, refineGuidedBankCandidates } from '../../src/services/bank-reconciliation-guided';

const date = new Date('2026-08-20T00:00:00Z');
const item: MatchItem = { id: 1, date, amount: '-200.00', description: 'Academia Horizonte' };
const transaction = (id: number, amount: string, extra: Partial<MatchTransaction> = {}): MatchTransaction => ({ id, amount, description: item.description,
  date, effectiveDate: date, dueDate: null, status: 'COMPLETED', type: 'EXPENSE', fromAccountId: 1, toAccountId: null, updatedAt: date, ...extra });
const guided = (transactions: MatchTransaction[]) => refineGuidedBankCandidates(guidedBankCandidates([item], transactions, 1, []).candidates).candidates;

describe('Guided discovery, independent from classic matching', () => {
  it('filters irrelevant mismatches without changing the classic candidates', () => {
    const unrelated = [transaction(1, '1000.00', { description: 'Restaurante' })];
    expect(rankBankCandidates([item], unrelated, 1)).toHaveLength(1);
    expect(guided(unrelated)).toEqual([]);
    expect(diagnoseBankCandidates([], false)).toBe('MISSING');
    expect(diagnoseBankCandidates([], true)).toBe('INCOMPLETE');
  });
  it('ranks the size of a value discrepancy and reports an existing entry to review', () => {
    const candidates = guided([transaction(1, '1200.00'), transaction(2, '201.00'), transaction(3, '250.00')]);
    expect(candidates.map(c => c.transactions[0].id)).toEqual([2, 3, 1]);
    const classified = classifyBankCandidates(candidates);
    expect(diagnoseBankCandidates(classified, false)).toBe('AMOUNT_DIFFERENCE');
    expect(classified.every(c => c.confidence?.level === 'LOW')).toBe(true);
  });
  it('requires description evidence outside seven days and never promotes a different date', () => {
    const later = new Date('2026-08-30T00:00:00Z');
    const candidates = guided([transaction(1, '200.00', { effectiveDate: later }), transaction(2, '200.00', { effectiveDate: later, description: 'Sem relação' })]);
    expect(candidates).toHaveLength(1);
    expect(classifyBankCandidates(candidates)[0].confidence?.level).toBe('MEDIUM_LOW');
    expect(diagnoseBankCandidates(classifyBankCandidates(candidates), false)).toBe('DATE_DIFFERENCE');
    expect(guided([transaction(1, '200.00', { effectiveDate: later }), transaction(3, '200.00')]).map(c => c.transactions[0].id)).toEqual([3]);
  });
  it('discovers four-entry sums while retaining ambiguity and exact cents', () => {
    const transactions = ['10.10', '20.20', '30.30', '139.40'].map((amount, i) => transaction(i + 1, amount));
    expect(rankBankCandidates([item], transactions, 1).some(c => c.difference === '0.00')).toBe(false);
    const candidates = guided(transactions);
    expect(candidates[0].difference).toBe('0.00');
    expect(candidates[0].transactions).toHaveLength(4);
    expect(diagnoseBankCandidates(classifyBankCandidates(candidates), false)).toBe('GROUPED');
  });
  it('uses meaningful bank text for discovery, not a high-confidence override', () => {
    expect(bankDescriptionSimilarity('PIX 894759 ACADEMIA HORIZONTE', 'Academia Horizonte')).toBe(1);
    expect(bankDescriptionSimilarity('PIX 111111', 'PIX 222222')).toBeLessThan(0.5);
    const candidate = candidateFor([{ ...item, description: 'PIX 894759 ACADEMIA HORIZONTE' }], [transaction(1, '200.00')], 1);
    expect(classifyBankCandidates([candidate])[0].confidence?.level).toBe('MEDIUM_HIGH');
  });
  it('keeps duplicate evidence even when alternatives are hidden', () => {
    const candidates: BankCandidate[] = classifyBankCandidates(guided([transaction(1, '200.00')]), [], false,
      { duplicateItem: true, duplicateTransaction: false, incomplete: false });
    expect(diagnoseBankCandidates(candidates, false, { duplicateItem: true, duplicateTransaction: false, incomplete: false })).toBe('AMBIGUOUS');
    expect(candidates[0].confidence?.level).toBe('MEDIUM_LOW');
  });
  it('bounds large grouped pools and marks the search incomplete instead of implying absence', () => {
    const pool = guidedBankCandidates([item], Array.from({ length: 25 }, (_, i) => transaction(i + 1, '50.00')), 1, []);
    expect(pool.truncated).toBe(true);
    expect(pool.candidates).toHaveLength(1000);
    const classified = classifyBankCandidates(pool.candidates, [], pool.truncated, undefined, 10);
    expect(classified.every(c => !['HIGH', 'MEDIUM_HIGH'].includes(c.confidence!.level))).toBe(true);
    expect(diagnoseBankCandidates(classified, pool.truncated)).toBe('INCOMPLETE');
  });
});
