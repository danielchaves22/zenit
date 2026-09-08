import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { BANK_MATCH_RULE_VERSION, BankCandidate } from './bank-reconciliation-matching';
import type { BankContext } from './bank-reconciliation.service';

// A purpose-specific key prevents a suggestion receipt from being used as an authentication token.
const key = createHmac('sha256', JWT_SECRET).update('bank-reconciliation-feedback').digest();
const audience = 'bank-reconciliation-feedback';
export function signBankFeedback(context: BankContext, month: string, candidate: BankCandidate): string {
  const feedback = { ruleVersion: BANK_MATCH_RULE_VERSION, key: candidate.key, source: candidate.source, model: candidate.model,
    reason: candidate.reason, confidence: candidate.confidence, score: candidate.score, presentedAt: new Date().toISOString() };
  return jwt.sign({ context, month, feedback }, key, { algorithm: 'HS256', audience, expiresIn: '24h' });
}
export function readBankFeedback(token: string, context: BankContext, month: string, candidateKey: string) {
  try {
    const payload = jwt.verify(token, key, { algorithms: ['HS256'], audience }) as jwt.JwtPayload;
    if (payload.month !== month || payload.feedback?.key !== candidateKey
      || payload.context?.companyId !== context.companyId || payload.context?.accountId !== context.accountId
      || payload.context?.userId !== context.userId || payload.context?.role !== context.role) throw new Error('MISMATCH');
    return payload.feedback;
  } catch { throw new Error('A sugestão mudou ou expirou. Atualize a busca antes de confirmar ou rejeitar.'); }
}
