import React from 'react';
import { Loader2 } from 'lucide-react';
import { BankCandidate } from '@/lib/bank-reconciliation';
import { BankRowSearch } from '@/hooks/useBankRuleSearch';

export function BankMatchConfidence({ confidence }: { confidence?: BankCandidate['confidence'] }) {
  if (!confidence) return null;
  const label = { HIGH: 'Alta', MEDIUM_HIGH: 'Média alta', MEDIUM_LOW: 'Média baixa', LOW: 'Baixa' }[confidence.level];
  const color = { HIGH: 'border-tone-emerald/25 text-tone-emerald', MEDIUM_HIGH: 'border-tone-cyan/25 text-tone-cyan', MEDIUM_LOW: 'border-tone-amber/25 text-tone-amber', LOW: 'border-border-strong text-text-muted' }[confidence.level];
  return <span title={confidence.reasons.join(' · ')} className={`inline-flex rounded border px-2 py-0.5 text-xs ${color}`}>Confiabilidade {label.toLowerCase()}</span>;
}

export function BankMovementSearchStatus({ entry, disabled, onRetry }: { entry?: BankRowSearch; disabled: boolean; onRetry: () => void }) {
  if (!entry || entry.status === 'queued') return <span className="text-xs text-text-muted">Aguardando busca</span>;
  if (entry.status === 'searching') return <span role="status" className="inline-flex items-center gap-1 text-xs text-tone-blue"><Loader2 aria-hidden size={14} className="shrink-0 animate-spin" />Buscando…</span>;
  if (entry.status === 'error') return <div className="text-xs"><span className="text-tone-red" title={entry.result?.error}>Falha na busca</span><button disabled={disabled} onClick={onRetry} className="mt-1 block text-tone-blue underline disabled:opacity-50">Tentar novamente</button></div>;
  const candidate = entry.result?.candidates[0];
  if (entry.result?.assessment === 'POSSIBLE_MISSING') return <span className="text-xs text-tone-orange">Possível lançamento faltante</span>;
  if (entry.result?.assessment === 'INCOMPLETE') return <div className="space-y-1"><span className="block text-xs text-tone-amber">Busca incompleta</span><BankMatchConfidence confidence={candidate?.confidence} /></div>;
  if (!candidate) return <span className="text-xs text-text-muted">Sem correspondência encontrada</span>;
  return <div className="space-y-1"><span className="block text-xs text-tone-amber">Para conferir</span><BankMatchConfidence confidence={candidate.confidence} /></div>;
}
