import React from 'react';
import { Button } from '@/components/ui/Button';
import { BankCandidate, BankItem, BankSearchResult, bankCurrency, bankDate } from '@/lib/bank-reconciliation';
import { BankMatchConfidence } from './BankMatchConfidence';

interface Props {
  results: BankSearchResult[];
  items: BankItem[];
  disabled: boolean;
  onReview: (candidate: BankCandidate, cacheId?: number) => void;
  onReject: (candidate: BankCandidate) => void;
  onManual: (item: BankItem) => void;
  onCreate: (item: BankItem) => void;
}

export default function BankMatchSuggestions({ results, items, disabled, onReview, onReject, onManual, onCreate }: Props) {
  function candidateView(candidate: BankCandidate, cacheId?: number) {
    return <div key={candidate.key} className="mt-3 rounded border border-border p-3">
      <p className="text-xs font-semibold text-tone-blue">{candidate.source === 'AI' ? 'Sugestão com apoio da IA' : candidate.source === 'HISTORY' ? 'Histórico confirmado' : 'Sugestão por regras'}</p>
      <div className="mt-2"><BankMatchConfidence confidence={candidate.confidence} /></div>
      {candidate.transactions.map(t => <p key={t.id} className="mt-2 text-sm">{t.description} · {bankCurrency(t.amount)} <span className="text-text-muted">({bankDate(t.date)}{t.status === 'PENDING' ? ', pendente' : ''})</span></p>)}
      {candidate.items.length > 1 && <p className="mt-2 text-sm text-tone-amber">Agrupa {candidate.items.length} itens do extrato: {candidate.items.map(i => bankCurrency(i.amount)).join(' + ')}.</p>}
      <p className="my-3 text-sm text-text-muted">{candidate.reason}</p>
      {candidate.confidence && <p className="mb-3 text-xs text-text-muted">{candidate.confidence.reasons.join(' · ')}.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={disabled} onClick={() => onReview(candidate, cacheId)}>Revisar vínculo</Button><Button variant="outline" disabled={disabled} onClick={() => onReject(candidate)}>Não corresponde</Button></div>
    </div>;
  }
  return <div className="space-y-4">{results.map(result => {
    const item = items.find(i => i.id === result.itemId);
    return <section key={result.itemId} className="rounded-lg border border-border p-4" aria-label={`Correspondências para ${item?.description || 'grupo selecionado'}`}>
      {item && <><h3 className="break-words font-semibold">{item.description}</h3><p className="mt-1 text-sm text-text-muted">{bankDate(item.date)} · {bankCurrency(item.amount)}</p></>}
      {result.error && <p role="alert" className="mt-2 text-sm text-tone-red">{result.error}</p>}
      {result.aiMessage && <p className="mt-2 text-sm text-text-muted">{result.aiMessage}</p>}
      {(result.limited || result.assessment === 'INCOMPLETE') && <p className="mt-2 text-sm text-tone-amber">Busca incompleta: há limites na busca ou lançamentos com acesso restrito. Ainda não é possível indicar um possível faltante. Use a busca manual para ampliar.</p>}
      {result.assessment === 'POSSIBLE_MISSING' && !result.error && <p className="mt-3 text-sm text-tone-orange">Possível lançamento faltante: nenhum candidato compatível permanece na busca pelas regras, após considerar suas rejeições. Confira manualmente antes de registrar; o lançamento pode estar fora do período pesquisado.</p>}
      {!result.candidates.length && !result.error && !result.assessment && <p className="mt-3 text-sm text-text-muted">Nenhuma sugestão disponível. Busque manualmente para conferir.</p>}
      {result.candidates[0] && candidateView(result.candidates[0], result.cacheId)}
      {result.candidates.length > 1 && <details className="mt-3"><summary className="cursor-pointer text-sm text-tone-blue">Ver outras {result.candidates.length - 1} sugestão(ões)</summary>{result.candidates.slice(1).map(candidate => candidateView(candidate, result.cacheId))}</details>}
      {item && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => onManual(item)}>Buscar manualmente</Button><Button variant="outline" disabled={disabled} onClick={() => onCreate(item)}>Registrar faltante</Button></div>}
    </section>;
  })}</div>;
}
