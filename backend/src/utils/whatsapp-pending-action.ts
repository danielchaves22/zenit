import type { DraftTransactionSummary, PendingAction } from '@zenit/assistant-contracts';
import type { WhatsAppReplyButton, WhatsAppReplyList } from '../services/whatsapp-cloud-api.service';

export function buildPendingActionButtons(action: PendingAction): WhatsAppReplyButton[] {
  const revision = new Date(action.updatedAt).getTime();
  if (action.summary.categoryOptions?.length) return [{ id: `zenit:cancel:${action.id}:${revision}`, title: 'Cancelar' }];
  return [
    { id: `zenit:confirm:${action.id}:${revision}`, title: 'Confirmar' },
    { id: `zenit:cancel:${action.id}:${revision}`, title: 'Cancelar' }
  ];
}

export function buildCategoryChoiceList(action: PendingAction): WhatsAppReplyList {
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
