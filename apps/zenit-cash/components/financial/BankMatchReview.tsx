import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { BankItem, BankTransaction, bankCurrency, bankDate, bankTotal } from '@/lib/bank-reconciliation';

interface Props {
  items: BankItem[];
  transactions: BankTransaction[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (settle: boolean, date: string, note: string) => void;
}
export default function BankMatchReview({ items, transactions, busy, error, onClose, onConfirm }: Props) {
  const [settle, setSettle] = useState(false);
  const [date, setDate] = useState(items[0]?.date.slice(0, 10) || '');
  const [note, setNote] = useState('');
  const pending = transactions.some(t => t.status === 'PENDING');
  const difference = Math.round((bankTotal(items) - bankTotal(transactions)) * 100) / 100;
  const sameDirection = items.every(i => Math.sign(Number(i.amount)) === Math.sign(bankTotal(items))) && transactions.every(t => Math.sign(Number(t.amount)) === Math.sign(bankTotal(items)));
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') {
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bank-review-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-gray-600 bg-surface p-6 text-gray-200 shadow-2xl">
      <h2 id="bank-review-title" className="mb-4 text-xl font-semibold text-white">Revisar correspondência</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {[{ title: 'Itens do extrato', rows: items }, { title: 'Lançamentos selecionados', rows: transactions }].map(section => <div key={section.title}>
          <h3 className="mb-2 font-semibold">{section.title}</h3>
          {section.rows.map(row => <div key={row.id} className="mb-2 rounded border border-gray-700 p-3 text-sm">
            <p className="break-words">{row.description}</p><p className="mt-1 text-gray-400">{bankDate(row.date)} · {bankCurrency(row.amount)}</p>
            {'status' in row && <p className="mt-1">{row.status === 'PENDING' ? 'Pendente de liquidação' : 'Liquidado'}</p>}
          </div>)}
          <p className="font-semibold">Total: {bankCurrency(bankTotal(section.rows))}</p>
        </div>)}
      </div>
      <p className={`my-4 font-semibold ${difference || !sameDirection ? 'text-amber-300' : 'text-emerald-300'}`}>Diferença: {bankCurrency(difference)}</p>
      {!!difference && <p role="alert" className="mb-3 text-amber-300">Resolva a diferença de valores antes de confirmar. Você pode editar o lançamento na tela de transações.</p>}
      {!sameDirection && <p role="alert" className="mb-3 text-amber-300">Selecione movimentos e lançamentos da mesma direção.</p>}
      {pending && <div className="mb-4 space-y-3 rounded border border-amber-700 bg-amber-950/20 p-4">
        <label className="flex items-start gap-2"><input type="checkbox" checked={settle} disabled={busy} onChange={e => setSettle(e.target.checked)} className="mt-1" />
          Liquidar os lançamentos pendentes selecionados. Essa ação atualizará o saldo da conta.</label>
        <label className="block">Data de liquidação<input aria-label="Data de liquidação" type="date" value={date} disabled={busy} onChange={e => setDate(e.target.value)} className="ml-3 rounded border border-gray-600 bg-background p-2" /></label>
      </div>}
      <label className="block text-sm">Observação (opcional)<textarea value={note} maxLength={500} disabled={busy} onChange={e => setNote(e.target.value)} className="mt-1 w-full rounded border border-gray-600 bg-background p-2" /></label>
      <p className="my-3 text-sm text-gray-400">A confirmação registra sua decisão para futuras sugestões. Lançamentos já liquidados mantêm seus valores e datas.</p>
      {error && <p role="alert" className="my-3 text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button>
        <Button disabled={busy || !!difference || !sameDirection || (pending && (!settle || !date))} className="disabled:opacity-50" onClick={() => onConfirm(settle, date, note)}>{busy ? 'Confirmando…' : pending ? 'Liquidar e confirmar vínculo' : 'Confirmar vínculo'}</Button>
      </div>
    </div>
  </div>;
}
