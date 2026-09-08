import { BankItem, BankLinkChange, BankSearchResult } from './bank-reconciliation';

export interface BankSearchDependency {
  limited: boolean;
  compatible?: { itemIds: number[]; transactionIds: number[] };
  candidates: Array<{ key: string; exact: boolean; itemIds: number[]; transactionIds: number[] }>;
}
export const bankSearchDependency = (result: BankSearchResult): BankSearchDependency => ({ limited: !!result.limited || result.assessment === 'INCOMPLETE', compatible: result.dependencies,
  candidates: result.candidates.map(c => ({ key: c.key, exact: Math.round(Number(c.difference) * 100) === 0, itemIds: c.itemIds, transactionIds: c.transactions.map(t => t.id) })) });
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const within = (a: string, b: string, days: number) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) <= days * 86400_000;
const sameAmount = (a: string, b: string) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
const removed = (candidate: { itemIds: number[]; transactionIds: number[] }, change: BankLinkChange) =>
  candidate.itemIds.some(id => change.items.some(item => item.id === id)) || candidate.transactionIds.some(id => change.transactions.some(t => t.id === id));

// Recompute evidence that can change; simply discard used divergent alternatives elsewhere.
export function bankSearchAffected(item: BankItem, dependency: BankSearchDependency, change: BankLinkChange) {
  if (dependency.compatible && removed(dependency.compatible, change)) return true;
  if (dependency.candidates.some((c, index) => removed(c, change) && (c.exact || index === 0))) return true;
  const moved = [...change.items, ...change.transactions];
  if (moved.some(row => sameAmount(row.amount, item.amount) && within(row.date, item.date, 3))) return true;
  if (dependency.limited && moved.some(row => Math.sign(Number(row.amount)) === Math.sign(Number(item.amount)) && within(row.date, item.date, 7))) return true;
  return change.historyDescriptions.some(description => normalized(description) === normalized(item.description));
}
export function updateBankSearchResult(item: BankItem, result: BankSearchResult, change: BankLinkChange): BankSearchResult | undefined {
  const dependency = bankSearchDependency(result);
  if (bankSearchAffected(item, dependency, change)) return undefined;
  return { ...result, candidates: result.candidates.filter((_, index) => !removed(dependency.candidates[index], change)) };
}
