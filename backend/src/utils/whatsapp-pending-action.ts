import type { DraftTransactionSummary, PendingAction } from '@zenit/assistant-contracts';
import type { WhatsAppReplyButton, WhatsAppReplyList } from '../services/whatsapp-cloud-api.service';
import { draftNeedsInput, draftClarification } from './transaction-draft-clarification';
import { namedDraftChoice } from './whatsapp-draft-lifecycle';

type DraftChoices = Pick<PendingAction, 'id' | 'summary' | 'updatedAt'>;

export function buildPendingActionButtons(action: PendingAction): WhatsAppReplyButton[] {
  const revision = new Date(action.updatedAt).getTime();
  if (draftNeedsInput(action.summary)) return [{ id: `zenit:cancel:${action.id}:${revision}`, title: 'Cancelar' }];
  return [
    { id: `zenit:confirm:${action.id}:${revision}`, title: 'Confirmar' },
    { id: `zenit:cancel:${action.id}:${revision}`, title: 'Cancelar' }
  ];
}

export function buildCategoryChoiceList(action: DraftChoices): WhatsAppReplyList {
  const revision = new Date(action.updatedAt).getTime();
  const clip = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  return { button: 'Escolher categoria', rows: (action.summary.categoryOptions ?? []).map((option, index) => ({
    id: `zenit:category:${action.id}:${revision}:${option.id}`,
    title: clip(`${index + 1}. ${option.name}`, 24),
    description: clip(option.parentName ? `${option.parentName} / ${option.name}` : option.name, 72)
  })) };
}

export function parseCategoryChoice(id: string) {
  const match = /^zenit:category:([1-9]\d*):(\d+):([1-9]\d*)$/.exec(id);
  if (!match) return null;
  const [pendingActionId, revision, categoryId] = match.slice(1).map(Number);
  if (![pendingActionId, revision, categoryId].every(Number.isSafeInteger) || !Number.isFinite(new Date(revision).getTime())) return null;
  return { pendingActionId, revision, categoryId };
}

export function parseAccountChoice(id: string) {
  const match = /^zenit:(account|accounts):([1-9]\d*):(\d+):(from|to):(\d+)$/.exec(id);
  if (!match) return null;
  const [pendingActionId, revision, value] = [match[2], match[3], match[5]].map(Number);
  if (![pendingActionId, revision, value].every(Number.isSafeInteger) || !Number.isFinite(new Date(revision).getTime()) ||
      (match[1] === 'account' && value < 1)) return null;
  return { pendingActionId, revision, field: match[4] === 'from' ? 'fromAccount' as const : 'toAccount' as const,
    accountId: match[1] === 'account' ? value : undefined, page: match[1] === 'accounts' ? value : undefined };
}

// Match only the field currently shown by buildDraftChoiceReply, including options on other pages.
export function matchDraftChoice(summary: DraftTransactionSummary, id: number, revision: number, text: string) {
  const named = namedDraftChoice(text);
  const equals = (name: string, value: string) => name.localeCompare(value.trim(), 'pt-BR', { sensitivity: 'base' }) === 0;
  for (const field of ['fromAccount', 'toAccount'] as const) {
    const options = summary[field === 'fromAccount' ? 'fromAccountOptions' : 'toAccountOptions'];
    if (!options?.length && !summary.missingFields?.includes(field)) continue;
    const matches = options?.filter(option => equals(option.name, text) ||
      (named && (named.field === 'account' || named.field === field) && equals(option.name, named.value)));
    if (matches && matches.length > 1) return { repeat: true } as const;
    if (matches?.length === 1) return { choiceId: `zenit:account:${id}:${revision}:${field === 'fromAccount' ? 'from' : 'to'}:${matches[0].id}` };
    return undefined;
  }
  const categoryMatches = (name: string) => equals(name, text) || (named?.field === 'category' && equals(name, named.value));
  const matches = summary.categoryOptions?.filter(option => categoryMatches(option.name) ||
    (option.parentName && categoryMatches(`${option.parentName} / ${option.name}`)));
  if (matches && matches.length > 1) return { repeat: true } as const;
  if (matches?.length === 1) return { choiceId: `zenit:category:${id}:${revision}:${matches[0].id}` };
}

