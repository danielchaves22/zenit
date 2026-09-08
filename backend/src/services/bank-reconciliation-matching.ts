import { Prisma } from '@prisma/client';
import { hash, normalizeDescription } from './bank-statement-parser';

export interface MatchItem { id: number; date: Date; amount: Prisma.Decimal | string; description: string }
export interface MatchTransaction {
  id: number;
  description: string;
  amount: Prisma.Decimal | string;
  date: Date;
  dueDate: Date | null;
  effectiveDate: Date | null;
  type: string;
  status: string;
  fromAccountId: number | null;
  toAccountId: number | null;
  updatedAt: Date;
}
export interface BankCandidate {
  key: string;
  itemIds: number[];
  items: Array<{ id: number; date: string; amount: string; description: string }>;
  transactions: Array<{ id: number; description: string; amount: string; date: string; status: string; type: string; version: string }>;
  amount: string;
  difference: string;
  score: number;
  reason: string;
  source: 'RULE' | 'HISTORY' | 'AI';
  model?: string;
  confidence?: { level: 'HIGH' | 'MEDIUM_HIGH' | 'MEDIUM_LOW' | 'LOW'; reasons: string[] };
  feedbackToken?: string;
}
export const BANK_MATCH_RULE_VERSION = 'bank-match-v2';
export const BANK_DUPLICATE_DAYS = 3;
export type BankAssessment = 'CANDIDATES' | 'POSSIBLE_MISSING' | 'INCOMPLETE';
export interface BankMatchEvidence { duplicateItem: boolean; duplicateTransaction: boolean; incomplete: boolean }
export const day = (value: Date) => value.toISOString().slice(0, 10);
export const transactionDay = (t: MatchTransaction) => day(t.status === 'COMPLETED' ? (t.effectiveDate || t.date) : (t.dueDate || t.date));
export const cents = (value: Prisma.Decimal | string) => new Prisma.Decimal(value).mul(100).toNumber();
export const money = (value: number) => new Prisma.Decimal(value).div(100).toFixed(2);
export const sumCents = (values: number[]) => values.reduce((sum, value) => {
  const next = sum + value;
  if (!Number.isSafeInteger(next)) throw new Error('O total selecionado excede o limite de precisão suportado.');
  return next;
}, 0);
export const idsKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');
export const dayDistance = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
export function signedTransactionAmount(t: Pick<MatchTransaction, 'amount' | 'type' | 'fromAccountId' | 'toAccountId'>, accountId: number): number {
  if (t.fromAccountId === accountId && t.toAccountId === accountId) return 0;
  if (t.fromAccountId === accountId && (t.type === 'EXPENSE' || t.type === 'TRANSFER')) return -cents(t.amount);
  if (t.toAccountId === accountId && (t.type === 'INCOME' || t.type === 'TRANSFER')) return cents(t.amount);
  return 0;
}
export function similarity(a: string, b: string): number {
  const x = new Set(normalizeDescription(a).split(' ').filter(w => w.length > 2));
  const y = new Set(normalizeDescription(b).split(' ').filter(w => w.length > 2));
  if (!x.size || !y.size) return 0;
  return [...x].filter(w => y.has(w)).length / Math.max(x.size, y.size);
}
export function candidateFor(items: MatchItem[], transactions: MatchTransaction[], accountId: number): BankCandidate {
  const target = sumCents(items.map(i => cents(i.amount)));
  const total = sumCents(transactions.map(t => signedTransactionAmount(t, accountId)));
  const distance = Math.max(...transactions.map(t => Math.min(...items.map(i => dayDistance(day(i.date), transactionDay(t))))));
  const textScore = Math.max(...items.flatMap(i => transactions.map(t => similarity(i.description, t.description))));
  const exact = target === total;
  const pending = transactions.some(t => t.status !== 'COMPLETED');
  return {
    key: hash(JSON.stringify([idsKey(items.map(i => i.id)), transactions.map(t => [t.id, t.updatedAt.toISOString()]).sort((a, b) => Number(a[0]) - Number(b[0]))])),
    itemIds: items.map(i => i.id).sort((a, b) => a - b),
    items: items.map(i => ({ id: i.id, date: day(i.date), amount: i.amount.toString(), description: i.description })),
    transactions: transactions.map(t => ({ id: t.id, description: t.description, amount: money(signedTransactionAmount(t, accountId)),
      date: transactionDay(t), status: t.status, type: t.type, version: t.updatedAt.toISOString() })),
    amount: money(total), difference: money(target - total),
    score: Math.round((exact ? 65 : 15) + Math.max(0, 20 - distance * 3) + 15 * textScore - (pending ? 10 : 0)),
    source: 'RULE',
    reason: `${exact ? 'Valores conferem' : 'Valor divergente'}; ${distance === 0 ? 'mesma data' : `${distance} dia(s) de diferença`}${pending ? '; requer liquidação' : ''}${items.length > 1 || transactions.length > 1 ? '; correspondência agrupada' : ''}.`
  };
}

