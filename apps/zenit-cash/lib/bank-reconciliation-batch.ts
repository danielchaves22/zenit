import type { BankBatchSnapshot } from '@/components/financial/BankBatchReview';
import type { BankRowSearch } from '@/hooks/useBankRuleSearch';
import { BankItem } from './bank-reconciliation';

export function bankBatchSnapshot(items: BankItem[], rows: Record<number, BankRowSearch>): BankBatchSnapshot {
  const snapshot: BankBatchSnapshot = { candidates: [], excluded: [] };
  const counts = new Map<number, number>();
  for (const item of items) for (const transaction of rows[item.id]?.result?.candidates[0]?.transactions || []) counts.set(transaction.id, (counts.get(transaction.id) || 0) + 1);
  for (const item of items) {
    const entry = rows[item.id], candidate = entry?.result?.candidates[0];
    let reason = '';
    if (item.ignoredAt) reason = 'Movimento ignorado.';
    else if (!candidate) reason = 'Nenhuma correspondência encontrada.';
    else if (entry.status !== 'done' || entry.result?.error) reason = 'A busca ainda não foi concluída.';
    else if (candidate.itemIds.length !== 1 || candidate.transactions.length !== 1) reason = 'Correspondência agrupada: revise os movimentos e lançamentos envolvidos individualmente.';
    else if (candidate.transactions.some(transaction => counts.get(transaction.id)! > 1)) reason = 'O mesmo lançamento foi sugerido para mais de um movimento selecionado.';
    else if (candidate.transactions[0].status !== 'COMPLETED') reason = 'O lançamento ainda precisa ser liquidado na conferência individual.';
    else if (Math.round(Number(candidate.difference) * 100) !== 0) reason = 'Há diferença de valores entre o extrato e o lançamento.';
    else if (!candidate.feedbackToken || !candidate.confidence) reason = 'Atualize a busca para obter uma sugestão válida.';
    if (reason) snapshot.excluded.push({ item, reason });
    else snapshot.candidates.push(candidate!);
  }
  return snapshot;
}
