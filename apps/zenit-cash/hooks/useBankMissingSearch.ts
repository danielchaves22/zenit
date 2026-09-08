import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { BankItem, BankSearchResult } from '@/lib/bank-reconciliation';
import { BankRowSearch } from './useBankRuleSearch';

type Checkpoint = { afterId: number; scanned: number; incomplete: number };
type Scan = Checkpoint & { page: number; items: BankItem[]; rows: Record<number, BankRowSearch>; done: boolean; atEnd: boolean; error: string };
const initial = (page = 1, checkpoint: Checkpoint = { afterId: 0, scanned: 0, incomplete: 0 }): Scan => ({ ...checkpoint, page, items: [], rows: {}, done: false, atEnd: false, error: '' });

// Scan the whole month in five-row chunks. Retain just the current page and lightweight cursors.
export function useBankMissingSearch(base: string, page: number, enabled: boolean) {
  const state = useRef<Scan>(initial());
  const checkpoints = useRef(new Map<number, Checkpoint>());
  const [scan, setScan] = useState(state.current);
  const worker = useRef<AbortController>();
  const active = useRef(enabled), alive = useRef(true);
  active.current = enabled;
  const publish = useCallback(() => { if (alive.current) setScan({ ...state.current }); }, []);
  const stop = useCallback(() => { worker.current?.abort(); worker.current = undefined; }, []);
  const invalidate = useCallback(() => { stop(); checkpoints.current.clear(); state.current = initial(); publish(); }, [stop, publish]);

  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; stop(); }; }, [base, invalidate, stop]);
  useEffect(() => {
    stop();
    if (state.current.page !== page) { state.current = initial(page, checkpoints.current.get(page)); publish(); }
    if (!enabled || state.current.done || state.current.error) return;
    const abort = new AbortController(); worker.current = abort;
    void (async () => {
      try {
        while (active.current && !abort.signal.aborted && !state.current.done) {
          const started = Date.now();
          const response = await api.get<{ rows: Array<{ item: BankItem; result: BankSearchResult }>; nextCursor: number | null }>(`${base}/missing`,
            { params: { afterId: state.current.afterId }, signal: abort.signal, timeout: 45000 });
          if (abort.signal.aborted) return;
          const next = { ...state.current, items: [...state.current.items], rows: { ...state.current.rows } };
          let consumed = 0;
          for (const { item, result } of response.data.rows) {
            consumed++; next.afterId = item.id; next.scanned++;
            if (result.error || result.assessment === 'INCOMPLETE' || !result.assessment) next.incomplete++;
            if (!result.error && result.assessment === 'POSSIBLE_MISSING') {
              next.items.push(item);
              next.rows[item.id] = { result, status: 'done', signature: '', updatedAt: Date.now() };
            }
            if (next.items.length === 50) break;
          }
          next.atEnd = response.data.nextCursor === null && consumed === response.data.rows.length;
          next.done = next.atEnd || next.items.length === 50;
          if (!next.atEnd && !consumed) throw new Error('A busca não avançou. Atualize para tentar novamente.');
          if (next.done && !next.atEnd) checkpoints.current.set(page + 1, { afterId: next.afterId, scanned: next.scanned, incomplete: next.incomplete });
          state.current = next; publish();
          if (!next.done) await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, Math.max(0, 600 - (Date.now() - started)));
            abort.signal.addEventListener('abort', finish, { once: true });
            if (abort.signal.aborted) finish();
          });
        }
      } catch (error: any) {
        if (!abort.signal.aborted) { state.current = { ...state.current, error: error.response?.data?.error || 'Busca interrompida. Tente novamente para continuar.' }; publish(); }
      } finally { if (worker.current === abort) worker.current = undefined; }
    })();
    return stop;
  }, [base, page, enabled, stop, publish, scan.error]);

  const retry = useCallback(() => { state.current = { ...state.current, error: '' }; publish(); }, [publish]);
  return { ...scan, invalidate, retry, searching: enabled && !scan.done && !scan.error };
}