export const equivalentBankDescription = (a: string, b: string) => !!normalizeDescription(a) && normalizeDescription(a) === normalizeDescription(b);
// Confidence describes evidence, never a probability or the authority of an AI response.
export function classifyBankCandidates(candidates: BankCandidate[], neighbors: MatchItem[] = [], limited = false,
  evidence?: BankMatchEvidence, limit = candidates.length): BankCandidate[] {
  return candidates.slice(0, limit).map(candidate => {
    const exact = cents(candidate.difference) === 0;
    const distance = Math.max(...candidate.transactions.map(t => Math.min(...candidate.items.map(i => dayDistance(i.date, t.date)))));
    const text = Math.max(...candidate.items.flatMap(i => candidate.transactions.map(t => similarity(i.description, t.description))));
    const history = candidate.source === 'HISTORY';
    const alternatives = candidates.filter(c => c.key !== candidate.key);
    const competing = alternatives.some(c => cents(c.difference) === 0
      && c.transactions.some(t => candidate.items.some(i => dayDistance(i.date, t.date) <= BANK_DUPLICATE_DAYS)));
    const duplicate = neighbors.some(other => !candidate.itemIds.includes(other.id) && candidate.items.some(i => cents(other.amount) === cents(i.amount))
      && candidate.items.some(i => dayDistance(day(other.date), i.date) <= BANK_DUPLICATE_DAYS));
    const grouped = candidate.items.length !== 1 || candidate.transactions.length !== 1;
    const pending = candidate.transactions.some(t => t.status !== 'COMPLETED');
    const equivalent = !grouped && equivalentBankDescription(candidate.items[0].description, candidate.transactions[0].description);
    const ambiguous = competing || duplicate || evidence?.duplicateItem || evidence?.duplicateTransaction;
    const incomplete = limited || evidence?.incomplete;
    const strong = exact && distance === 0 && !grouped && !pending && !ambiguous && !incomplete;
    const reasons = [exact ? 'Valor exato' : 'Valor divergente', distance === 0 ? 'Mesma data' : `${distance} dia(s) de diferença`,
      equivalent ? 'Descrições equivalentes' : 'Descrições diferentes'];
    if (history) reasons.push('Histórico confirmado compatível');
    if (grouped) reasons.push('Exige conferir o agrupamento');
    if (pending) reasons.push('Requer liquidação');
    if (ambiguous) reasons.push('Há outra correspondência plausível ou valor repetido em até 3 dias');
    if (incomplete) reasons.push('Busca limitada: podem existir outros candidatos');
    if (strong) reasons.push('Sem duplicidade nos dois lados em até 3 dias');
    return { ...candidate, confidence: { level: strong ? equivalent || history ? 'HIGH' : 'MEDIUM_HIGH'
      : exact && (distance <= 3 || text >= 0.4 || history) ? 'MEDIUM_LOW' : 'LOW', reasons } };
  });
}
export function shouldUseBankAi(candidates: BankCandidate[]): boolean {
  return !!candidates[0]?.confidence && ['MEDIUM_LOW', 'LOW'].includes(candidates[0].confidence.level);
}
export function assessBankCandidates(candidates: BankCandidate[], limited: boolean): BankAssessment {
  if (limited) return 'INCOMPLETE';
  return candidates.some(c => cents(c.difference) === 0) ? 'CANDIDATES' : 'POSSIBLE_MISSING';
}

// Bound the combinatorial search. Manual selection remains available outside these suggestions.
export function rankBankCandidates(items: MatchItem[], transactions: MatchTransaction[], accountId: number, neighbors: MatchItem[] = [], limit = 10): BankCandidate[] {
  const total = sumCents(items.map(i => cents(i.amount)));
  const usable = transactions.filter(t => ['PENDING', 'COMPLETED'].includes(t.status) && Math.sign(signedTransactionAmount(t, accountId)) === Math.sign(total));
  const candidates = usable.map(t => candidateFor(items, [t], accountId));
  // Convert amounts/dates once, rather than inside every pair/triple and sort comparison.
  const prepared = usable.map(t => ({ transaction: t, amount: signedTransactionAmount(t, accountId),
    distance: Math.min(...items.map(i => dayDistance(day(i.date), transactionDay(t)))) }));
  const closest = [...prepared].sort((a, b) => a.distance - b.distance || a.transaction.id - b.transaction.id)
    .filter(t => Math.abs(t.amount) < Math.abs(total)).slice(0, 25);
  for (let a = 0; a < closest.length; a++) {
    for (let b = a + 1; b < closest.length; b++) {
      const pair = [closest[a].transaction, closest[b].transaction];
      const pairAmount = closest[a].amount + closest[b].amount;
      if (pairAmount === total) candidates.push(candidateFor(items, pair, accountId));
      for (let c = b + 1; c < closest.length; c++) {
        if (pairAmount + closest[c].amount === total) candidates.push(candidateFor(items, [...pair, closest[c].transaction], accountId));
      }
    }
  }
  if (items.length === 1) {
    const nearby = neighbors.filter(i => i.id !== items[0].id && Math.sign(cents(i.amount)) === Math.sign(total)).slice(0, 25);
    for (const other of nearby) {
      const combined = total + cents(other.amount);
      for (const t of prepared) if (t.amount === combined) candidates.push(candidateFor([...items, other], [t.transaction], accountId));
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit);
}
