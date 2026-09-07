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
  confidence?: { level: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] };
}
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

// A score is a ranking signal, not a probability. Skip AI only when independent
// evidence agrees and neither side has a plausible competing match.
export function hasConfidentBankMatch(candidates: BankCandidate[], neighbors: MatchItem[] = [], limited = false): boolean {
  const best = candidates[0];
  if (limited || !best || cents(best.difference) !== 0 || best.items.length !== 1 || best.transactions.length !== 1) return false;
  const item = best.items[0], transaction = best.transactions[0];
  if (transaction.status !== 'COMPLETED' || dayDistance(item.date, transaction.date) > 1) return false;
  if (similarity(item.description, transaction.description) < 0.6 && best.source !== 'HISTORY') return false;
  if (candidates.slice(1).some(c => cents(c.difference) === 0 && best.score - c.score < 15)) return false;
  return !neighbors.some(other => other.id !== item.id && cents(other.amount) === cents(item.amount)
    && dayDistance(day(other.date), transaction.date) <= 1);
}

export function classifyBankCandidates(candidates: BankCandidate[], neighbors: MatchItem[] = [], limited = false): BankCandidate[] {
  return candidates.map(candidate => {
    const exact = cents(candidate.difference) === 0;
    const distance = Math.max(...candidate.transactions.map(t => Math.min(...candidate.items.map(i => dayDistance(i.date, t.date)))));
    const text = Math.max(...candidate.items.flatMap(i => candidate.transactions.map(t => similarity(i.description, t.description))));
    const history = candidate.source === 'HISTORY';
    const alternatives = candidates.filter(c => c.key !== candidate.key);
    const competing = alternatives.some(c => cents(c.difference) === 0 && candidate.score - c.score < 15);
    const duplicate = neighbors.some(other => !candidate.itemIds.includes(other.id) && candidate.items.some(i => cents(other.amount) === cents(i.amount))
      && candidate.transactions.some(t => dayDistance(day(other.date), t.date) <= 1));
    const high = hasConfidentBankMatch([candidate, ...alternatives], neighbors, limited);
    const reasons = [exact ? 'Valor exato' : 'Valor divergente', distance === 0 ? 'Mesma data' : `${distance} dia(s) de diferença`,
      text >= 0.6 ? 'Descrições compatíveis' : 'Descrições pouco semelhantes'];
    if (history) reasons.push('Histórico confirmado compatível');
    if (candidate.items.length > 1 || candidate.transactions.length > 1) reasons.push('Exige conferir o agrupamento');
    if (candidate.transactions.some(t => t.status !== 'COMPLETED')) reasons.push('Requer liquidação');
    if (competing || duplicate) reasons.push('Há outra correspondência plausível');
    if (limited) reasons.push('Busca limitada: podem existir outros candidatos');
    return { ...candidate, confidence: { level: high ? 'HIGH' : exact && (distance <= 3 || text >= 0.4 || history) ? 'MEDIUM' : 'LOW', reasons } };
  });
}

// Bound the combinatorial search. Manual selection remains available outside these suggestions.
export function rankBankCandidates(items: MatchItem[], transactions: MatchTransaction[], accountId: number, neighbors: MatchItem[] = []): BankCandidate[] {
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
  return candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 10);
}
