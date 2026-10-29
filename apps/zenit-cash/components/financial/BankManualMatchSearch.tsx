import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { BankItem, BankTransaction, bankCurrency, bankDate, bankTotal } from '@/lib/bank-reconciliation';

export default function BankManualMatchSearch({ base, items, returnTo, disabled, onReview }: {
  base: string; items: BankItem[]; returnTo: string; disabled: boolean;
  onReview: (items: BankItem[], transactions: BankTransaction[]) => void;
}) {
  const [search, setSearch] = useState(''), [amount, setAmount] = useState(String(Math.abs(bankTotal(items))));
  const [days, setDays] = useState(31), [page, setPage] = useState(1);
  const [query, setQuery] = useState({ search: '', amount: String(Math.abs(bankTotal(items))), days: 31 });
  const [data, setData] = useState<{ items: BankTransaction[]; total: number }>({ items: [], total: 0 });
  const [selected, setSelected] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setData({ items: [], total: 0 });
    api.get(`${base}/transactions`, { params: { ...query, amount: query.amount || undefined, page }, signal: abort.signal })
      .then(response => { if (!abort.signal.aborted) setData(response.data); })
      .catch(() => { if (!abort.signal.aborted) setError('Não foi possível buscar os lançamentos. Tente novamente.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [base, query, page]);
  const difference = Math.round((bankTotal(items) - bankTotal(selected)) * 100) / 100;
  const sameDirection = selected.every(t => Math.sign(Number(t.amount)) === Math.sign(bankTotal(items)));
  return <section aria-label="Busca manual contextual" className="mt-4 rounded-lg border border-border p-3">
    <h3 className="font-semibold">Localizar no Cash</h3>
    <p className="mt-1 text-xs text-text-muted">A busca começa pelo valor. Limpe esse campo para procurar valores diferentes ou montar um agrupamento.</p>
    <form className="my-3 grid gap-2 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault(); setPage(1); setSelected([]); setQuery({ search, amount: amount.replace(',', '.'), days });
    }}>
      <label className="text-xs text-text-muted">Descrição<input aria-label="Descrição na busca manual" value={search} onChange={e => setSearch(e.target.value)} disabled={disabled}
        className="mt-1 w-full rounded border border-border-strong bg-background p-2 text-sm text-text" /></label>
      <label className="text-xs text-text-muted">Valor exato (opcional)<input aria-label="Valor na busca manual" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" value={amount} onChange={e => setAmount(e.target.value)} disabled={disabled}
        className="mt-1 w-full rounded border border-border-strong bg-background p-2 text-sm text-text" /></label>
      <label className="text-xs text-text-muted">Período<select aria-label="Período na busca manual" value={days} onChange={e => setDays(Number(e.target.value))} disabled={disabled}
        className="mt-1 w-full rounded border border-border-strong bg-background p-2 text-sm text-text">
        <option value={0}>Mês selecionado</option><option value={7}>Mês + 7 dias nas bordas</option><option value={31}>Mês + 31 dias nas bordas</option><option value={366}>Mês + 1 ano nas bordas</option>
      </select></label>
      <Button className="self-end" type="submit" disabled={disabled || loading}>Buscar no Cash</Button>
    </form>
    {loading && <p role="status" className="text-sm text-text-muted">Buscando lançamentos…</p>}
    {error && <p role="alert" className="text-sm text-tone-red">{error}</p>}
    {!loading && !error && !data.items.length && <p className="text-sm text-text-muted">Nenhum lançamento encontrado. Tente retirar o valor ou ampliar o período.</p>}
    <div className="max-h-80 space-y-2 overflow-y-auto">{data.items.map(transaction => <div key={transaction.id} className="rounded border border-border p-2 text-sm">
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" aria-label={`Escolher ${transaction.description}`} disabled={disabled}
        checked={selected.some(t => t.id === transaction.id)} onChange={() => setSelected(current => current.some(t => t.id === transaction.id) ? current.filter(t => t.id !== transaction.id) : current.length < 20 ? [...current, transaction] : current)} />
        <span className="min-w-0 break-words">{transaction.description}<span className="mt-1 block text-xs text-text-muted">{bankDate(transaction.status === 'COMPLETED' ? transaction.effectiveDate || transaction.date : transaction.dueDate || transaction.date)} · {bankCurrency(transaction.amount)} · {transaction.status === 'PENDING' ? 'Pendente' : 'Liquidado'}</span></span>
      </label>
      <Link className="ml-5 mt-1 inline-block text-xs text-tone-blue underline" href={{ pathname: `/financial/transactions/${transaction.id}`, query: { returnTo } }}>Abrir lançamento</Link>
    </div>)}</div>
    {data.total > 50 && <div className="mt-3 flex items-center justify-between gap-2 text-xs"><Button variant="outline" disabled={disabled || loading || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>Página {page} · {data.total} lançamentos</span><Button variant="outline" disabled={disabled || loading || page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
    {!!selected.length && <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-sm">{selected.length} selecionado(s) · Total: <strong>{bankCurrency(bankTotal(selected))}</strong> · Diferença: <strong>{bankCurrency(difference)}</strong></p>
      {!sameDirection && <p className="text-xs text-tone-amber">Escolha lançamentos com a mesma direção do extrato.</p>}
      <Button disabled={disabled || difference !== 0 || !sameDirection} onClick={() => onReview(items, selected.map(t => ({ ...t, date: t.status === 'COMPLETED' ? t.effectiveDate || t.date : t.dueDate || t.date })))}>Conferir seleção manual</Button>
    </div>}
  </section>;
}
