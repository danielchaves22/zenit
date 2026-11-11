export const WHATSAPP_DRAFT_TTL = 30 * 60 * 1000;
export const draftCutoff = () => new Date(Date.now() - WHATSAPP_DRAFT_TTL);
export const expiredDraftMessage = 'Este rascunho expirou após 30 minutos sem edição. Nenhum lançamento foi gravado a partir dele. Envie os dados para começar um novo lançamento.';
export const staleDraftMessage = 'Este botão não corresponde mais à escolha atual. Peça o resumo do rascunho antes de continuar.';
export type WhatsAppDraftScope = { mode: 'new' | 'edit' | 'review' | 'cancel' | 'open'; id?: number; revision?: number };

export function draftIntent(text: string): 'new' | 'edit' | 'review' | 'cancel' | 'ambiguous' {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(?:por favor[, ]+)?(?:cancele?|cancelar|descart[ae]|descartar|desista|desistir|nao quero mais)\b/.test(t)) return 'cancel';
  if (/^(?:(?:eu )?quis dizer|na verdade|corrig\w*|corrija\w*|correcao|retifi\w*|ajust\w*|troque|mude|altere|altera[r]?|o valor (?:correto (?:e|era)|era|e)|a (?:conta|categoria|data) (?:era|correta e|certa e)|(?:quero|preciso) (?:corrigir|alterar|ajustar)|(?:no|nesse|neste) rascunho)\b/.test(t)) return 'edit';
  if (/\b(?:quanto|quais|qual foi|quando foi|por que)\b/.test(t) || /^(?:sera que|voce sabe|eu ja|ja (?:paguei|recebi|lancei))\b/.test(t)) return 'review';
  if (/^(?:por favor[, ]+)?(?:crie|cadastre|registre) (?:a |uma )?categoria\b/.test(t)) return 'review';
  if (/^(?:quanto|qual|quais|quando|como|mostr\w*|consult\w*|list\w*|reenv\w*|reapresent\w*|exib\w*|oi|ola|obrigad[oa]|bom dia|boa (?:tarde|noite)|(?:pode|quero) confirmar|veja|verifique|resumo|saldo|extrato|tenho|confirm\w*|sim\b|nao$|meus? (?:saldos?|gastos?|lancamentos?)|minha fatura)\b/.test(t)) return 'review';
  if (t.includes('?')) return 'ambiguous';
  if (/\b(?:na verdade|corrigindo|em vez de|e nao|quis dizer)\b/.test(t)) return 'ambiguous';
  if (/^(?:(?:eu |hoje |ontem )?(?:gastei|paguei|comprei|recebi|transferi)|(?:um |outro )?novo lancamento|outr[oa] (?:lancamento|despesa|compra|receita)|(?:registre|lance|anote|cadastre) (?:um[a]? |outr[oa] )?(?:despesa|receita|compra|transferencia|lancamento|r\$|\d))\b/.test(t)) return 'new';
  return 'ambiguous';
}

export function parseDraftIntentButton(id: string) {
  const m = /^zenit:(new|edit):([1-9]\d{0,9}):(\d{1,14}):([a-f0-9]{32})$/.exec(id);
  if (!m || Number(m[2]) > 2147483647) return null;
  return { mode: m[1] as 'new' | 'edit', pendingActionId: Number(m[2]), revision: Number(m[3]), nonce: m[4] };
}

// Apply the choice to the available tools as well as to the prompt.
export function draftToolAllowed(name: string, scope?: WhatsAppDraftScope) {
  if (!scope) return true;
  if (name === 'update_transaction_draft') return scope.mode === 'edit';
  if (name === 'create_transaction_draft') return scope.mode === 'new' || scope.mode === 'open';
  if (name === 'cancel_pending_action') return scope.mode === 'cancel';
  if (name === 'confirm_pending_action') return false;
  return true;
}