export function buildDraftChoiceReply(action: DraftChoices, page = 0): { text: string; list?: WhatsAppReplyList } {
  const { summary } = action;
  const clip = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  for (const field of ['fromAccount', 'toAccount'] as const) {
    const options = summary[field === 'fromAccount' ? 'fromAccountOptions' : 'toAccountOptions'];
    if (!options?.length && !summary.missingFields?.includes(field)) continue;
    if (!options?.length) return { text: draftClarification(summary) };
    const pages = Math.ceil(options.length / 9);
    if (!Number.isSafeInteger(page) || page < 0 || page >= pages) throw new Error('Pagina de contas invalida');
    const prefix = `${action.id}:${new Date(action.updatedAt).getTime()}:${field === 'fromAccount' ? 'from' : 'to'}`;
    const types = { CHECKING: 'Conta corrente', SAVINGS: 'Poupança', CASH: 'Dinheiro', CREDIT_CARD: 'Cartão de crédito', INVESTMENT: 'Investimento' };
    const rows = options.slice(page * 9, page * 9 + 9).map((option, index) => ({
      id: `zenit:account:${prefix}:${option.id}`, title: clip(`${page * 9 + index + 1}. ${option.name}`, 24),
      description: clip(`${option.name} · ${types[option.type]}`, 72)
    }));
    if (pages > 1) rows.push({ id: `zenit:accounts:${prefix}:${(page + 1) % pages}`,
      title: page + 1 < pages ? 'Mais contas' : 'Voltar ao início', description: `Página ${page + 1} de ${pages}` });
    const question = field === 'fromAccount' ? 'De qual conta saiu esse valor?' : 'Em qual conta entrou esse valor?';
    return { text: `${question}\n\n${summary.description} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary.amount)}\n\nEscolha na lista ou escreva o nome da conta. Para desistir, envie “cancelar”. O lançamento ainda não foi gravado.`,
      list: { button: 'Escolher conta', rows } };
  }
  if (summary.categoryOptions?.length) return {
    text: `Qual categoria deseja usar para “${summary.description}”?\n\nEscolha na lista ou escreva o nome da categoria. Para desistir, envie “cancelar”.\n\nO lançamento ainda não foi gravado.`,
    list: buildCategoryChoiceList(action)
  };
  return { text: draftClarification(summary) };
}

export function parsePendingActionButton(id: string) {
  const match = /^zenit:(confirm|cancel):([1-9]\d*):(\d+)$/.exec(id);
  if (!match) return null;
  const pendingActionId = Number(match[2]);
  const revision = Number(match[3]);
  if (!Number.isSafeInteger(pendingActionId) || !Number.isSafeInteger(revision) ||
      !Number.isFinite(new Date(revision).getTime())) return null;
  return { decision: match[1] as 'confirm' | 'cancel', pendingActionId, revision };
}

export function formatWhatsAppDraft(summary: DraftTransactionSummary): string {
  const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
  const type = { EXPENSE: 'Despesa', INCOME: 'Receita', TRANSFER: 'Transferência' }[summary.type];
  const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary.amount);
  return [
    `${type}: ${amount}`,
    summary.description,
    summary.fromAccount ? `Conta de origem: ${summary.fromAccount.name}` : null,
    summary.toAccount ? `Conta de destino: ${summary.toAccount.name}` : null,
    summary.category ? `Categoria: ${summary.category.name}` : null,
    `Data: ${date(summary.date)}`,
    `Situação: ${{ COMPLETED: 'Efetivado', PENDING: 'Pendente', CANCELED: 'Cancelado' }[summary.status]}`,
    summary.dueDate ? `Vencimento: ${date(summary.dueDate)}` : null,
    summary.effectiveDate ? `Efetivação: ${date(summary.effectiveDate)}` : null,
    summary.installmentCount && summary.installmentCount > 1 ? `Parcelas: ${summary.installmentCount}` : null,
    summary.notes ? `Observações: ${summary.notes}` : null
  ].filter(Boolean).join('\n');
}
