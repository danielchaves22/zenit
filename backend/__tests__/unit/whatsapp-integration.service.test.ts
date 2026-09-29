jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  whatsAppBindingChallenge: { updateMany: jest.fn() },
  whatsAppMessageLog: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  whatsAppUserBinding: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  whatsAppBindingCompanyContext: { findUnique: jest.fn(), update: jest.fn() },
  assistantPendingAction: { findFirst: jest.fn() }
} }));
jest.mock('../../src/services/assistant-orchestrator.service', () => ({ __esModule: true, default: { processTurn: jest.fn() } }));
jest.mock('../../src/services/assistant-message.service', () => ({ __esModule: true, default: { createMessage: jest.fn() } }));
jest.mock('../../src/services/pending-action.service', () => ({ __esModule: true, default: { confirmTransactionDraft: jest.fn(), cancelPendingAction: jest.fn() } }));
jest.mock('../../src/services/app-access.service', () => ({ __esModule: true, default: { hasEffectiveAccess: jest.fn() } }));
jest.mock('../../src/services/user.service', () => ({ __esModule: true, default: { getUserCompanyContext: jest.fn() } }));
jest.mock('../../src/services/whatsapp-cloud-api.service', () => ({ __esModule: true, default: {
  verifySignature: jest.fn(), sendTextMessage: jest.fn(), sendReplyButtons: jest.fn(), sendTypingIndicator: jest.fn()
} }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import prisma from '../../src/lib/prisma';
import WhatsAppIntegrationService from '../../src/services/whatsapp-integration.service';
import Cloud from '../../src/services/whatsapp-cloud-api.service';
import Orchestrator from '../../src/services/assistant-orchestrator.service';
import Messages from '../../src/services/assistant-message.service';
import PendingActions from '../../src/services/pending-action.service';
import AppAccess from '../../src/services/app-access.service';
import Users from '../../src/services/user.service';
import { buildPendingActionButtons } from '../../src/utils/whatsapp-pending-action';
import type { PendingAction } from '@zenit/assistant-contracts';
import { logger } from '../../src/utils/logger';

const db = prisma as any;
const binding = { id: 1, userId: 2, activeCompanyId: 3, waId: '5544999990000' };
const action: PendingAction = {
  id: 42, type: 'CREATE_TRANSACTION_DRAFT', status: 'PENDING',
  createdAt: '2026-09-29T12:00:00.000Z', updatedAt: '2026-09-29T12:00:00.000Z',
  summary: { description: 'Supermercado Bom Dia', amount: 36.77, type: 'EXPENSE', status: 'COMPLETED',
    date: '2026-09-29', fromAccount: { id: 7, name: 'Nubank Daniel' }, category: { id: 8, name: 'Supermercado' } }
};
function webhook(message: Record<string, unknown>) {
  return WhatsAppIntegrationService.processWebhookPayload({ payload: {
    entry: [{ changes: [{ value: { messages: [{ id: 'wamid.incoming', from: binding.waId, ...message }] } }] }]
  } });
}
function clickButton(index: number, title = 'ignored') {
  return webhook({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: buildPendingActionButtons(action)[index].id, title } } });
}

