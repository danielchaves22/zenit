export const WHATSAPP_DRAFT_TTL = 30 * 60 * 1000;
export const draftCutoff = () => new Date(Date.now() - WHATSAPP_DRAFT_TTL);
export const expiredDraftMessage = 'Este rascunho expirou após 30 minutos sem edição. Nenhum lançamento foi gravado a partir dele. Envie os dados para começar um novo lançamento.';
export const staleDraftMessage = 'Este botão não corresponde mais à escolha atual. Peça o resumo do rascunho antes de continuar.';
export type WhatsAppDraftScope = { mode: 'new' | 'edit' | 'review' | 'cancel' | 'open'; id?: number; revision?: number };

// A field label in a WhatsApp reply is enough to identify the requested edit.
export function namedDraftChoice(text: string) {
  const match = /^(?:(?:a|na|minha)\s+)?(categoria|conta)(?:\s+de\s+(origem|destino))?(?:\s*[:=]\s*|\s+(?:é\s+)?)(.+)$/iu.exec(text.trim());
  if (!match) return undefined;
  const [, label, side, value] = match;
  if (label.toLowerCase() === 'categoria') return { field: 'category' as const, value };
  if (side?.toLowerCase() === 'origem') return { field: 'fromAccount' as const, value };
  if (side?.toLowerCase() === 'destino') return { field: 'toAccount' as const, value };
  return { field: 'account' as const, value };
}

export function draftIntent(text: string, hasDraftContext = false): 'new' | 'edit' | 'review' | 'cancel' | 'ambiguous' {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(?:por favor[, ]+)?(?:cancele?|cancelar|descart[ae]|descartar|desista|desistir|nao quero mais)\b/.test(t)) return 'cancel';
  if (/^(?:(?:eu )?quis dizer|na verdade|corrig\w*|corrija\w*|correcao|retifi\w*|ajust\w*|troque|mude|altere|altera[r]?|o valor (?:correto (?:e|era)|era|e)|a (?:conta|categoria|data) (?:era|correta e|certa e)|(?:quero|preciso) (?:corrigir|alterar|ajustar)|(?:no|nesse|neste) rascunho)\b/.test(t)) return 'edit';
  if (/\b(?:quanto|quais|qual foi|quando foi|por que)\b/.test(t) || /^(?:sera que|voce sabe|eu ja|ja (?:paguei|recebi|lancei))\b/.test(t)) return 'review';
  if (/^(?:por favor[, ]+)?(?:crie|cadastre|registre) (?:a |uma )?categoria\b/.test(t)) return 'review';
  if (/^(?:quanto|qual|quais|quando|como|mostr\w*|consult\w*|list\w*|reenv\w*|reapresent\w*|exib\w*|oi|ola|obrigad[oa]|bom dia|boa (?:tarde|noite)|(?:pode|quero) confirmar|veja|verifique|resumo|saldo|extrato|tenho|confirm\w*|sim\b|nao$|meus? (?:saldos?|gastos?|lancamentos?)|minha fatura)\b/.test(t)) return 'review';
  if (t.includes('?')) return hasDraftContext && namedDraftChoice(text) ? 'review' : 'ambiguous';
  if (/\b(?:na verdade|corrigindo|em vez de|e nao|quis dizer)\b/.test(t)) return 'ambiguous';
  if (/^(?:(?:eu |hoje |ontem )?(?:gastei|paguei|comprei|recebi|transferi)|(?:um |outro )?novo lancamento|outr[oa] (?:lancamento|despesa|compra|receita)|(?:registre|lance|anote|cadastre) (?:um[a]? |outr[oa] )?(?:despesa|receita|compra|transferencia|lancamento|r\$|\d))\b/.test(t)) return 'new';
  if (!hasDraftContext) return 'ambiguous';
  // "Conta de luz R$ 80" can be a new expense. A field label alone must not settle that question.
  if ((namedDraftChoice(text) || /^(?:foi|era) (?:na|no|pela|pelo|com) \S/.test(t)) && !hasTransactionAmountOrVerb(t)) return 'edit';
  if (/^(?:(?:a )?conta de |(?:de |na )?)(?:origem|destino)[.!]?$/.test(t)) return 'edit';
  if (/^(?:foi\s+)?(?:hoje|ontem|anteontem|(?:no dia |dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)[.!]?$/.test(t)) return 'edit';
  if (/^(?:(?:o )?valor(?:\s*[:=]\s*|\s+)(?:r\$\s*)?\d|(?:data|vencimento|efetivacao)(?:\s*[:=]\s*|\s+)(?:hoje|ontem|amanha|\d)|(?:descricao|observacao)\s*[:=]\s*\S)/.test(t)) return 'edit';
  return 'ambiguous';
}

function hasTransactionAmountOrVerb(text: string) {
  return /r\$|\d+[.,]\d{2}\b|\b(?:real|reais|centavos?|gastei|paguei|comprei|recebi|transferi)\b|^conta de (?!origem\b|destino\b).+\s\d+\s*$/iu.test(text);
}

export function isShortOptionName(text: string) {
  return !hasTransactionAmountOrVerb(text) && /^\p{L}[\p{L}\p{M}'’&/-]*(?:\s+[\p{L}\p{M}'’&/-]+){0,5}$/u.test(text.trim());
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
