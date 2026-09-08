import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { BankAssessment, BankConfidenceLevel, BankItem, BankLinkChange, BankSearchResult } from '@/lib/bank-reconciliation';
import { BankSearchDependency, bankSearchAffected, bankSearchDependency, updateBankSearchResult } from '@/lib/bank-reconciliation-changes';
import { BankRowSearch } from './useBankRuleSearch';

export type BankComputedFilter = 'MISSING' | BankConfidenceLevel;
interface IndexedRow { item: BankItem; dependency: BankSearchDependency; assessment?: BankAssessment; confidence?: BankConfidenceLevel }
const matches = (row: IndexedRow, filter: BankComputedFilter) => filter === 'MISSING' ? row.assessment === 'POSSIBLE_MISSING' : row.confidence === filter;
const queuedRow = (): BankRowSearch => ({ status: 'queued', updatedAt: 0, signature: '' });

// Keep compact search dependencies for scanned items, at most 100 full results, and the month cursor.
// Confirmations update affected items in place instead of restarting the month scan.
export function useBankFilteredSearch(base: string, page: number, filter: BankComputedFilter, enabled: boolean) {
  const index = useRef(new Map<number, IndexedRow>()), cache = useRef(new Map<number, BankRowSearch>());
  const pending = useRef(new Set<number>()), blocked = useRef(new Set<number>()), cursor = useRef(0), atEnd = useRef(false);
  const worker = useRef<AbortController>(), activeChanges = useRef<BankLinkChange[]>([]), alive = useRef(true);
  const current = useRef({ page, filter, enabled }); current.current = { page, filter, enabled };
  const failure = useRef('');
  const [revision, setRevision] = useState(0);
  const [scan, setScan] = useState({ items: [] as BankItem[], rows: {} as Record<number, BankRowSearch>, scanned: 0, incomplete: 0, done: false, atEnd: false, error: '', totalFound: 0 });
  const matchingRows = useCallback(() => Array.from(index.current.values()).filter(row => matches(row, current.current.filter)).sort((a, b) => a.item.id - b.item.id), []);
  const visibleItems = useCallback(() => matchingRows().slice((current.current.page - 1) * 50, current.current.page * 50).map(row => row.item), [matchingRows]);
  const publish = useCallback(() => {
    if (!alive.current) return;
    const matching = matchingRows(), items = matching.slice((current.current.page - 1) * 50, current.current.page * 50).map(row => row.item);
    const keep = new Set(items.map(item => item.id));
    for (const id of Array.from(cache.current.keys())) if (cache.current.size > 100 && !keep.has(id)) cache.current.delete(id);
    const rows = Object.fromEntries(cache.current);
    for (const item of items) if (pending.current.has(item.id) || !rows[item.id]) rows[item.id] = queuedRow();
    setScan({ items, rows, scanned: index.current.size, incomplete: Array.from(index.current.values()).filter(row => row.assessment === 'INCOMPLETE').length,
      done: !pending.current.size && items.every(item => !!cache.current.get(item.id)) && (atEnd.current || matching.length >= current.current.page * 50),
      atEnd: atEnd.current, error: failure.current, totalFound: matching.length });
  }, [matchingRows]);
  const stop = useCallback(() => { worker.current?.abort(); worker.current = undefined; }, []);
  const invalidate = useCallback(() => {
    stop(); index.current.clear(); cache.current.clear(); pending.current.clear(); blocked.current.clear(); activeChanges.current = [];
    cursor.current = 0; atEnd.current = false; failure.current = ''; publish(); setRevision(value => value + 1);
  }, [publish, stop]);
  const accept = useCallback((item: BankItem, result: BankSearchResult, refined = false) => {
    if (item.ignoredAt || item.activeGroupId || blocked.current.has(item.id)) return;
    const dependency = bankSearchDependency(result);
    // Divergent alternatives other than the first cannot change membership or confidence.
    dependency.candidates = dependency.candidates.filter((candidate, position) => !position || candidate.exact);
    index.current.set(item.id, { item, dependency, assessment: result.error ? 'INCOMPLETE' : result.assessment, confidence: result.candidates[0]?.confidence?.level });
    cache.current.set(item.id, { status: result.error ? 'error' : 'done', result, refined, updatedAt: Date.now(), signature: '' });
    pending.current.delete(item.id);
  }, []);
  const run = useCallback(async () => {
    if (worker.current || !current.current.enabled || !alive.current || failure.current) return;
    const abort = new AbortController(); worker.current = abort;
    try {
      while (current.current.enabled && !abort.signal.aborted) {
        const visible = visibleItems();
        const ids = Array.from(new Set([...Array.from(pending.current), ...visible.filter(item => !cache.current.has(item.id)).map(item => item.id)])).slice(0, 5);
        if (!ids.length && (atEnd.current || matchingRows().length >= current.current.page * 50)) break;
        const started = Date.now(); activeChanges.current = [];
        let rows: Array<{ item: BankItem; result: BankSearchResult }>, nextCursor: number | null | undefined;
        if (ids.length) {
          const response = await api.post<{ results: BankSearchResult[] }>(`${base}/suggestions/batch`, { itemIds: ids, useAi: false }, { signal: abort.signal, timeout: 45000 });
          if (abort.signal.aborted) return;
          rows = ids.flatMap(id => { const entry = index.current.get(id); return entry ? [{ item: entry.item,
            result: response.data.results.find(result => result.itemId === id) || { itemId: id, candidates: [], error: 'Busca incompleta. Atualize para tentar novamente.' } }] : []; });
        } else {
          const response = await api.get<{ rows: Array<{ item: BankItem; result: BankSearchResult }>; nextCursor: number | null }>(`${base}/${current.current.filter === 'MISSING' ? 'missing' : 'scan'}`,
            { params: { afterId: cursor.current }, signal: abort.signal, timeout: 45000 });
          if (abort.signal.aborted) return;
          rows = response.data.rows; nextCursor = response.data.nextCursor;
          if (nextCursor !== null && !rows.length) throw new Error('NO_PROGRESS');
        }
        for (const { item, result } of rows) {
          if (blocked.current.has(item.id) || cache.current.get(item.id)?.refined) continue;
          let updated: BankSearchResult | undefined = result;
          for (const change of activeChanges.current) if (updated) updated = updateBankSearchResult(item, updated, change);
          accept(item, updated || result);
          if (!updated) { pending.current.add(item.id); cache.current.delete(item.id); }
        }
        if (nextCursor !== undefined) { cursor.current = nextCursor ?? rows.at(-1)?.item.id ?? cursor.current; atEnd.current = nextCursor === null; }
        publish();
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
          const timer = setTimeout(finish, Math.max(0, 600 - (Date.now() - started)));
          abort.signal.addEventListener('abort', finish, { once: true });
          if (abort.signal.aborted) finish();
        });
      }
    } catch (error: any) {
      if (!abort.signal.aborted) { failure.current = error.response?.data?.error || 'Busca interrompida. Tente novamente para continuar.'; publish(); }
    } finally { if (worker.current === abort) worker.current = undefined; }
  }, [base, accept, matchingRows, publish, visibleItems]);

  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; stop(); }; }, [base, invalidate, stop]);
  useEffect(() => { stop(); publish(); if (enabled) void run(); return stop; }, [page, filter, enabled, revision, publish, run, stop]);
  const applyChange = useCallback((change: BankLinkChange) => {
    if (worker.current) activeChanges.current.push(change);
    for (const item of change.items) { blocked.current.add(item.id); index.current.delete(item.id); cache.current.delete(item.id); pending.current.delete(item.id); }
    for (const [id, entry] of Array.from(index.current)) {
      if (bankSearchAffected(entry.item, entry.dependency, change)) { pending.current.add(id); cache.current.delete(id); }
      else {
        const cached = cache.current.get(id);
        if (cached?.result) cache.current.set(id, { ...cached, result: updateBankSearchResult(entry.item, cached.result, change) });
      }
    }
    publish(); void run();
  }, [publish, run]);
  const recheck = useCallback((ids: number[]) => {
    for (const id of ids) if (index.current.has(id) && !blocked.current.has(id)) { pending.current.add(id); cache.current.delete(id); }
    publish(); void run();
  }, [publish, run]);
  const storeResults = useCallback((results: BankSearchResult[]) => {
    for (const result of results) { const item = index.current.get(result.itemId)?.item; if (item) accept(item, result, true); }
    publish();
  }, [accept, publish]);
  const retry = useCallback(() => { failure.current = ''; publish(); void run(); }, [publish, run]);
  return { ...scan, invalidate, applyChange, recheck, storeResults, retry, searching: enabled && !scan.done && !scan.error };
}
