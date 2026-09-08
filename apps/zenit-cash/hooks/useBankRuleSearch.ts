import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { BankItem, BankLinkChange, BankSearchResult } from '@/lib/bank-reconciliation';
import { updateBankSearchResult } from '@/lib/bank-reconciliation-changes';

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
export function useBankRuleSearch(base: string, items: BankItem[], enabled: boolean, priorityIds: number[], viewKey = '') {
  const cache = useRef(new Map<number, BankRowSearch>());
  const tracked = useRef(new Map<number, BankItem>()), activeChanges = useRef<BankLinkChange[]>([]);
  const [rows, setRows] = useState<Record<number, BankRowSearch>>({});
  const visible = useRef(items), priority = useRef(priorityIds), active = useRef(enabled);
  const blocked = useRef(new Set<number>()), alive = useRef(true), epoch = useRef(0);
  const worker = useRef<AbortController | null>(null);
  const scope = useRef(base);
  const lastView = useRef(viewKey);
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
        const batch = visible.current.filter(item => !item.activeGroupId && !item.ignoredAt && !blocked.current.has(item.id) && cache.current.get(item.id)?.status === 'queued')
          .sort((a, b) => Number(priority.current.includes(b.id)) - Number(priority.current.includes(a.id))).slice(0, 5);
        if (!batch.length) break;
        const started = Date.now();
        activeChanges.current = [];
        for (const item of batch) cache.current.set(item.id, { ...cache.current.get(item.id)!, status: 'searching' });
        publish();
        try {
          const response = await api.post<{ results: BankSearchResult[] }>(`${base}/suggestions/batch`, { itemIds: batch.map(i => i.id), useAi: false }, { signal: abort.signal, timeout: 45000 });
          if (epoch.current !== version || abort.signal.aborted) break;
          for (const item of batch) {
            const entry = cache.current.get(item.id);
            if (!entry || entry.refined) continue;
            let result = response.data.results.find(r => r.itemId === item.id);
            const found = !!result;
            for (const change of activeChanges.current) if (result) result = updateBankSearchResult(item, result, change);
            if (found && !result) { cache.current.set(item.id, { ...entry, status: 'queued', result: undefined, refined: false }); continue; }
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
    if (scope.current !== base) { cache.current.clear(); tracked.current.clear(); blocked.current.clear(); scope.current = base; publish(); }
    return () => { alive.current = false; stop(); };
  }, [base, stop, publish]);

  useEffect(() => {
    if (!enabled) { stop(); publish(); return; }
    const changedView = lastView.current !== viewKey; lastView.current = viewKey;
    for (const item of items) {
      if (item.activeGroupId || item.ignoredAt || blocked.current.has(item.id)) continue;
      tracked.current.set(item.id, item);
      const previous = cache.current.get(item.id);
      if (!previous || previous.signature !== signature(item) || (changedView && previous.status === 'done' && Date.now() - previous.updatedAt > ttl)) {
        cache.current.set(item.id, { status: 'queued', signature: signature(item), updatedAt: 0 });
      }
    }
    const keep = new Set(items.map(i => i.id));
    for (const id of Array.from(cache.current.keys())) {
      if (cache.current.size <= 500) break;
      if (!keep.has(id)) { cache.current.delete(id); tracked.current.delete(id); }
    }
    publish(); void run();
  }, [items, enabled, viewKey, publish, run, stop]);

  const storeResults = useCallback((results: BankSearchResult[]) => {
    for (const result of results) {
      const old = cache.current.get(result.itemId);
      if (old && !blocked.current.has(result.itemId)) cache.current.set(result.itemId, { ...old, status: result.error ? 'error' : 'done', result, refined: true, updatedAt: Date.now() });
    }
    publish();
  }, [publish]);

  const invalidate = useCallback(() => {
    stop();
    cache.current.clear(); tracked.current.clear(); blocked.current.clear(); activeChanges.current = [];
    publish();
  }, [publish, stop]);

  const applyChange = useCallback((change: BankLinkChange) => {
    if (worker.current) activeChanges.current.push(change);
    for (const item of change.items) { blocked.current.add(item.id); cache.current.delete(item.id); tracked.current.delete(item.id); }
    for (const [id, entry] of Array.from(cache.current)) {
      const item = tracked.current.get(id);
      if (!item || !entry.result) continue;
      const result = updateBankSearchResult(item, entry.result, change);
      cache.current.set(id, result ? { ...entry, result } : { ...entry, status: 'queued', result: undefined, refined: false, updatedAt: 0 });
    }
    publish(); void run();
  }, [publish, run]);

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

  return { rows, storeResults, invalidate, applyChange, reject, retry };
}
