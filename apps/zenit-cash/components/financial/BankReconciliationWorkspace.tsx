import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Scale, Upload, RefreshCw, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useToast } from '@/components/ui/ToastContext';
import BankMatchReview from './BankMatchReview';
import BankMatchSuggestions from './BankMatchSuggestions';
import { BankAudit, BankCandidate, BankItem, BankPreview, BankSearchResult, BankTransaction, BankWorkspace, bankCurrency, bankDate, bankTimestamp, bankTotal } from '@/lib/bank-reconciliation';

const fieldClass = 'rounded border border-gray-600 bg-background px-3 py-2 text-sm text-white disabled:opacity-50';
const panelClass = 'p-0 min-w-0 [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-col [&>div]:p-4 lg:min-h-0';
const errorMessage = (error: any) => error.response?.data?.error || error.response?.data?.errors?.[0]?.message || 'Não foi possível concluir a operação.';
const eventLabels: Record<string, string> = { IMPORT: 'Extrato importado', CONFIRM: 'Correspondência confirmada', UNDO: 'Vínculo desfeito', COMPLETE: 'Mês concluído', REOPEN: 'Mês reaberto', TRANSACTION_CHANGED: 'Lançamento alterado: revisão necessária', NEW_STATEMENT_ITEMS: 'Novos itens: mês reaberto', MONTH_TRANSACTIONS_CHANGED: 'Movimentação do mês alterada: revisão necessária' };

function Pagination({ page, total, size, disabled, onChange }: { page: number; total: number; size: number; disabled?: boolean; onChange: (page: number) => void }) {
  return <div className="mt-4 flex items-center justify-between gap-2 text-sm text-gray-400">
    <span>{total} registro(s) · Página {page} de {Math.max(1, Math.ceil(total / size))}</span>
    <div className="flex gap-2"><Button variant="outline" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Anterior</Button><Button variant="outline" disabled={disabled || page * size >= total} onClick={() => onChange(page + 1)}>Próxima</Button></div>
  </div>;
}

