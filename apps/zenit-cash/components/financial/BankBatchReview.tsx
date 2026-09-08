import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { BankCandidate, BankItem, bankCurrency, bankDate } from '@/lib/bank-reconciliation';
import { BankMatchConfidence } from './BankMatchConfidence';

export interface BankBatchSnapshot {
  candidates: BankCandidate[];
  excluded: Array<{ item: BankItem; reason: string }>;
}
export default function BankBatchReview({ snapshot, busy, error, onClose, onConfirm }: {
  snapshot: BankBatchSnapshot; busy: boolean; error: string; onClose: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') {
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      if (!buttons?.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bank-batch-title" className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-gray-600 bg-surface p-5 text-gray-200 shadow-2xl">
      <h2 id="bank-batch-title" className="text-xl font-semibold text-white">Conferir selecionados</h2>
      <p className="my-3 text-sm text-gray-400">Confira os {snapshot.candidates.length} pares abaixo antes de confirmar. Cada par será salvo como um vínculo separado. A confiabilidade ajuda na decisão e não garante o acerto.</p>
      {!!snapshot.excluded.length && <p className="mb-3 text-sm text-amber-300">{snapshot.excluded.length} movimento(s) continuarão pendentes e estão detalhados ao fim da lista.</p>}
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain pr-2">
        {snapshot.candidates.map(candidate => <article key={candidate.key} className="rounded-lg border border-gray-700 p-3">
          <div className="mb-3"><BankMatchConfidence confidence={candidate.confidence} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            {[{ title: 'Movimento do extrato', row: candidate.items[0] }, { title: 'Lançamento financeiro', row: candidate.transactions[0] }].map(({ title, row }) => <div key={title}>
              <h3 className="mb-1 text-xs font-semibold text-gray-400">{title}</h3>
              <p className="break-words text-sm">{row.description}</p><p className="mt-1 text-sm">{bankDate(row.date)} · <strong>{bankCurrency(row.amount)}</strong></p>
            </div>)}
          </div>
          <p className="mt-3 text-xs text-gray-400">{candidate.reason}</p>
          {!!candidate.confidence?.reasons.length && <p className="mt-1 text-xs text-gray-400">{candidate.confidence.reasons.join(' · ')}</p>}
        </article>)}
        {!!snapshot.excluded.length && <div className="rounded-lg border border-amber-700 p-3 text-sm">
          <h3 className="mb-2 font-semibold text-amber-300">{snapshot.excluded.length} movimento(s) precisam de conferência individual</h3>
          <p className="mb-2 text-gray-400">Estes movimentos continuarão pendentes após a confirmação:</p>
          {snapshot.excluded.map(({ item, reason }) => <p key={item.id} className="mb-2 break-words">{item.description} · {bankDate(item.date)} · {bankCurrency(item.amount)}<span className="block text-xs text-amber-300">{reason}</span></p>)}
        </div>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>Voltar</Button>
        <Button disabled={busy || !!error || !snapshot.candidates.length} onClick={onConfirm}>{busy ? 'Confirmando…' : `Confirmar ${snapshot.candidates.length} vínculo(s)`}</Button>
      </div>
    </div>
  </div>;
}
