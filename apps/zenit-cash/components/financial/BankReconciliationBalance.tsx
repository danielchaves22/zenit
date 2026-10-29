import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { BankDiagnostics, bankCurrency, bankDate } from '@/lib/bank-reconciliation';

export default function BankReconciliationBalance({ base, revision }: { base: string; revision: unknown }) {
  const [data, setData] = useState<BankDiagnostics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    api.get<BankDiagnostics>(`${base}/diagnostics`, { signal: abort.signal }).then(response => {
      if (!abort.signal.aborted) setData(response.data);
    }).catch(() => { if (!abort.signal.aborted) { setData(null); setError('Não foi possível atualizar a comparação de saldos. Use Atualizar conciliação para tentar novamente.'); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [base, revision]);
  return <section aria-label="Diagnóstico financeiro" className="rounded-xl border border-border bg-surface p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Diferença a investigar</h2>
      <span className="text-xs text-text-muted">{loading ? 'Atualizando saldos…' : data?.cutoffDate ? `Comparação em ${bankDate(data.cutoffDate)}` : 'Saldo de referência indisponível'}</span>
    </div>
    {error && <p role="status" className="text-sm text-tone-amber">{error}</p>}
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
      {[['Saldo no banco', data?.statementClosing], ['Saldo do Cash no corte', data?.cashClosing], ['Diferença banco − Cash', data?.difference]].map(([label, amount]) =>
        <div key={label} className={`min-w-0 rounded-lg bg-background p-3 ${label === 'Diferença banco − Cash' ? 'col-span-2 sm:col-span-1' : ''}`}><p className="text-xs text-text-muted">{label}</p>
          <p className={`mt-1 break-words text-xl font-semibold ${label === 'Diferença banco − Cash' && amount && Number(amount) !== 0 ? 'text-tone-amber' : ''}`}>{amount != null ? bankCurrency(amount) : '—'}</p>
        </div>)}
    </div>
    {data && <>
      {data.difference === '0.00' && <p className="mt-2 text-xs text-tone-emerald">Saldos iguais nesta data. Confira também as pendências: diferenças entre movimentos podem se compensar.</p>}
      {(data.statementClosing === null || data.cashClosing === null) && <p className="mt-2 text-sm text-tone-amber">{data.warnings[0]}</p>}
      <details className="mt-2 text-xs text-text-muted"><summary className="cursor-pointer">Totais do mês e interpretação dos saldos</summary>
        <p className="mt-3">Sem vínculo no mês: extrato <strong>{bankCurrency(data.pendingStatementNet)}</strong> · Cash <strong>{data.unmatchedCashNet === null ? 'indisponível' : bankCurrency(data.unmatchedCashNet)}</strong> · Ignorados <strong>{bankCurrency(data.ignoredNet)}</strong>.</p>
        {data.fileName && <p className="mt-2 break-words">Referência: {data.fileName}.</p>}
        {data.warnings.map(warning => <p key={warning} className="mt-2">{warning}</p>)}
        <p className="mt-2">Confirmar um vínculo de lançamentos já liquidados não altera o saldo. Criar, corrigir ou liquidar um lançamento pode alterá-lo.</p>
      </details>
    </>}
  </section>;
}