export default function BankReconciliationWorkspace({ accountId, month, onMonthChange }: { accountId: number; month: string; onMonthChange: (month: string) => void }) {
  const { addToast } = useToast();
  const [data, setData] = useState<BankWorkspace | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [tab, setTab] = useState<'statement' | 'transactions' | 'audit'>('statement');
  const [page, setPage] = useState(1), [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState<BankItem[]>([]);
  const [results, setResults] = useState<BankSearchResult[]>([]), [suggesting, setSuggesting] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState(''), [searchAsGroup, setSearchAsGroup] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [review, setReview] = useState<{ items: BankItem[]; transactions: BankTransaction[]; candidate?: BankCandidate; cacheId?: number } | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [upload, setUpload] = useState<{ fileName: string; fileBase64: string; preview: BankPreview } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [transactions, setTransactions] = useState<{ items: BankTransaction[]; total: number }>({ items: [], total: 0 });
  const [transactionPage, setTransactionPage] = useState(1), [search, setSearch] = useState(''), [searchDraft, setSearchDraft] = useState(''), [days, setDays] = useState(0);
  const [manual, setManual] = useState<BankTransaction[]>([]);
  const [audit, setAudit] = useState<BankAudit | null>(null), [auditPage, setAuditPage] = useState(1);
  const [undoId, setUndoId] = useState<number | null>(null), [undoNote, setUndoNote] = useState('');
  const [creating, setCreating] = useState(false), [description, setDescription] = useState(''), [createDate, setCreateDate] = useState('');
  const [categoryId, setCategoryId] = useState(''), [transfer, setTransfer] = useState(false), [transferAccountId, setTransferAccountId] = useState('');
  const [categories, setCategories] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: number; name: string; type: string; isActive: boolean }>>([]);
  const fileRef = useRef<HTMLInputElement>(null), generation = useRef(0), loadGeneration = useRef(0), alive = useRef(true);
  const selectAllRef = useRef<HTMLInputElement>(null), searchAbort = useRef<AbortController>();
  const base = `/financial/accounts/${accountId}/reconciliation/${month}`;
  const closed = data?.session?.status === 'COMPLETED';
  const selectedTotal = bankTotal(selected);
  const eligibleItems = data?.items.filter(item => !item.activeGroupId) || [];
  const allPageSelected = eligibleItems.length > 0 && eligibleItems.every(item => selected.some(s => s.id === item.id));
  const groupAllowed = selected.length > 0 && selected.length <= 20 && new Set(selected.map(item => Math.sign(Number(item.amount)))).size === 1;
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; searchAbort.current?.abort(); }; }, []);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = !allPageSelected && eligibleItems.some(item => selected.some(s => s.id === item.id)); }, [allPageSelected, eligibleItems, selected]);

  const refresh = useCallback(async () => {
    const requestId = ++loadGeneration.current;
    setLoading(true); setError('');
    try {
      const response = await api.get<BankWorkspace>(base, { params: { page, filter } });
      if (alive.current && requestId === loadGeneration.current) setData(response.data);
    } catch (e) { if (alive.current && requestId === loadGeneration.current) setError(errorMessage(e)); }
    finally { if (alive.current && requestId === loadGeneration.current) setLoading(false); }
  }, [base, page, filter]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (tab !== 'transactions') return;
    const abort = new AbortController();
    setLoading(true);
    api.get(`${base}/transactions`, { params: { page: transactionPage, search, days }, signal: abort.signal })
      .then(response => { setTransactions(response.data); setError(''); })
      .catch(e => { if (!abort.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [base, tab, transactionPage, search, days, data]);
  useEffect(() => {
    if (tab !== 'audit') return;
    const abort = new AbortController();
    api.get<BankAudit>(`${base}/audit`, { params: { page: auditPage }, signal: abort.signal }).then(response => setAudit(response.data))
      .catch(e => { if (!abort.signal.aborted) setError(errorMessage(e)); });
    return () => abort.abort();
  }, [base, tab, auditPage, data]);

  function changeSelection(items: BankItem[]) {
    generation.current++; searchAbort.current?.abort(); setSuggesting(false); setSelected(items); setResults([]); setSuggestionMessage(''); setManual([]); setCreating(false); setSearchAsGroup(false); setSearchProgress(0);
  }
  function toggleItem(item: BankItem) {
    if (selected.some(i => i.id === item.id)) changeSelection(selected.filter(i => i.id !== item.id));
    else if (selected.length < 50) changeSelection([...selected, item]);
    else addToast('Selecione até 50 movimentos por busca.', 'error');
  }
  async function suggest() {
    const requestId = ++generation.current;
    searchAbort.current?.abort();
    const abort = new AbortController(); searchAbort.current = abort;
    setSuggesting(true); setSuggestionMessage(''); setResults([]); setSearchProgress(0);
    try {
      if (searchAsGroup) {
        const response = await api.post(`${base}/suggestions`, { itemIds: selected.map(i => i.id) }, { signal: abort.signal, timeout: 45000 });
        if (generation.current !== requestId) return;
        setResults([{ itemId: selected[0].id, ...response.data }]); setSearchProgress(selected.length);
      } else {
        for (let offset = 0; offset < selected.length; offset += 5) {
          const batch = selected.slice(offset, offset + 5);
          const response = await api.post<{ results: BankSearchResult[] }>(`${base}/suggestions/batch`, { itemIds: batch.map(i => i.id) }, { signal: abort.signal, timeout: 45000 });
          if (generation.current !== requestId) return;
          setResults(current => [...current, ...response.data.results]); setSearchProgress(offset + batch.length);
        }
      }
    } catch (e) { if (generation.current === requestId) setSuggestionMessage(errorMessage(e)); }
    finally { if (alive.current && generation.current === requestId) setSuggesting(false); }
  }
  async function mutate(path: string, payload: unknown, message: string) {
    setBusy(true); setError('');
    try { await api.post(`${base}/${path}`, payload); if (!alive.current) return false; addToast(message); changeSelection([]); await refresh(); return true; }
    catch (e) { if (alive.current) { setError(errorMessage(e)); addToast(errorMessage(e), 'error'); } return false; }
    finally { if (alive.current) setBusy(false); }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setUpload(null);
    if (file.size > 5_000_000 || !/\.(csv|ofx)$/i.test(file.name)) { setError('Selecione um arquivo OFX ou CSV de até 5 MB.'); return; }
    setBusy(true); setError('');
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
      const response = await api.post<BankPreview>(`${base}/preview`, { fileBase64, fileName: file.name });
      if (alive.current) setUpload({ fileBase64, fileName: file.name, preview: response.data });
    } catch (e) { if (alive.current) setError(errorMessage(e)); }
    finally { if (alive.current) setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function confirmReview(settlePending: boolean, settlementDate: string, note: string) {
    if (!review) return;
    setBusy(true); setReviewError('');
    try {
      await api.post(`${base}/confirm`, { itemIds: review.items.map(i => i.id), transactions: review.transactions.map(t => ({ id: t.id, version: t.version })),
        settlePending, settlementDate: settlePending ? settlementDate : undefined, note, cacheId: review.cacheId, candidateKey: review.candidate?.key });
      if (!alive.current) return;
      const linkedItems = new Set(review.items.map(i => i.id)), linkedTransactions = new Set(review.transactions.map(t => t.id));
      setReview(null); setSelected(current => current.filter(i => !linkedItems.has(i.id))); setManual([]); setCreating(false);
      setResults(current => current.filter(result => !linkedItems.has(result.itemId)).map(result => ({ ...result,
        candidates: result.candidates.filter(candidate => !candidate.itemIds.some(id => linkedItems.has(id)) && !candidate.transactions.some(t => linkedTransactions.has(t.id))) })));
      setTab('statement'); addToast('Correspondência confirmada e salva.'); await refresh();
    } catch (e) { if (alive.current) setReviewError(errorMessage(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function beginCreate(items = selected) {
    setBusy(true);
    try {
      const [categoryResponse, accountResponse] = await Promise.all([api.get('/financial/categories'), api.get('/financial/accounts')]);
      if (!alive.current) return;
      setCategories(categoryResponse.data); setAccounts(accountResponse.data);
      setDescription(items.map(i => i.description).join(' / ').slice(0, 255)); setCreateDate(items[0].date.slice(0, 10));
      setCategoryId(''); setTransfer(false); setTransferAccountId(''); setCreating(true);
    } catch (e) { setError(errorMessage(e)); }
    finally { if (alive.current) setBusy(false); }
  }

  return <div className={`flex flex-col gap-3 text-gray-200 ${data?.summary.total && tab === 'statement' && !creating ? 'lg:min-h-0 lg:flex-1' : ''}`}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div><Link href="/financial/accounts" className="mb-2 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"><ArrowLeft size={15} /> Contas</Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-white"><Scale size={25} /> Conciliação bancária</h1>
        <p className="mt-1 text-gray-400">{data?.account.name || 'Carregando conta…'} · Seu progresso é salvo a cada confirmação.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Mês de referência<input aria-label="Mês de referência" type="month" value={month} min="2000-01" max="2200-12" disabled={busy || suggesting} onChange={e => { if (e.target.value) onMonthChange(e.target.value); }} className={`${fieldClass} ml-2`} /></label>
        <Button variant="outline" disabled={busy || loading || suggesting} onClick={() => { changeSelection([]); void refresh(); }} aria-label="Atualizar conciliação"><RefreshCw size={16} /></Button>
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-700 bg-red-950/20 p-4 text-red-300">{error}</div>}
    {data && <>
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        {[['Itens do extrato', data.summary.total], ['Conciliados', data.summary.confirmed], ['Itens para conferir', data.summary.pending], ['Liquidados sem vínculo', data.summary.unmatchedTransactions]].map(([label, value]) =>
          <Card key={label} className="p-0"><div className="flex items-center justify-between gap-2 px-3 py-2"><p className="text-xs text-gray-400">{label}</p><p className="text-xl font-semibold text-white">{value}</p></div></Card>)}
      </div>
      {data.summary.restrictedTransactions > 0 && <p role="status" className="rounded border border-amber-700 p-3 text-sm text-amber-300">Há {data.summary.restrictedTransactions} lançamento(s) sem vínculo nesta conta que exigem acesso à outra conta envolvida. Um usuário com esse acesso precisa revisá-los antes da conclusão do mês.</p>}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-surface px-3 py-2">
        <p className="text-sm">Entradas no extrato: <strong className="text-emerald-300">{bankCurrency(data.summary.credits)}</strong><span className="mx-3">·</span>Saídas: <strong>{bankCurrency(data.summary.debits)}</strong></p>
        {closed ? <div className="flex items-center gap-3"><span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={17} /> Mês concluído</span><Button variant="outline" disabled={busy} onClick={() => void mutate('status', { status: 'OPEN' }, 'Mês reaberto.')}>Reabrir mês</Button></div>
          : <div className="flex flex-wrap gap-2">{!!data.summary.total && <Button variant="outline" disabled={busy || suggesting} onClick={() => setResetOpen(true)}>Reiniciar conciliação</Button>}<Button disabled={busy || suggesting || !data.summary.total || !!data.summary.pending || !!data.summary.unmatchedTransactions} title="Todos os itens do extrato e lançamentos liquidados do mês precisam estar vinculados." className="disabled:opacity-40" onClick={() => void mutate('status', { status: 'COMPLETED' }, 'Conciliação do mês concluída.')}>Concluir mês</Button></div>}
      </div>
      {!closed && !data.summary.total && <Card className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Importar extrato da conta</h2><p className="mt-1 text-sm text-gray-400">Nubank ou Bradesco · OFX e CSV · até 5 MB. A importação registra o extrato; os vínculos serão revisados depois.</p></div>
          <label className={`relative inline-flex cursor-pointer items-center gap-2 rounded border border-gray-600 px-3 py-2 ${busy ? 'opacity-40' : 'hover:border-blue-500'}`}><Upload size={16} /> Selecionar arquivo<input ref={fileRef} aria-label="Selecionar extrato OFX ou CSV" type="file" accept=".ofx,.csv" disabled={busy || !data.account.isActive} onChange={e => void readFile(e.target.files?.[0])} className="sr-only" /></label></div>
        {!data.account.isActive && <p className="mt-3 text-amber-300">Ative a conta para importar novos extratos.</p>}
        {upload && <div className="mt-5 space-y-3 border-t border-gray-700 pt-4">
          <h3 className="font-semibold">Confira antes de importar: {upload.fileName}</h3>
          <p className="text-sm">Banco: {upload.preview.bank} · Conta no extrato: {upload.preview.accountNumber || 'não informada no arquivo'} · Conta escolhida: <strong>{data.account.name}</strong></p>
          <p className="text-sm">{upload.preview.inMonth} movimento(s) em {month.split('-').reverse().join('/')} · {upload.preview.existing} já importado(s) no arquivo.</p>
          {upload.preview.startDate && upload.preview.endDate && <p className="text-sm">Período informado: {bankDate(upload.preview.startDate)} a {bankDate(upload.preview.endDate)}</p>}
          <p className="text-sm">Entradas: {bankCurrency(upload.preview.credits)} · Saídas: {bankCurrency(upload.preview.debits)}</p>
          {upload.preview.openingBalance !== null && <p className="text-sm">Saldo anterior informado: {bankCurrency(upload.preview.openingBalance)}</p>}
          {upload.preview.closingBalance !== null && <p className="text-sm">Saldo final informado: {bankCurrency(upload.preview.closingBalance)}</p>}
          {upload.preview.warnings.map(warning => <p key={warning} className="text-sm text-amber-300">{warning}</p>)}
          {!!upload.preview.outsideCount && <details className="rounded border border-amber-700 p-3 text-sm"><summary className="cursor-pointer text-amber-300">{upload.preview.outsideCount} movimento(s) fora do mês: serão preservados para os respectivos meses.</summary>
            {upload.preview.outside.map((item, index) => <p key={index} className="mt-2 break-words">{bankDate(item.date)} · {item.description} · {bankCurrency(item.amount)}</p>)}</details>}
          <details className="text-sm"><summary className="cursor-pointer">Amostra dos primeiros movimentos</summary>{upload.preview.sample.map((item, index) => <p key={index} className="mt-2 break-words">{bankDate(item.date)} · {item.description} · {bankCurrency(item.amount)}</p>)}</details>
          <p className="text-sm text-gray-400">Ao iniciar, o extrato será salvo para conferência. Nenhum lançamento financeiro será criado ou alterado nesta etapa.</p>
          <div className="flex gap-3"><Button disabled={busy || suggesting || !upload.preview.inMonth} onClick={async () => { if (await mutate('imports', { fileName: upload.fileName, fileBase64: upload.fileBase64 }, 'Conciliação iniciada. Selecione os movimentos e busque as correspondências.')) { setUpload(null); setTab('statement'); } }}>{busy ? 'Iniciando…' : 'Iniciar Conciliação'}</Button><Button variant="outline" disabled={busy} onClick={() => setUpload(null)}>Cancelar</Button></div>
        </div>}
      </Card>}
      <div role="tablist" aria-label="Áreas da conciliação" className="flex shrink-0 flex-wrap gap-2 border-b border-gray-700 pb-2">
        {([['statement', 'Extrato'], ['transactions', 'Lançamentos sem vínculo'], ['audit', 'Histórico']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} disabled={busy} onClick={() => setTab(value)} className={`rounded px-4 py-2 text-sm ${tab === value ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-surface'}`}>{label}</button>)}
      </div>
      {!!selected.length && !closed && tab !== 'statement' && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded border border-blue-700 bg-blue-950/20 px-3 py-2">
        <span>{selected.length} item(s) do extrato selecionado(s) · <strong>{bankCurrency(selectedTotal)}</strong></span>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => changeSelection([])}>Desmarcar todos</Button><Button variant="outline" disabled={busy || suggesting || !groupAllowed} onClick={() => setTab('transactions')}>Buscar lançamento manualmente</Button><Button variant="outline" disabled={busy || suggesting || !groupAllowed} onClick={() => void beginCreate()}>Registrar lançamento faltante</Button></div>
      </div>}
      {creating && <Card headerTitle="Registrar lançamento faltante" headerSubtitle="Confira primeiro se o lançamento já existe. A criação atualizará o saldo e gravará o vínculo na mesma operação.">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={async e => { e.preventDefault(); if (await mutate('transactions', { itemIds: selected.map(i => i.id), description, effectiveDate: createDate, categoryId: !transfer && categoryId ? Number(categoryId) : undefined, transferAccountId: transfer && transferAccountId ? Number(transferAccountId) : undefined }, 'Lançamento criado e conciliado.')) setCreating(false); }}>
          <label className="text-sm md:col-span-2">Descrição<input required maxLength={255} autoFocus value={description} disabled={busy} onChange={e => setDescription(e.target.value)} className={`${fieldClass} mt-1 w-full`} /></label>
          <label className="text-sm">Data de liquidação<input required type="date" value={createDate} disabled={busy} onChange={e => setCreateDate(e.target.value)} className={`${fieldClass} mt-1 w-full`} /></label>
          <p className="self-center">Valor: <strong>{bankCurrency(selectedTotal)}</strong> · {selectedTotal < 0 ? 'Saída' : 'Entrada'}</p>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={transfer} disabled={busy} onChange={e => setTransfer(e.target.checked)} /> É uma transferência entre minhas contas</label>
          {transfer ? <label className="text-sm">Outra conta<select required value={transferAccountId} disabled={busy} onChange={e => setTransferAccountId(e.target.value)} className={`${fieldClass} mt-1 w-full`}><option value="">Selecione</option>{accounts.filter(a => a.id !== accountId && a.isActive && a.type !== 'CREDIT_CARD').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            : <label className="text-sm">Categoria<select required value={categoryId} disabled={busy} onChange={e => setCategoryId(e.target.value)} className={`${fieldClass} mt-1 w-full`}><option value="">Selecione</option>{categories.filter(c => c.type === (selectedTotal < 0 ? 'EXPENSE' : 'INCOME')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <p className="text-sm text-gray-400 md:col-span-2">Para pagamento de cartão, <Link className="text-blue-300 underline" href="/financial/credit-cards">pague a fatura</Link> e depois vincule o lançamento gerado.</p>
          <div className="flex gap-3 md:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Criar e conciliar'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(false)}>Cancelar</Button></div>
        </form>
      </Card>}
      {tab === 'statement' && <div className={`grid gap-4 lg:min-h-0 lg:flex-1 ${selected.length && !closed ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : ''}`}>
        <Card className={panelClass}>
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Movimentos do extrato</h2><select aria-label="Filtrar itens do extrato" value={filter} disabled={busy || suggesting || loading} onChange={e => { changeSelection([]); setFilter(e.target.value); setPage(1); }} className={fieldClass}><option value="ALL">Todos</option><option value="PENDING">Para conferir</option><option value="CONFIRMED">Conciliados</option></select></div>
          {loading && <p role="status" className="mb-3 text-sm text-gray-400">Carregando…</p>}
          {!data.items.length && <p className="py-10 text-center text-gray-400">{data.summary.total ? 'Nenhum item neste filtro.' : 'Importe o extrato deste mês para começar.'}</p>}
          <div role="region" aria-label="Lista de movimentos do extrato" tabIndex={0} className="min-h-0 flex-1 overflow-auto overscroll-contain max-lg:max-h-[55vh]"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-surface"><tr className="border-b border-gray-700 text-gray-400"><th className="relative p-2"><span className="sr-only">Selecionar</span>{!closed && <input ref={selectAllRef} type="checkbox" aria-label="Marcar ou desmarcar todos os movimentos desta página" title={allPageSelected ? 'Desmarcar todos desta página' : 'Marcar todos desta página'} checked={allPageSelected} disabled={busy || suggesting || loading || !eligibleItems.length} onChange={() => changeSelection(allPageSelected ? [] : eligibleItems)} />}</th><th className="p-2">Data e descrição</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th></tr></thead>
            <tbody>{data.items.map(item => <tr key={item.id} className={`border-b border-gray-800 ${selected.some(s => s.id === item.id) ? 'bg-blue-950/30' : ''}`}>
              <td className="p-2">{!item.activeGroupId && !closed && <input aria-label={`Selecionar ${item.description} em ${bankDate(item.date)}`} type="checkbox" checked={selected.some(s => s.id === item.id)} disabled={busy || suggesting || loading} onChange={() => toggleItem(item)} />}</td>
              <td className="max-w-md p-2"><p className="break-words">{item.description}</p><p className="mt-1 text-xs text-gray-400">{bankDate(item.date)}</p></td><td className={`whitespace-nowrap p-2 text-right ${Number(item.amount) > 0 ? 'text-emerald-300' : ''}`}>{bankCurrency(item.amount)}</td>
              <td className="p-2">{item.activeGroupId ? <button className="text-emerald-300 underline" onClick={() => setTab('audit')}>Conciliado</button> : <span className="text-amber-300">Para conferir</span>}</td>
            </tr>)}</tbody></table></div>
          <Pagination page={page} total={data.total} size={50} disabled={busy || loading || suggesting} onChange={value => { changeSelection([]); setPage(value); }} />
        </Card>
        {!!selected.length && !closed && <Card className={`${panelClass} [&>div]:overflow-y-auto [&>div]:overscroll-contain max-lg:max-h-[65vh]`}>
          <h2 className="mb-2 font-semibold">Sugestões de correspondência</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{selected.length} selecionado(s) · {bankCurrency(selectedTotal)}</span><Button variant="outline" disabled={busy} onClick={() => changeSelection([])}>Desmarcar todos</Button></div>
          <p className="mb-3 text-sm text-gray-400">{searchAsGroup ? 'A busca considera a soma dos movimentos selecionados.' : 'Cada movimento selecionado será comparado separadamente.'} A IA será consultada quando as regras não forem suficientes.</p>
          {selected.length > 1 && <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={searchAsGroup} disabled={busy || suggesting || !groupAllowed} onChange={e => { setSearchAsGroup(e.target.checked); setResults([]); setSuggestionMessage(''); }} />Buscar pela soma dos selecionados (agrupar)</label>}
          {!groupAllowed && <p className="mb-3 text-sm text-gray-400">Para vincular manualmente ou criar um único lançamento, selecione até 20 movimentos de entrada ou até 20 de saída.</p>}
          <div className="mb-4 flex flex-wrap gap-2"><Button disabled={busy || suggesting || (searchAsGroup && !groupAllowed)} onClick={() => void suggest()}>{suggesting ? `Buscando… ${searchProgress}/${selected.length}` : 'Buscar correspondências'}</Button></div>
          {!results.length && groupAllowed && <div className="mb-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy || suggesting} onClick={() => setTab('transactions')}>Buscar lançamento manualmente</Button><Button variant="outline" disabled={busy || suggesting} onClick={() => void beginCreate()}>Registrar lançamento faltante</Button></div>}
          {suggestionMessage && <p role="status" className="mb-3 text-sm text-gray-400">{suggestionMessage}</p>}
          <BankMatchSuggestions results={results} items={selected} disabled={busy || suggesting}
            onManual={item => { changeSelection([item]); setTab('transactions'); }}
            onCreate={item => { changeSelection([item]); void beginCreate([item]); }}
            onReview={(candidate, cacheId) => { setReviewError(''); setReview({ items: candidate.items, transactions: candidate.transactions, candidate, cacheId }); }}
            onReject={async candidate => { setBusy(true); try {
              await api.post(`${base}/reject`, { itemIds: candidate.itemIds, transactions: candidate.transactions.map(t => ({ id: t.id, version: t.version })) });
              setResults(current => current.map(result => ({ ...result, candidates: result.candidates.filter(c => c.key !== candidate.key) }))); addToast('Correspondência rejeitada.');
            } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }} />
        </Card>}
      </div>}
      {tab === 'transactions' && <Card headerTitle="Lançamentos sem vínculo" headerSubtitle="Confira também o que está lançado no sistema e ainda não corresponde a um item do extrato. Pendências financeiras aparecem identificadas.">
        <form className="mb-4 flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); setSearch(searchDraft); setTransactionPage(1); }}>
          <input aria-label="Buscar lançamento pela descrição" placeholder="Buscar pela descrição" value={searchDraft} onChange={e => setSearchDraft(e.target.value)} className={`${fieldClass} min-w-48 flex-1`} />
          <select aria-label="Período da busca manual" value={days} onChange={e => { setDays(Number(e.target.value)); setTransactionPage(1); setManual([]); }} className={fieldClass}><option value={0}>Mês selecionado</option><option value={7}>Mês + 7 dias nas bordas</option><option value={31}>Mês + 31 dias nas bordas</option><option value={366}>Mês + 1 ano nas bordas</option></select><Button type="submit" disabled={busy}>Buscar</Button>
        </form>
        {!selected.length && <p className="mb-3 text-sm text-gray-400">Selecione primeiro os itens na aba Extrato para vincular lançamentos.</p>}
        {loading && <p role="status">Carregando…</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-gray-700 text-gray-400"><th className="relative p-2"><span className="sr-only">Selecionar</span></th><th className="p-2">Lançamento</th><th className="p-2">Data</th><th className="p-2">Valor</th><th className="p-2">Situação</th></tr></thead><tbody>
          {transactions.items.map(t => <tr key={t.id} className="border-b border-gray-800"><td className="p-2"><input type="checkbox" aria-label={`Selecionar lançamento ${t.description}`} disabled={busy || suggesting || closed || !groupAllowed} checked={manual.some(m => m.id === t.id)} onChange={() => setManual(current => current.some(m => m.id === t.id) ? current.filter(m => m.id !== t.id) : current.length < 20 ? [...current, t] : current)} /></td>
            <td className="p-2"><Link href={{ pathname: `/financial/transactions/${t.id}`, query: { returnTo: `/financial/accounts/${accountId}/reconciliation?month=${month}` } }} className="text-blue-300 hover:underline">{t.description}</Link>{t.type === 'TRANSFER' && <p className="text-xs text-gray-400">Transferência</p>}</td>
            <td className="whitespace-nowrap p-2">{bankDate(t.status === 'COMPLETED' ? t.effectiveDate || t.date : t.dueDate || t.date)}</td><td className="whitespace-nowrap p-2">{bankCurrency(t.amount)}</td><td className="p-2">{t.status === 'COMPLETED' ? 'Liquidado' : 'Pendente'}</td></tr>)}
        </tbody></table></div>
        {!transactions.items.length && !loading && <p className="py-6 text-center text-gray-400">Nenhum lançamento sem vínculo nesta busca.</p>}
        {!!manual.length && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span>{manual.length} lançamento(s) selecionado(s) · {bankCurrency(bankTotal(manual))}</span><Button variant="outline" disabled={busy} onClick={() => setManual([])}>Desmarcar lançamentos</Button><Button disabled={busy || suggesting || !groupAllowed || closed} onClick={() => { setReviewError(''); setReview({ items: selected, transactions: manual.map(t => ({ ...t, date: t.status === 'COMPLETED' ? t.effectiveDate || t.date : t.dueDate || t.date })) }); }}>Revisar seleção manual</Button></div>}
        <Pagination page={transactionPage} total={transactions.total} size={50} disabled={busy || loading} onChange={setTransactionPage} />
      </Card>}
      {tab === 'audit' && <div className="space-y-4">
        <Card headerTitle="Meses e arquivos importados">
          <div className="mb-4 flex flex-wrap gap-2">{data.history.map(h => <button key={h.id} disabled={busy} className={`${fieldClass} ${h.month === month ? 'border-blue-500' : ''}`} onClick={() => onMonthChange(h.month)}>{h.month.split('-').reverse().join('/')} · {h.status === 'COMPLETED' ? 'Concluído' : 'Em andamento'}</button>)}</div>
          {data.imports.map(file => <div key={file.id} className="border-t border-gray-700 py-3 text-sm"><p>{file.fileName} · {file.bank} · {bankTimestamp(file.createdAt)}</p>
            {file.metadata.closingBalance !== null && <p className="mt-1 text-gray-400">Saldo final informado no arquivo: {bankCurrency(file.metadata.closingBalance)}{file.metadata.balanceDate ? ` em ${bankDate(file.metadata.balanceDate)}` : ''}.</p>}
          </div>)}
          <p className="mt-3 text-xs text-gray-400">Os saldos do arquivo são referências históricas. A conciliação verifica os vínculos dos movimentos do mês.</p>
        </Card>
        <Card headerTitle="Histórico de correspondências" headerSubtitle="Desfazer libera o vínculo para nova revisão e mantém o lançamento financeiro.">
          {audit?.groups.map(group => <div key={group.id} className="mb-3 rounded border border-gray-700 p-4">
            <div className="flex flex-wrap justify-between gap-2"><p className={`font-semibold ${group.status === 'CONFIRMED' ? 'text-emerald-300' : 'text-amber-300'}`}>Vínculo #{group.id} · {group.status === 'CONFIRMED' ? 'Confirmado' : group.status === 'REVIEW' ? 'Revisão necessária' : 'Desfeito'}</p><span className="text-xs text-gray-400">{bankTimestamp(group.createdAt)} · Usuário #{group.createdBy}</span></div>
            <div className="my-3 grid gap-3 text-sm md:grid-cols-2"><div><p className="mb-1 text-gray-400">Extrato</p>{group.items.map(({ item }) => <p key={item.id}>{item.description} · {bankCurrency(item.amount)}</p>)}</div><div><p className="mb-1 text-gray-400">Lançamentos na confirmação</p>{group.transactions.map(t => <p key={t.id}>{t.restricted ? 'Lançamento com acesso restrito.' : `${t.snapshot?.description || 'Lançamento removido'} · ${bankCurrency(t.snapshot?.amount || 0)}`}</p>)}</div></div>
            {group.note && <p className="mb-2 text-sm text-gray-400">{group.note}</p>}
            {group.status !== 'UNDONE' && !closed && <Button variant="outline" disabled={busy} onClick={() => { setUndoId(group.id); setUndoNote(''); }}>Desfazer vínculo</Button>}
            {undoId === group.id && <form className="mt-3 flex flex-wrap gap-3" onSubmit={async e => { e.preventDefault(); if (await mutate('undo', { groupId: group.id, note: undoNote }, 'Vínculo desfeito. O lançamento foi mantido.')) setUndoId(null); }}><input aria-label="Motivo para desfazer" placeholder="Motivo para desfazer" required maxLength={500} value={undoNote} onChange={e => setUndoNote(e.target.value)} className={`${fieldClass} flex-1`} /><Button disabled={busy} type="submit">Confirmar desfazer</Button><Button disabled={busy} variant="outline" type="button" onClick={() => setUndoId(null)}>Cancelar</Button></form>}
          </div>)}
          {audit && <Pagination page={auditPage} total={audit.total} size={20} disabled={busy} onChange={setAuditPage} />}
          <details className="mt-5 text-sm"><summary className="cursor-pointer">Atividades recentes do mês</summary>{audit?.events.map(event => <p key={event.id} className="mt-2 text-gray-400">{bankTimestamp(event.createdAt)} · {eventLabels[event.action] || event.action}{event.userId ? ` · Usuário #${event.userId}` : ''}</p>)}</details>
        </Card>
      </div>}
    </>}
    {!data && loading && <p role="status" className="py-16 text-center">Carregando conciliação…</p>}
    {review && <BankMatchReview items={review.items} transactions={review.transactions} busy={busy} error={reviewError} onClose={() => { if (!busy) setReview(null); }} onConfirm={(settle, date, note) => void confirmReview(settle, date, note)} />}
    {resetOpen && <ConfirmationModal isOpen title="Reiniciar conciliação deste mês?" message={`Serão apagados os vínculos, o histórico e os movimentos importados de ${month.split('-').reverse().join('/')} da conta ${data?.account.name}. Os arquivos sem uso em outros meses também serão removidos. Os lançamentos financeiros serão mantidos. Esta limpeza não pode ser desfeita; você poderá importar outro extrato.`}
      confirmText="Apagar e reiniciar" loading={busy} onClose={() => { if (!busy) setResetOpen(false); }} onConfirm={async () => {
        if (await mutate('reset', { confirmed: true }, 'Conciliação reiniciada. Selecione o extrato para começar novamente.')) { setResetOpen(false); setUpload(null); setPage(1); setFilter('ALL'); setTab('statement'); }
      }} />}
  </div>;
}
