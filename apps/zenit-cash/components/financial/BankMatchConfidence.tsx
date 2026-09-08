import React from 'react';
import { Loader2 } from 'lucide-react';
import { BankCandidate } from '@/lib/bank-reconciliation';
import { BankRowSearch } from '@/hooks/useBankRuleSearch';

export function BankMatchConfidence({ confidence }: { confidence?: BankCandidate['confidence'] }) {
  if (!confidence) return null;
  const label = { HIGH: 'Alta', MEDIUM_HIGH: 'Média alta', MEDIUM_LOW: 'Média baixa', LOW: 'Baixa' }[confidence.level];
  const color = { HIGH: 'border-emerald-700 text-emerald-300', MEDIUM_HIGH: 'border-cyan-700 text-cyan-300', MEDIUM_LOW: 'border-amber-700 text-amber-300', LOW: 'border-gray-600 text-gray-300' }[confidence.level];
  return <span title={confidence.reasons.join(' · ')} className={`inline-flex rounded border px-2 py-0.5 text-xs ${color}`}>Confiabilidade {label.toLowerCase()}</span>;
}

export function BankMovementSearchStatus({ entry, disabled, onRetry }: { entry?: BankRowSearch; disabled: boolean; onRetry: () => void }) {
  if (!entry || entry.status === 'queued') return <span className="text-xs text-gray-400">Aguardando busca</span>;
  if (entry.status === 'searching') return <span role="status" className="inline-flex items-center gap-1 text-xs text-blue-300"><Loader2 aria-hidden size={14} className="shrink-0 animate-spin" />Buscando…</span>;
  if (entry.status === 'error') return <div className="text-xs"><span className="text-red-300" title={entry.result?.error}>Falha na busca</span><button disabled={disabled} onClick={onRetry} className="mt-1 block text-blue-300 underline disabled:opacity-50">Tentar novamente</button></div>;
  const candidate = entry.result?.candidates[0];
  if (entry.result?.assessment === 'POSSIBLE_MISSING') return <span className="text-xs text-orange-300">Possível lançamento faltante</span>;
  if (entry.result?.assessment === 'INCOMPLETE') return <div className="space-y-1"><span className="block text-xs text-amber-300">Busca incompleta</span><BankMatchConfidence confidence={candidate?.confidence} /></div>;
  if (!candidate) return <span className="text-xs text-gray-400">Sem correspondência encontrada</span>;
  return <div className="space-y-1"><span className="block text-xs text-amber-300">Para conferir</span><BankMatchConfidence confidence={candidate.confidence} /></div>;
}
