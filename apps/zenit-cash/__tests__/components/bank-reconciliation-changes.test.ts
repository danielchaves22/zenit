import { describe, expect, it } from 'vitest';
import { bankBatchSnapshot } from '@/lib/bank-reconciliation-batch';
import { bankSearchAffected, bankSearchDependency, updateBankSearchResult } from '@/lib/bank-reconciliation-changes';
import { BankCandidate, BankItem, BankLinkChange, BankSearchResult } from '@/lib/bank-reconciliation';
import { BankRowSearch } from '@/hooks/useBankRuleSearch';

const item: BankItem = { id: 1, description: 'Padaria', date: '2026-08-22', amount: '-20.00' };
const candidate = (id: number, difference = '0'): BankCandidate => ({ key: String(id), itemIds: [1], items: [item], amount: '-20.00', difference, score: 80, source: 'RULE', reason: 'Critérios', feedbackToken: 'signed',
  confidence: { level: 'MEDIUM_HIGH', reasons: [] }, transactions: [{ id, date: item.date, amount: item.amount, description: 'Café', status: 'COMPLETED', type: 'EXPENSE', version: '2026-08-22T00:00:00.000Z' }] });
const result: BankSearchResult = { itemId: 1, candidates: [candidate(101), candidate(102, '5')], assessment: 'CANDIDATES' };
const change: BankLinkChange = { items: [{ ...item, id: 2, description: 'Outra compra', amount: '-50.00' }], transactions: [{ id: 102, date: item.date, amount: '-50.00', description: 'Outra compra' }], historyDescriptions: ['Outra compra'], groups: [] };
const row = (candidates: BankCandidate[]): BankRowSearch => ({ result: { itemId: 1, candidates }, status: 'done', signature: '', updatedAt: 0 });
describe('Incremental bank reconciliation evidence', () => {
  it('discards a used divergent alternative while preserving the valid best result', () => {
    expect(updateBankSearchResult(item, result, change)?.candidates.map(c => c.key)).toEqual(['101']);
  });
  it('rechecks a removed best or compatible alternative, including dependencies beyond the displayed ten', () => {
    expect(updateBankSearchResult(item, result, { ...change, transactions: [{ ...change.transactions[0], id: 101 }] })).toBeUndefined();
    expect(updateBankSearchResult(item, { ...result, candidates: [candidate(101), candidate(102)] }, change)).toBeUndefined();
    expect(updateBankSearchResult(item, { ...result, dependencies: { itemIds: [1], transactionIds: [101, 777] } }, { ...change, transactions: [{ ...change.transactions[0], id: 777 }] })).toBeUndefined();
  });
  it('rechecks duplicate evidence at three days and limited searches at seven days', () => {
    const moved = { ...change, transactions: [], items: [{ ...change.items[0], amount: item.amount, date: '2026-08-25' }] };
    expect(bankSearchAffected(item, bankSearchDependency(result), moved)).toBe(true);
    expect(bankSearchAffected(item, bankSearchDependency(result), { ...moved, items: [{ ...moved.items[0], date: '2026-08-26' }] })).toBe(false);
    expect(bankSearchAffected(item, bankSearchDependency({ ...result, limited: true }), { ...change, transactions: [], items: [{ ...change.items[0], date: '2026-08-29' }] })).toBe(true);
    expect(bankSearchAffected(item, bankSearchDependency({ ...result, limited: true }), { ...change, transactions: [], items: [{ ...change.items[0], date: '2026-08-30' }] })).toBe(false);
  });
  it('rechecks newly learned and displaced exact description mappings', () => {
    expect(updateBankSearchResult(item, result, { ...change, historyDescriptions: ['PADARÍA!!'] })).toBeUndefined();
    expect(updateBankSearchResult(item, result, { ...change, historyDescriptions: ['Padaria diferente'] })).toBeDefined();
  });
});
describe('Reviewed selection snapshot', () => {
  it('accepts exact completed pairs at every confidence level', () => {
    for (const level of ['HIGH', 'MEDIUM_HIGH', 'MEDIUM_LOW', 'LOW'] as const) {
      expect(bankBatchSnapshot([item], { 1: row([{ ...candidate(101), confidence: { level, reasons: [] } }]) }).candidates).toHaveLength(1);
    }
  });
  it('marks both sides of conflicting transaction suggestions for individual review', () => {
    const second = { ...item, id: 2 };
    const snapshot = bankBatchSnapshot([item, second], { 1: row([candidate(101)]), 2: row([{ ...candidate(101), itemIds: [2], items: [second] }]) });
    expect(snapshot.candidates).toHaveLength(0);
    expect(snapshot.excluded).toHaveLength(2);
    expect(snapshot.excluded.every(entry => entry.reason.includes('mais de um'))).toBe(true);
  });
  it('keeps missing, grouped, pending and divergent matches out of the confirmed set', () => {
    for (const candidates of [[], [{ ...candidate(101), itemIds: [1, 2] }], [{ ...candidate(101), transactions: [{ ...candidate(101).transactions[0], status: 'PENDING' }] }], [candidate(101, '5')]]) {
      const snapshot = bankBatchSnapshot([item], { 1: row(candidates) });
      expect(snapshot.candidates).toHaveLength(0); expect(snapshot.excluded).toHaveLength(1);
    }
  });
});
