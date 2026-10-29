import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BankCandidate, BankDiagnosis, BankItem, BankSearchResult, BankTransaction, bankCurrency, bankDate } from '@/lib/bank-reconciliation';
import { BankRowSearch } from '@/hooks/useBankRuleSearch';
import { BankMatchConfidence } from './BankMatchConfidence';
import BankManualMatchSearch from './BankManualMatchSearch';

export const bankDiagnosisLabels: Record<BankDiagnosis, string> = {
  READY: 'Prontos para conferir', AMBIGUOUS: 'Comparar alternativas', AMOUNT_DIFFERENCE: 'Conferir valor',
  DATE_DIFFERENCE: 'Conferir data', SETTLEMENT: 'Conferir liquidação', GROUPED: 'Conferir agrupamento',
  MISSING: 'Sem correspondência', INCOMPLETE: 'Ampliar investigação'
};
const guidance: Record<BankDiagnosis, string> = {
  READY: 'Valor e data conferem. Revise a descrição e confirme se representam a mesma operação.',
  AMBIGUOUS: 'Há mais de uma possibilidade. Compare as alternativas antes de confirmar.',
  AMOUNT_DIFFERENCE: 'Há um lançamento parecido com valor diferente. Confira o registro existente antes de criar outro.',
  DATE_DIFFERENCE: 'O valor confere, mas as datas são diferentes. Verifique se é a mesma operação.',
  SETTLEMENT: 'O lançamento ainda está pendente no Cash. A conferência permite liquidar e vincular com sua confirmação.',
  GROUPED: 'Mais de um registro compõe este valor. Confira cada item do agrupamento.',
  MISSING: 'A busca não encontrou uma correspondência relevante. Amplie a busca antes de registrar um lançamento faltante.',
  INCOMPLETE: 'A busca atingiu um limite ou há lançamentos com acesso restrito. Isso não significa que o lançamento esteja faltando.'
};
interface Props {
  accountId: number; month: string; base: string; items: BankItem[]; selected: BankItem[]; rows: Record<number, BankRowSearch>;
  filter: string; page: number; total: number; loading: boolean; busy: boolean; closed: boolean; initialFocusId?: number;
  scan?: { scanned: number; searching: boolean; atEnd: boolean; done: boolean; incomplete: number; error: string };
  groupResults: BankSearchResult[]; searchingGroup: boolean; aiBusy: boolean; message: string;
  onFilter: (filter: string) => void; onPage: (page: number) => void; onSelect: (items: BankItem[]) => void;
  onReview: (items: BankItem[], transactions: BankTransaction[], candidate?: BankCandidate, cacheId?: number) => void;
  onReject: (candidate: BankCandidate) => void; onCreate: (items: BankItem[]) => void; onIgnore: (item: BankItem) => void;
  onAi: (item: BankItem) => void; onRetry: (item: BankItem) => void; onRetryScan: () => void;
  onBatch: () => void; onGroup: () => void; onAudit: () => void;
}

