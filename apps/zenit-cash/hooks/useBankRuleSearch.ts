import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { BankItem, BankSearchResult } from '@/lib/bank-reconciliation';

export interface BankRowSearch {
  status: 'queued' | 'searching' | 'done' | 'error';
  result?: BankSearchResult;
  refined?: boolean;
  updatedAt: number;
  signature: string;
}
const signature = (item: BankItem) => JSON.stringify([item.id, item.date, item.amount, item.description]);
const ttl = 5 * 60_000;

// A workspace-local, bounded cache: no progress records or statement data in browser storage.
export function useBankRuleSearch(base: string, items: BankItem[], enabled: boolean, priorityIds: number[]) {
  const cache = useRef(new Map<number, BankRowSearch>());
  const [rows, setRows] = useState<Record<number, BankRowSearch>>({});
  const visible = useRef(items), priority = useRef(priorityIds), active = useRef(enabled);
  const blocked = useRef(new Set<number>()), alive = useRef(true), epoch = useRef(0);
  const worker = useRef<AbortController | null>(null);
  const scope = useRef(base);
  const publish = useCallback(() => { if (alive.current) setRows(Object.fromEntries(cache.current)); }, []);
  visible.current = items; priority.current = priorityIds; active.current = enabled;

  const stop = useCallback(() => {
    epoch.current++; worker.current?.abort(); worker.current = null;
    for (const [id, entry] of Array.from(cache.current)) if (entry.status === 'searching') cache.current.set(id, { ...entry, status: 'queued' });
  }, []);

  const run = useCallback(async () => {
    if (worker.current || !active.current || !alive.current) return;
    const abort = new AbortController(); worker.current = abort;
    const version = epoch.current;
    try {
      while (active.current && !abort.signal.aborted) {
        const batch = visible.current.filter(item => !item.activeGroupId && !blocked.current.has(item.id) && cache.current.get(item.id)?.status === 'queued')
          .sort((a, b) => Number(priority.current.includes(b.id)) - Number(priority.current.includes(a.id))).slice(0, 5);
        if (!batch.length) break;
        const started = Date.now();
        for (const item of batch) cache.current.set(item.id, { ...cache.current.get(item.id)!, status: 'searching' });
        publish();
        try {
          const response = await api.post<{ results: BankSearchResult[] }>(`${base}/suggestions/batch`, { itemIds: batch.map(i => i.id), useAi: false }, { signal: abort.signal, timeout: 45000 });
          if (epoch.current !== version || abort.signal.aborted) break;
          for (const item of batch) {
            const entry = cache.current.get(item.id);
            if (!entry || entry.refined) continue;
            const result = response.data.results.find(r => r.itemId === item.id);
            cache.current.set(item.id, { ...entry, status: result && !result.error ? 'done' : 'error', updatedAt: Date.now(),
              result: result || { itemId: item.id, candidates: [], error: 'Não foi possível buscar este movimento. Tente novamente.' } });
          }
        } catch (error: any) {
          if (epoch.current !== version || abort.signal.aborted) break;
          for (const item of batch) {
            const entry = cache.current.get(item.id);
            if (entry && !entry.refined) cache.current.set(item.id, { ...entry, status: 'error', updatedAt: Date.now(), result: {
              itemId: item.id, candidates: entry.result?.candidates || [], error: error.response?.data?.error || 'Falha na busca. Tente novamente.' } });
          }
          // Do not hammer a rate-limited or unavailable server with the rest of the page.
          if (!error.response || error.response.status === 429 || error.response.status >= 500) {
            for (const [id, entry] of Array.from(cache.current)) if (entry.status === 'queued') cache.current.set(id, { ...entry, status: 'error',
              result: { itemId: id, candidates: [], error: 'Busca interrompida. Tente novamente.' } });
            publish(); break;
          }
        }
        publish();
        // At most one rule request at a time and fewer than 120 requests/minute.
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
          const timer = setTimeout(finish, Math.max(0, 600 - (Date.now() - started)));
          abort.signal.addEventListener('abort', finish, { once: true });
          if (abort.signal.aborted) finish();
        });
      }
    } finally { if (worker.current === abort) worker.current = null; }
  }, [base, publish]);

  useEffect(() => {
    alive.current = true;
    if (scope.current !== base) { cache.current.clear(); blocked.current.clear(); scope.current = base; publish(); }
    return () => { alive.current = false; stop(); };
  }, [base, stop, publish]);

  useEffect(() => {
    if (!enabled) { stop(); publish(); return; }
    for (const item of items) {
      if (item.activeGroupId || blocked.current.has(item.id)) continue;
      const previous = cache.current.get(item.id);
      if (!previous || previous.signature !== signature(item) || (previous.status === 'done' && Date.now() - previous.updatedAt > ttl)) {
        cache.current.set(item.id, { status: 'queued', signature: signature(item), updatedAt: 0 });
      }
    }
    const keep = new Set(items.map(i => i.id));
    for (const id of Array.from(cache.current.keys())) {
      if (cache.current.size <= 500) break;
      if (!keep.has(id)) cache.current.delete(id);
    }
    publish(); void run();
  }, [items, enabled, publish, run, stop]);

  const storeResults = useCallback((results: BankSearchResult[]) => {
    for (const result of results) {
      const old = cache.current.get(result.itemId);
      if (old && !blocked.current.has(result.itemId)) cache.current.set(result.itemId, { ...old, status: 'done', result, refined: true, updatedAt: Date.now() });
    }
    publish();
  }, [publish]);

  const invalidate = useCallback((itemIds?: number[], transactionIds: number[] = []) => {
    stop();
    if (!itemIds) { cache.current.clear(); blocked.current.clear(); }
    else {
      itemIds.forEach(id => { blocked.current.add(id); cache.current.delete(id); });
      for (const [id, entry] of Array.from(cache.current)) if (entry.result?.candidates.some(c => c.itemIds.some(i => itemIds.includes(i)) || c.transactions.some(t => transactionIds.includes(t.id)))) {
        cache.current.set(id, { ...entry, status: 'queued', result: undefined, refined: false, updatedAt: 0 });
      }
    }
    publish();
  }, [publish, stop]);

  const reject = useCallback((key: string) => {
    stop();
    for (const [id, entry] of Array.from(cache.current)) if (entry.result?.candidates.some(c => c.key === key)) {
      cache.current.set(id, { ...entry, status: 'queued', result: undefined, refined: false, updatedAt: 0 });
    }
    publish(); void run();
  }, [publish, run, stop]);

  const retry = useCallback((id: number) => {
    const entry = cache.current.get(id);
    if (entry) cache.current.set(id, { ...entry, status: 'queued', result: undefined, refined: false });
    publish(); void run();
  }, [publish, run]);

  return { rows, storeResults, invalidate, reject, retry };
}
