import {
  BankCandidate, BankMatchEvidence, MatchItem, MatchTransaction, candidateFor, cents,
  dayDistance, rankBankCandidates, signedTransactionAmount, similarity, transactionDay, day
} from './bank-reconciliation-matching';
import { normalizeDescription } from './bank-statement-parser';

export type BankMatchingStrategy = 'classic' | 'guided';
export const GUIDED_BANK_RULE_VERSION = 'bank-guided-v1';
export type BankDiagnosis = 'READY' | 'AMBIGUOUS' | 'AMOUNT_DIFFERENCE' | 'DATE_DIFFERENCE'
  | 'SETTLEMENT' | 'GROUPED' | 'MISSING' | 'INCOMPLETE';

// Bank boilerplate and variable reference numbers help discovery, never high confidence.
const bankWords = new Set(['PIX', 'TED', 'DOC', 'PAGAMENTO', 'PAG', 'COMPRA', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'TRANSF', 'RECEBIDO', 'ENVIADO']);
export function bankDescriptionSimilarity(a: string, b: string): number {
  const meaningful = (value: string) => normalizeDescription(value).split(' ')
    .filter(word => word.length > 2 && !/^\d+$/.test(word) && !bankWords.has(word)).join(' ');
  const left = meaningful(a), right = meaningful(b);
  return left && right ? Math.max(similarity(a, b), similarity(left, right)) : 0;
}

const distance = (candidate: BankCandidate) => Math.max(...candidate.transactions.map(t =>
  Math.min(...candidate.items.map(i => dayDistance(i.date, t.date)))));
const textEvidence = (candidate: BankCandidate) => Math.max(...candidate.items.flatMap(i =>
  candidate.transactions.map(t => bankDescriptionSimilarity(i.description, t.description))));

/** Keep the classic engine intact; the guided experience adds bounded four-entry groups. */
export function guidedBankCandidates(items: MatchItem[], transactions: MatchTransaction[], accountId: number, neighbors: MatchItem[]): { candidates: BankCandidate[]; truncated: boolean } {
  const target = items.reduce((sum, item) => sum + cents(item.amount), 0);
  const isNearby = (transaction: MatchTransaction) => items.some(item => dayDistance(day(item.date), transactionDay(transaction)) <= 7);
  const limit = 1000;
  const candidates = rankBankCandidates(items, transactions.filter(isNearby), accountId, neighbors, limit + 1);
  candidates.push(...transactions.filter(t => !isNearby(t) && signedTransactionAmount(t, accountId) === target).map(t => candidateFor(items, [t], accountId)));
  if (candidates.length > limit) return { candidates: candidates.slice(0, limit), truncated: true };
  const nearby = transactions.map(transaction => ({ transaction, amount: signedTransactionAmount(transaction, accountId),
    distance: Math.min(...items.map(item => dayDistance(day(item.date), transactionDay(transaction)))) }))
    .filter(t => t.distance <= 7 && Math.sign(t.amount) === Math.sign(target) && Math.abs(t.amount) < Math.abs(target))
    .sort((a, b) => a.distance - b.distance || a.transaction.id - b.transaction.id).slice(0, 25);
  for (let a = 0; a < nearby.length; a++) for (let b = a + 1; b < nearby.length; b++)
    for (let c = b + 1; c < nearby.length; c++) for (let d = c + 1; d < nearby.length; d++) {
      const group = [nearby[a], nearby[b], nearby[c], nearby[d]];
      if (group.reduce((sum, t) => sum + t.amount, 0) === target) {
        if (candidates.length === limit) return { candidates, truncated: true };
        candidates.push(candidateFor(items, group.map(t => t.transaction), accountId));
      }
    }
  return { candidates, truncated: false };
}

/** Expand to 31 days only when the first seven days have no exact-value match. */
export function refineGuidedBankCandidates(candidates: BankCandidate[]): { candidates: BankCandidate[]; expanded: boolean } {
  const hasNearbyExact = candidates.some(candidate => cents(candidate.difference) === 0 && distance(candidate) <= 7);
  const ranked = candidates.filter(candidate => {
    const days = distance(candidate), text = textEvidence(candidate), history = candidate.source === 'HISTORY';
    const exact = cents(candidate.difference) === 0;
    if (days > 7) return !hasNearbyExact && exact && (history || text >= 0.5);
    if (exact) return true;
    // Do not present unrelated entries just because they share the payment direction.
    return candidate.items.length === 1 && candidate.transactions.length === 1 && (history || text >= 0.5);
  }).map(candidate => {
    const target = candidate.items.reduce((sum, item) => sum + cents(item.amount), 0);
    const relativeDifference = Math.abs(cents(candidate.difference)) / Math.max(1, Math.abs(target));
    return { ...candidate, score: candidate.score + Math.round(20 * textEvidence(candidate))
      - Math.round(Math.min(1, relativeDifference) * 40) };
  }).sort((a, b) => Number(cents(a.difference) !== 0) - Number(cents(b.difference) !== 0)
    || b.score - a.score || Math.abs(cents(a.difference)) - Math.abs(cents(b.difference)) || a.key.localeCompare(b.key));
  return { candidates: ranked, expanded: !hasNearbyExact };
}

export function diagnoseBankCandidates(candidates: BankCandidate[], limited: boolean, evidence?: BankMatchEvidence): BankDiagnosis {
  if (limited) return 'INCOMPLETE';
  const candidate = candidates[0];
  if (!candidate) return 'MISSING';
  if (cents(candidate.difference) !== 0) return 'AMOUNT_DIFFERENCE';
  if (['HIGH', 'MEDIUM_HIGH'].includes(candidate.confidence?.level || '')) return 'READY';
  if (evidence?.duplicateItem || evidence?.duplicateTransaction || candidates.filter(c => cents(c.difference) === 0).length > 1) return 'AMBIGUOUS';
  if (candidate.transactions.some(t => t.status === 'PENDING')) return 'SETTLEMENT';
  if (candidate.items.length > 1 || candidate.transactions.length > 1) return 'GROUPED';
  return distance(candidate) > 0 ? 'DATE_DIFFERENCE' : 'AMBIGUOUS';
}
