import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { draftTransactionSummarySchema } from '@zenit/assistant-contracts';
import { formatCurrency } from '../utils/money';
import { draftCutoff, draftIntent, expiredDraftMessage, parseDraftIntentButton, staleDraftMessage, WhatsAppDraftScope } from '../utils/whatsapp-draft-lifecycle';
import type { WhatsAppReplyButton } from './whatsapp-cloud-api.service';

type Owner = { sessionId: number; userId: number; companyId: number };
type Result = { reply: { message: string; buttons?: WhatsAppReplyButton[] } } |
  { text: string; scope: WhatsAppDraftScope; fresh: boolean };
const stale = { reply: { message: staleDraftMessage } };

export default class WhatsAppDraftService {
  static async current(owner: Owner) {
    const { sessionId, userId, companyId } = owner;
    const where = { sessionId, userId, companyId, type: 'CREATE_TRANSACTION_DRAFT' as const, status: 'PENDING' as const };
    const expired = await prisma.assistantPendingAction.updateMany({
      where: { ...where, updatedAt: { lte: draftCutoff() } }, data: { status: 'EXPIRED', metadata: Prisma.DbNull }
    });
    const record = await prisma.assistantPendingAction.findFirst({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
    // Older deployments could leave several pending drafts. Never revive a superseded one.
    if (record) await prisma.assistantPendingAction.updateMany({ where: { ...where, OR: [
      { updatedAt: { lt: record.updatedAt } }, { updatedAt: record.updatedAt, id: { lt: record.id } }
    ] }, data: { status: 'CANCELED', canceledAt: new Date(), metadata: Prisma.DbNull } });
    return { record, expired, where };
  }

  static async route(owner: Owner, text: string, button?: NonNullable<ReturnType<typeof parseDraftIntentButton>>): Promise<Result> {
    const { record, expired, where } = await this.current(owner);
    if (!record) {
      if (button) return { reply: { message: expired.count ? expiredDraftMessage : staleDraftMessage } };
      const intent = draftIntent(text);
      if (intent === 'edit' || intent === 'cancel') return { reply: { message: expired.count ? expiredDraftMessage :
        'Não há rascunho ativo para alterar ou cancelar. Envie os dados para iniciar um novo lançamento.' } };
      return { text, scope: { mode: intent === 'new' ? 'new' : 'open' }, fresh: !!expired.count || intent === 'new' };
    }
    const revision = record.updatedAt.getTime();
    const exact = { ...where, id: record.id, updatedAt: { equals: record.updatedAt, gt: draftCutoff() } };
    const metadata = (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ?
      record.metadata : {}) as Prisma.JsonObject;
    const { whatsappDraftChoice: previous, ...other } = metadata;
    const intent = button?.mode ?? draftIntent(text);
    if (button) {
      if (button.pendingActionId !== record.id || button.revision !== revision || !previous ||
          typeof previous !== 'object' || Array.isArray(previous) || previous.nonce !== button.nonce || typeof previous.text !== 'string') return stale;
      text = previous.text;
    }
    if (intent === 'ambiguous') {
      const nonce = randomUUID().replace(/-/g, '');
      // A clarification is not an edit. Preserve the revision and the original deadline.
      const saved = await prisma.assistantPendingAction.updateMany({ where: exact,
        data: { updatedAt: record.updatedAt, metadata: { ...other, whatsappDraftChoice: { nonce, text } } } });
      if (!saved.count) return stale;
      const buttons = (['new', 'edit'] as const).map(mode => ({ id: `zenit:${mode}:${record.id}:${revision}:${nonce}`,
        title: mode === 'new' ? 'Novo lançamento' : 'Corrigir anterior' }));
      const draft = draftTransactionSummarySchema.safeParse(record.summary);
      const label = draft.success ? ` de ${formatCurrency(draft.data.amount)} (“${draft.data.description.slice(0, 100)}”)` : '';
      return { reply: { message: `Há um rascunho${label} aguardando confirmação. Esta mensagem é para um novo lançamento ou para corrigir o anterior?`, buttons } };
    }
    if (button || previous || intent === 'new') {
      const changed = await prisma.assistantPendingAction.updateMany({
        where: { ...exact, ...(button ? { metadata: { path: ['whatsappDraftChoice', 'nonce'], equals: button.nonce } } : {}) },
        data: { metadata: other as Prisma.InputJsonObject, ...(intent === 'new' ?
          { status: 'CANCELED', canceledAt: new Date() } : { updatedAt: record.updatedAt }) }
      });
      if (!changed.count) return stale;
    }
    return { text, fresh: intent === 'new', scope: intent === 'new' ? { mode: 'new' } : { mode: intent, id: record.id, revision } };
  }
}
