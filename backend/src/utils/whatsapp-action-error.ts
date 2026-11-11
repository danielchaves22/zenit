import { draftTransactionSummarySchema } from '@zenit/assistant-contracts';
import { expiredDraftMessage } from './whatsapp-draft-lifecycle';
import { formatCurrency } from './money';

// Only known business validations can be shown to the user. Database/provider
// errors may contain queries, credentials or data outside the current draft.
const validationMessages = new Map<string, string>([
  ['Escolha a categoria antes de confirmar o lancamento', 'Escolha a categoria antes de confirmar o lançamento.'],
  ['Categoria indisponivel', 'A categoria selecionada não está mais disponível. Escolha outra categoria.'],
  ['Categoria financeira nao encontrada para a empresa', 'A categoria selecionada não está mais disponível nesta área de trabalho.'],
  ['Categoria financeira incompativel com o tipo da transacao', 'A categoria selecionada não é compatível com o tipo do lançamento.'],
  ['Usuario sem acesso a conta de origem da acao pendente', 'Você não tem acesso à conta de origem deste lançamento. Escolha uma conta autorizada.'],
  ['Usuario sem acesso a conta de destino da acao pendente', 'Você não tem acesso à conta de destino deste lançamento. Escolha uma conta autorizada.'],
  ['Income transactions require destination account', 'Escolha a conta de destino antes de confirmar a receita.'],
  ['Expense transactions require source account', 'Escolha a conta de origem antes de confirmar a despesa.'],
  ['Transfers require source account', 'Escolha a conta de origem antes de confirmar a transferência.'],
  ['Transfers require destination account', 'Escolha a conta de destino antes de confirmar a transferência.'],
  ['Source and destination accounts must be different', 'As contas de origem e destino devem ser diferentes.'],
  ['Transaction amount must be positive', 'O valor do lançamento deve ser maior que zero.'],
  ['Another transaction is using one of these accounts. Please try again.', 'A conta está sendo atualizada por outra operação. Aguarde um momento e tente confirmar novamente.'],
  ['Lista de categorias desatualizada', 'A lista de categorias mudou. Peça o resumo atualizado do rascunho.'],
  ['Categoria nao oferecida neste rascunho', 'Escolha uma das categorias oferecidas no rascunho atualizado.'],
  ['Acao pendente nao encontrada', 'Este rascunho não está mais disponível. Peça o resumo atualizado.'],
  ['Acao pendente nao pode mais ser confirmada', 'Este rascunho já foi confirmado ou cancelado. Peça o resumo atualizado.']
]);

const publicFinancialMessages = new Set([
  'Não é possível usar repetição e parcelamento ao mesmo tempo',
  'Parcelamento está disponível apenas para despesas',
  'Cartão de crédito sem fechamento e vencimento configurados',
  'Uma compra parcelada não pode ser criada já cancelada',
  'Valor total deve permitir parcelas de pelo menos R$ 0,01',
  'A fatura selecionada ja esta paga. Escolha uma fatura aberta ou altere a data da compra.'
]);

export function formatWhatsAppActionError(error: unknown, summary?: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'WhatsApp draft expired') return expiredDraftMessage;
  if (message === 'A data informada direciona esta compra para uma fatura ja fechada. Escolha a fatura aberta atual ou altere a data da compra.') {
    const draft = draftTransactionSummarySchema.safeParse(summary);
    const date = draft.success && /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(draft.data.date);
    const purchase = date ? `A compra de ${date[3]}/${date[2]}/${date[1]}` : 'Esta compra';
    return `${purchase} cai em uma fatura já fechada. Nenhum lançamento foi gravado. Se a data estiver correta, registre a compra no Cash e escolha a fatura aberta. Se a data estiver errada, corrija o rascunho aqui.`;
  }
  const insufficientBalance = /^Insufficient balance(?: for transfer)?\. Available: (-?\d+\.\d{2}), Required: (\d+\.\d{2})$/.exec(message);
  if (insufficientBalance) {
    const draft = draftTransactionSummarySchema.safeParse(summary);
    const accountName = draft.success ? draft.data.fromAccount?.name : undefined;
    const account = accountName ? `na conta ${accountName}` : 'na conta de origem';
    const currency = (value: string) => formatCurrency(value).replace(/\u00a0/g, ' ');
    return `Saldo insuficiente ${account}. Disponível: ${currency(insufficientBalance[1])}. Valor do lançamento: ${currency(insufficientBalance[2])}.\n\nNenhum lançamento foi gravado. O rascunho foi mantido. Confira o saldo cadastrado ou escolha outra conta antes de confirmar novamente.`;
  }

  const validation = validationMessages.get(message);
  if (validation) return validation;
  if (publicFinancialMessages.has(message)) return message;
  if (/^Account(?: ID)? \d+ not found$/.test(message) || /^Account \d+ is inactive$/.test(message)) {
    return 'A conta selecionada não está mais disponível. Escolha outra conta antes de confirmar.';
  }
  if (/^Account \d+ does not belong to company \d+$/.test(message)) {
    return 'A conta selecionada não pertence a esta área de trabalho. Escolha uma conta desta área.';
  }
  return 'Não foi possível concluir esta ação por uma falha interna. Tente novamente em instantes. Se o problema continuar, entre em contato com o suporte.';
}
