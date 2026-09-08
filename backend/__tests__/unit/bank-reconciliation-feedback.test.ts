import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../src/config';
import { readBankFeedback, signBankFeedback } from '../../src/services/bank-reconciliation-feedback';
import { BankCandidate } from '../../src/services/bank-reconciliation-matching';

describe('Reviewed bank match receipts', () => {
  const context = { companyId: 1, accountId: 2, userId: 3, role: 'ADMIN' };
  const candidate = { key: 'reviewed-pair', source: 'RULE', score: 85, reason: 'Valor e data conferem', confidence: { level: 'MEDIUM_HIGH', reasons: ['Mesma data', 'Valor exato'] } } as BankCandidate;
  it('authenticates the shown evidence, the review pair and the complete access context', () => {
    const token = signBankFeedback(context, '2026-08', candidate);
    expect(readBankFeedback(token, context, '2026-08', candidate.key)).toMatchObject({ source: 'RULE', confidence: candidate.confidence, ruleVersion: 'bank-match-v2' });
    for (const changed of [{ ...context, companyId: 9 }, { ...context, accountId: 9 }, { ...context, userId: 9 }, { ...context, role: 'USER' }]) {
      expect(() => readBankFeedback(token, changed, '2026-08', candidate.key)).toThrow('expirou');
    }
    expect(() => readBankFeedback(token, context, '2026-09', candidate.key)).toThrow('expirou');
    expect(() => readBankFeedback(token, context, '2026-08', 'changed-pair')).toThrow('expirou');
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
    const forged = jwt.sign({ context, month: '2026-08', feedback: candidate }, JWT_SECRET, { audience: 'bank-reconciliation-feedback' });
    expect(() => readBankFeedback(forged, context, '2026-08', candidate.key)).toThrow('expirou');
  });
  it('expires old receipts without keeping a server-side search record', () => {
    jest.useFakeTimers();
    try {
      const token = signBankFeedback(context, '2026-08', candidate);
      jest.advanceTimersByTime(24 * 3600_000 + 1000);
      expect(() => readBankFeedback(token, context, '2026-08', candidate.key)).toThrow('expirou');
    } finally { jest.useRealTimers(); }
  });
});