export default function BankGuidedQueue(props: Props) {
  const { items, rows, selected, busy, closed, loading } = props;
  const [focusId, setFocusId] = useState<number | undefined>(props.initialFocusId);
  const [candidateKey, setCandidateKey] = useState(''), [manualOpen, setManualOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [search, setSearch] = useState('');
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const previousIds = useRef<number[]>([]);
  const visible = items.filter(item => !search || `${item.description} ${item.amount} ${bankDate(item.date)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const focused = visible.find(item => item.id === focusId) || visible[0];
  useEffect(() => {
    if (!loading && visible.length && !visible.some(item => item.id === focusId)) {
      const previousIndex = previousIds.current.indexOf(focusId || 0);
      const next = previousIds.current.slice(previousIndex + 1).find(id => visible.some(item => item.id === id));
      setFocusId(next || visible[0].id);
    }
    if (!loading) previousIds.current = visible.map(item => item.id);
  }, [items, search, focusId, loading]);
  useEffect(() => { setCandidateKey(''); setManualOpen(false); setGroupMode(false); }, [focused?.id]);
  useEffect(() => { if (!selected.length) setGroupMode(false); }, [selected.length]);
  const entry = focused ? rows[focused.id] : undefined;
  const result = groupMode ? props.groupResults[0] : entry?.result;
  const candidate = result?.candidates.find(c => c.key === candidateKey) || result?.candidates[0];
  const diagnosis = result?.diagnosis || (result?.assessment === 'INCOMPLETE' ? 'INCOMPLETE' : result?.assessment === 'POSSIBLE_MISSING' ? 'MISSING' : undefined);
  const contextItems = groupMode ? selected : focused ? [focused] : [];
  const eligible = visible.filter(item => !item.activeGroupId && !item.ignoredAt);
  const canGroup = selected.length > 1 && selected.length <= 20 && new Set(selected.map(item => Math.sign(Number(item.amount)))).size === 1;
  const canBatch = selected.length > 0 && selected.every(item => rows[item.id]?.status === 'done' && !rows[item.id]?.result?.error);
  const returnTo = `/financial/accounts/${props.accountId}/reconciliation-v2?month=${props.month}${focused ? `&focus=${focused.id}` : ''}&page=${props.page}&filter=${props.filter}`;
  const selectedAll = eligible.length > 0 && eligible.every(item => selected.some(s => s.id === item.id));
  function focus(item: BankItem) {
    setFocusId(item.id); setGroupMode(false); setCandidateKey(''); setManualOpen(false);
    if (window.matchMedia('(max-width: 1279px)').matches) focusHeading.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  function focusNext() {
    const index = visible.findIndex(item => item.id === focused?.id);
    if (index + 1 < visible.length) focus(visible[index + 1]);
    focusHeading.current?.focus();
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-xs text-text-muted">O que precisa de atenção?
        <select aria-label="Filtrar fila de conciliação" value={props.filter} disabled={busy || loading} onChange={e => { props.onFilter(e.target.value); setSearch(''); }} className="mt-1 block w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm text-text">
          <option value="PENDING">Todas as pendências</option>
          {Object.entries(bankDiagnosisLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          <option value="CONFIRMED">Conciliados</option><option value="IGNORED">Ignorados</option><option value="ALL">Todos os movimentos</option>
        </select>
      </label>
      <label className="min-w-48 flex-1 text-xs text-text-muted">Localizar nesta página
        <input aria-label="Localizar movimento nesta página" value={search} onChange={e => setSearch(e.target.value)} disabled={busy} placeholder="Descrição, data ou valor" className="mt-1 block w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm text-text" />
      </label>
    </div>
    {props.scan && <div className="text-xs text-text-muted" role="status">{props.scan.searching ? 'Analisando o mês… ' : ''}{props.scan.scanned} movimentos analisados{props.scan.atEnd ? ' · Busca concluída' : ''}.
      {props.scan.incomplete > 0 && <span> {props.scan.incomplete} buscas incompletas.</span>}
      {props.scan.error && <p className="mt-1 text-tone-amber">{props.scan.error} <button className="underline" disabled={busy} onClick={props.onRetryScan}>Continuar busca</button></p>}
    </div>}
    {!closed && <details className="rounded-lg border border-border bg-surface p-3 text-sm" open={selected.length ? true : undefined}><summary className="cursor-pointer text-text-muted">Conferir vários movimentos{selected.length ? ` (${selected.length} selecionados)` : ''}</summary><div className="mt-3 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Selecionar pendências desta página" checked={selectedAll} disabled={busy || loading || !eligible.length}
        onChange={() => props.onSelect(selectedAll ? [] : eligible)} />Selecionar página</label>
      <span className="text-text-muted">{selected.length} selecionado(s)</span>
      <Button variant="outline" disabled={busy || props.aiBusy || !canBatch} onClick={props.onBatch}>Conferir lote</Button>
      {selected.length > 1 && <Button variant="outline" disabled={busy || !canGroup || props.searchingGroup} onClick={() => { setGroupMode(true); setCandidateKey(''); setManualOpen(false); props.onGroup(); }}>Comparar pela soma</Button>}
      {!!selected.length && <button className="text-xs text-tone-blue underline" disabled={busy} onClick={() => props.onSelect([])}>Limpar seleção</button>}
    </div></details>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.4fr)]">
      <section aria-label="Fila de movimentos" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3"><h2 className="font-semibold">Movimentos do extrato</h2><span className="text-xs text-text-muted">{visible.length} nesta página</span></div>
        {loading && <p role="status" className="p-4 text-sm text-text-muted">Carregando movimentos…</p>}
        {!visible.length && !loading && <p className="p-6 text-sm text-text-muted">{props.scan?.searching ? 'Procurando movimentos neste filtro…' : 'Nenhum movimento neste filtro.'}</p>}
        <div className="max-h-[28rem] overflow-y-auto xl:max-h-[65vh]">{visible.map(item => {
          const row = rows[item.id];
          const status = item.activeGroupId ? 'Conciliado' : item.ignoredAt ? 'Ignorado' : closed ? 'Para conferir'
            : row?.status === 'error' ? 'Busca interrompida' : row?.status !== 'done' ? 'Analisando…' : row.result?.diagnosis ? bankDiagnosisLabels[row.result.diagnosis] : 'Para conferir';
          return <div key={item.id} className={`flex items-start gap-2 border-b border-border p-3 last:border-0 ${focused?.id === item.id ? 'bg-tone-blue-soft ring-1 ring-inset ring-tone-blue/30' : ''}`}>
            {!closed && !item.activeGroupId && !item.ignoredAt && <input type="checkbox" className="mt-1" aria-label={`Incluir ${item.description} no lote`} checked={selected.some(s => s.id === item.id)} disabled={busy || loading}
              onChange={() => props.onSelect(selected.some(s => s.id === item.id) ? selected.filter(s => s.id !== item.id) : [...selected, item])} />}
            <button className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-pressed={focused?.id === item.id} aria-label={`Conferir ${item.description}`} disabled={busy} onClick={() => focus(item)}>
              <span className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-medium">{item.description}</span><strong className="whitespace-nowrap text-sm">{bankCurrency(item.amount)}</strong></span>
              <span className="mt-1 block text-xs text-text-muted">{bankDate(item.date)} · {status}</span>
            </button>
          </div>;
        })}</div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-text-muted"><Button variant="outline" disabled={busy || loading || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>Anterior</Button>
          <span>Página {props.page}</span><Button variant="outline" disabled={busy || loading || (props.scan ? !props.scan.done || (props.scan.atEnd && props.page * 50 >= props.total) : props.page * 50 >= props.total)} onClick={() => props.onPage(props.page + 1)}>Próxima</Button>
        </div>
      </section>
      <section aria-label="Conferência do movimento" className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 ref={focusHeading} tabIndex={-1} className="font-semibold">{groupMode ? 'Conferir agrupamento' : 'Conferir movimento'}</h2>
          <button className="inline-flex items-center gap-1 text-xs text-tone-blue disabled:opacity-40" disabled={busy || !focused || focused.id === visible.at(-1)?.id} onClick={focusNext}>Próximo <ArrowRight size={14} /></button>
        </div>
        {!focused ? <p className="py-10 text-sm text-text-muted">Escolha um movimento para comparar com o Cash.</p> : !groupMode && (focused.activeGroupId || focused.ignoredAt) || closed ? <div className="space-y-3 py-5">
          <p className="break-words font-medium">{focused.description}</p><p>{bankDate(focused.date)} · {bankCurrency(focused.amount)}</p>
          {focused.activeGroupId ? <Button variant="outline" onClick={props.onAudit}>Ver vínculo no histórico</Button> : focused.ignoredAt && !closed ? <Button variant="outline" disabled={busy} onClick={() => props.onIgnore(focused)}>Voltar a conferir</Button> : <p className="text-sm text-text-muted">Reabra o mês para trabalhar nas pendências.</p>}
        </div> : <>
          {diagnosis && <div className="my-4 rounded-lg bg-background p-3"><p className="text-sm font-semibold">{bankDiagnosisLabels[diagnosis]}</p><p className="mt-1 text-sm text-text-muted">{guidance[diagnosis]}</p></div>}
          {(props.searchingGroup && groupMode || !groupMode && entry?.status !== 'done' && entry?.status !== 'error') && <p role="status" className="my-4 text-sm text-text-muted">Buscando correspondências…</p>}
          {!groupMode && entry?.status === 'error' && <p role="alert" className="my-3 text-sm text-tone-amber">{entry.result?.error} <button className="underline" disabled={busy} onClick={() => props.onRetry(focused)}>Tentar novamente</button></p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-border p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">No extrato</h3>
              {(candidate?.items || contextItems).map(item => <div key={item.id} className="mb-3 last:mb-0"><p className="break-words text-sm">{item.description}</p><p className="mt-2 text-lg font-semibold">{bankCurrency(item.amount)}</p><p className="mt-1 text-xs text-text-muted">{bankDate(item.date)}</p></div>)}
            </div>
            <div className="min-w-0 rounded-lg border border-border p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">No Cash</h3>
              {candidate ? candidate.transactions.map(transaction => <div key={transaction.id} className="mb-3 last:mb-0"><p className="break-words text-sm">{transaction.description}</p><p className="mt-2 text-lg font-semibold">{bankCurrency(transaction.amount)}</p><p className="mt-1 text-xs text-text-muted">{bankDate(transaction.date)} · {transaction.status === 'PENDING' ? 'Pendente' : 'Liquidado'}</p>
                <Link className="mt-2 inline-block text-xs text-tone-blue underline" href={{ pathname: `/financial/transactions/${transaction.id}`, query: { returnTo } }}>Abrir para conferir ou corrigir</Link>
              </div>) : <p className="py-3 text-sm text-text-muted">Nenhuma correspondência selecionada.</p>}
            </div>
          </div>
          {candidate && <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><BankMatchConfidence confidence={candidate.confidence} /><span className={`text-sm font-semibold ${Number(candidate.difference) ? 'text-tone-amber' : 'text-tone-emerald'}`}>Diferença: {bankCurrency(candidate.difference)}</span></div>
            <p className="text-xs text-text-muted">{Array.from(new Set(candidate.confidence?.reasons || [candidate.reason])).join(' · ')}.</p>
            {Number(candidate.difference) !== 0 && <p className="text-sm text-tone-amber">Confira o valor no lançamento do Cash. O vínculo só poderá ser confirmado quando os totais conferirem.</p>}
            <div className="flex flex-wrap gap-2"><Button disabled={busy || props.aiBusy || Number(candidate.difference) !== 0} onClick={() => props.onReview(candidate.items, candidate.transactions, candidate, result?.cacheId)}><Check size={15} /> Conferir e confirmar</Button>
              <Button variant="outline" disabled={busy || props.aiBusy} onClick={() => props.onReject(candidate)}>Não corresponde</Button></div>
            {!!result && result.candidates.length > 1 && <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer text-tone-blue">Comparar outras {result.candidates.length - 1} alternativas</summary>
              {result.candidates.filter(c => c.key !== candidate.key).map(alternative => <button key={alternative.key} disabled={busy} onClick={() => setCandidateKey(alternative.key)} className="mt-2 block w-full rounded border border-border p-2 text-left hover:bg-background">
                <span className="block break-words">{alternative.transactions.map(t => t.description).join(' + ')}</span><span className="text-xs text-text-muted">{bankCurrency(alternative.amount)} · {alternative.transactions.map(t => bankDate(t.date)).join(', ')} · Diferença {bankCurrency(alternative.difference)}</span>
              </button>)}
            </details>}
          </div>}
          {result?.searchWindowDays === 31 && <p className="mt-3 text-xs text-text-muted">Busca ampliada para até 31 dias antes e depois do movimento, com valor exato e evidência na descrição.</p>}
          {result?.aiMessage && <p className="mt-3 rounded border border-border p-3 text-sm text-text-muted">{result.aiMessage}</p>}
          {props.message && <p role="status" className="mt-3 text-sm text-tone-amber">{props.message}</p>}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" disabled={busy} onClick={() => setManualOpen(open => !open)}><Search size={15} /> {manualOpen ? 'Fechar busca manual' : 'Buscar no Cash'}</Button>
            {!groupMode && candidate && ['MEDIUM_LOW', 'LOW'].includes(candidate.confidence?.level || '') && <Button variant="outline" disabled={busy || props.aiBusy || !!result?.cacheId} onClick={() => props.onAi(focused)}>{props.aiBusy ? 'Consultando IA…' : result?.cacheId ? 'Parecer da IA recebido' : 'Solicitar parecer da IA'}</Button>}
          </div>
          {manualOpen && <BankManualMatchSearch key={contextItems.map(i => i.id).join(',')} base={props.base} items={contextItems} returnTo={returnTo} disabled={busy} onReview={props.onReview} />}
          <details className="mt-4 text-sm"><summary className="cursor-pointer text-text-muted">Outras ações para este movimento</summary>
            <p className="my-2 text-xs text-text-muted">Antes de criar, confira se o lançamento já existe. Ignorar retira a pendência e não corrige o saldo.</p>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => props.onCreate(contextItems)}>Registrar lançamento faltante</Button>
              {!groupMode && <Button variant="outline" disabled={busy} onClick={() => props.onIgnore(focused)}>Ignorar movimento</Button>}</div>
          </details>
        </>}
      </section>
    </div>
  </div>;
}