describe('WhatsApp native feedback and decisions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(Cloud.verifySignature).mockReturnValue(true);
    jest.mocked(Cloud.sendTypingIndicator).mockResolvedValue();
    for (const send of [Cloud.sendTextMessage, Cloud.sendReplyButtons]) {
      jest.mocked(send).mockResolvedValue({ messageId: 'wamid.outgoing', raw: {} });
    }
    db.whatsAppUserBinding.findUnique.mockResolvedValue(binding);
    db.whatsAppUserBinding.findUniqueOrThrow.mockResolvedValue(binding);
    db.whatsAppBindingCompanyContext.findUnique.mockResolvedValue({ assistantSessionId: 4 });
    db.whatsAppMessageLog.findUnique.mockResolvedValue(null);
    jest.mocked(Users.getUserCompanyContext).mockResolvedValue({ role: 'ADMIN' } as any);
    jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(true);
    jest.mocked(Orchestrator.processTurn).mockResolvedValue({ message: 'Despesa registrada.', pendingAction: action } as any);
    db.assistantPendingAction.findFirst.mockResolvedValue({ id: action.id });
    jest.mocked(PendingActions.confirmTransactionDraft).mockResolvedValue({ pendingAction: { ...action, status: 'CONFIRMED' } } as any);
    jest.mocked(PendingActions.cancelPendingAction).mockResolvedValue({ ...action, status: 'CANCELED' });
  });
  afterEach(() => { jest.useRealTimers(); });

  it('shows typing before processing, then sends a factual draft with both buttons', async () => {
    await webhook({ type: 'text', text: { body: 'Gastei 36,77 no mercado' } });
    expect(Cloud.sendTypingIndicator).toHaveBeenCalledWith('wamid.incoming');
    expect(jest.mocked(Cloud.sendTypingIndicator).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(Orchestrator.processTurn).mock.invocationCallOrder[0]);
    const reply = jest.mocked(Cloud.sendReplyButtons).mock.calls[0][0];
    expect(reply.text).toContain('Aguardando confirmação');
    expect(reply.text).toContain('Supermercado Bom Dia');
    expect(reply.text).toContain('Nubank Daniel');
    expect(reply.text).not.toContain('Despesa registrada');
    expect(reply.buttons).toEqual(buildPendingActionButtons(action));
    expect(Cloud.sendTextMessage).not.toHaveBeenCalled();
    expect(db.whatsAppMessageLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ direction: 'OUTBOUND', kind: 'INTERACTIVE' }) }));
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"outcome":"completed"'));
    const logs = JSON.stringify([jest.mocked(logger.info).mock.calls, jest.mocked(logger.debug).mock.calls]);
    expect(logs).not.toContain('Gastei 36,77');
    expect(logs).not.toContain('textPreview');
  });

  it.each([0, 1])('resolves button %s by its ID, scoped to owner, company, session and revision', async (index) => {
    await clickButton(index, index === 0 ? 'Cancelar' : 'Confirmar');
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(db.assistantPendingAction.findFirst).toHaveBeenCalledWith({ where: {
      id: 42, userId: 2, companyId: 3, sessionId: 4, type: 'CREATE_TRANSACTION_DRAFT', status: 'PENDING', updatedAt: new Date(action.updatedAt)
    } });
    const called = index === 0 ? PendingActions.confirmTransactionDraft : PendingActions.cancelPendingAction;
    const other = index === 0 ? PendingActions.cancelPendingAction : PendingActions.confirmTransactionDraft;
    expect(called).toHaveBeenCalledWith(expect.objectContaining({ pendingActionId: 42, userId: 2, companyId: 3, sessionId: 4, expectedUpdatedAt: new Date(action.updatedAt) }));
    expect(other).not.toHaveBeenCalled();
    expect(Messages.createMessage).toHaveBeenCalledTimes(2);
    expect(Cloud.sendReplyButtons).not.toHaveBeenCalled();
    expect(Cloud.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(index === 0 ? 'Lançamento confirmado' : 'Rascunho cancelado') }));
  });

  it('rejects a stale, already resolved or foreign draft without invoking the model', async () => {
    db.assistantPendingAction.findFirst.mockResolvedValue(null);
    await clickButton(0);
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
    expect(PendingActions.cancelPendingAction).not.toHaveBeenCalled();
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(Cloud.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('não está mais válido') }));
  });

  it('does not interpret an unknown button title as a confirmation', async () => {
    await webhook({ type: 'interactive', interactive: { button_reply: { id: 'unknown', title: 'Confirmar' } } });
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
  });

  it('honors revoked channel access before executing a button', async () => {
    jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(false);
    await clickButton(0);
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
    expect(Cloud.sendTypingIndicator).not.toHaveBeenCalled();
  });

  it('keeps typed confirmations on the existing assistant flow', async () => {
    jest.mocked(Orchestrator.processTurn).mockResolvedValue({ message: 'Confirmado.', pendingAction: null } as any);
    await webhook({ type: 'text', text: { body: 'confirmar' } });
    expect(Orchestrator.processTurn).toHaveBeenCalledWith(expect.objectContaining({ message: 'confirmar' }));
    expect(Cloud.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Confirmado.' }));
  });

  it('ignores redelivered inbound messages', async () => {
    db.whatsAppMessageLog.findUnique.mockResolvedValue({ id: 1 });
    await clickButton(0);
    expect(Cloud.sendTypingIndicator).not.toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
  });

  it('continues answering when the typing API fails', async () => {
    jest.mocked(Cloud.sendTypingIndicator).mockRejectedValue(new Error('timeout'));
    await webhook({ type: 'text', text: { body: 'oi' } });
    expect(Cloud.sendReplyButtons).toHaveBeenCalled();
  });

  it('renews typing for a slow turn and stops before sending the answer', async () => {
    jest.useFakeTimers();
    let finish!: (value: any) => void;
    jest.mocked(Orchestrator.processTurn).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const work = webhook({ type: 'text', text: { body: 'oi' } });
    await jest.advanceTimersByTimeAsync(40000);
    expect(Cloud.sendTypingIndicator).toHaveBeenCalledTimes(3);
    finish({ message: 'Pronto.', pendingAction: null });
    await work;
    await jest.advanceTimersByTimeAsync(40000);
    expect(Cloud.sendTypingIndicator).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears typing timers even when the assistant fails', async () => {
    jest.useFakeTimers();
    jest.mocked(Orchestrator.processTurn).mockRejectedValue(new Error('model failure'));
    await webhook({ type: 'text', text: { body: 'oi' } });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps a long summary intact and sends a separate button prompt within Meta limits', async () => {
    const longAction = { ...action, summary: { ...action.summary, notes: 'Detalhe '.repeat(300) } };
    jest.mocked(Orchestrator.processTurn).mockResolvedValue({ message: 'Rascunho', pendingAction: longAction } as any);
    await webhook({ type: 'text', text: { body: 'despesa' } });
    expect(Cloud.sendTextMessage).toHaveBeenCalled();
    const text = jest.mocked(Cloud.sendTextMessage).mock.calls.map(([params]) => params.text).join(' ');
    expect(text).toContain('Supermercado Bom Dia');
    expect(text).toContain('Observações: Detalhe');
    expect(jest.mocked(Cloud.sendReplyButtons).mock.calls[0][0].text.length).toBeLessThanOrEqual(1024);
  });

  it('preserves INTERACTIVE classification when delivery status arrives', async () => {
    db.whatsAppMessageLog.findUnique.mockResolvedValue({ id: 8, kind: 'INTERACTIVE' });
    await WhatsAppIntegrationService.processWebhookPayload({ payload: { entry: [{ changes: [{ value: {
      statuses: [{ id: 'wamid.outgoing', status: 'delivered', recipient_id: binding.waId }]
    } }] }] } });
    expect(db.whatsAppMessageLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'INTERACTIVE' }) }));
    expect(Cloud.sendTypingIndicator).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('keeps failed delivery visible while routine status callbacks stay quiet', async () => {
    await WhatsAppIntegrationService.processWebhookPayload({ payload: { entry: [{ changes: [{ value: {
      statuses: [{ id: 'wamid.failed', status: 'failed', errors: [{ code: 131026 }], recipient_id: binding.waId }]
    } }] }] } });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('131026'));
    expect(logger.info).not.toHaveBeenCalled();
  });
});
