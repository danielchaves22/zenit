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
jest.mock('../../src/services/whatsapp-audio.service', () => ({ __esModule: true, default: { transcribe: jest.fn() } }));

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
import Audio from '../../src/services/whatsapp-audio.service';
import { WhatsAppAudioError } from '../../src/utils/whatsapp-audio';

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
    jest.mocked(Audio.transcribe).mockResolvedValue({ text: 'Na verdade foram 45 reais na conta Itaú.',
      telemetry: { model: 'gpt-transcribe', bytes: 1000, latencyMs: 100 } });
  });
  afterEach(() => { jest.useRealTimers(); });

  it('transcribes voice as a continuation of the same owned session and returns text/buttons', async () => {
    await webhook({ type: 'audio', audio: { id: '123', mime_type: 'audio/ogg; codecs=opus' } });
    expect(Audio.transcribe).toHaveBeenCalledWith({ companyId: 3, userId: 2, role: 'ADMIN', mediaId: '123' });
    expect(Orchestrator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2, companyId: 3, sessionId: 4, message: 'Na verdade foram 45 reais na conta Itaú.', requireConfirmationButton: true
    }));
    expect(jest.mocked(Cloud.sendTypingIndicator).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(Audio.transcribe).mock.invocationCallOrder[0]);
    expect(db.whatsAppMessageLog.update).toHaveBeenCalledWith({ where: { whatsappMessageId: 'wamid.incoming' },
      data: { text: 'Na verdade foram 45 reais na conta Itaú.', status: 'transcribed' } });
    expect(Cloud.sendReplyButtons).toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(logger.info).mock.calls)).toContain('gpt-transcribe');
    expect(JSON.stringify([jest.mocked(logger.info).mock.calls, jest.mocked(logger.debug).mock.calls])).not.toContain('Na verdade');
  });

  it.each(['unbound', 'no_company', 'no_channel'])('does not transcribe audio without authorization: %s', async (reason) => {
    if (reason === 'unbound') db.whatsAppUserBinding.findUnique.mockResolvedValue(null);
    if (reason === 'no_company') jest.mocked(Users.getUserCompanyContext).mockResolvedValue(null as any);
    if (reason === 'no_channel') jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(false);
    await webhook({ type: 'audio', audio: { id: '123' } });
    expect(Audio.transcribe).not.toHaveBeenCalled();
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(Cloud.sendTextMessage).toHaveBeenCalled();
  });

  it.each(['existing', 'race', 'missing_id'])('never retranscribes a duplicate or unidentifiable voice message: %s', async (scenario) => {
    if (scenario === 'existing') db.whatsAppMessageLog.findUnique.mockResolvedValue({ id: 1 });
    if (scenario === 'race') db.whatsAppMessageLog.create.mockRejectedValueOnce({ code: 'P2002' });
    await webhook({ type: 'audio', audio: { id: '123' }, ...(scenario === 'missing_id' ? { id: null } : {}) });
    expect(Audio.transcribe).not.toHaveBeenCalled();
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
  });

  it.each([
    new WhatsAppAudioError('empty_transcription', 'Não consegui entender uma fala neste áudio.'),
    new Error('private provider details')
  ])('sends recoverable audio errors without executing a financial tool or logging private details', async (error) => {
    jest.mocked(Audio.transcribe).mockRejectedValueOnce(error);
    await webhook({ type: 'audio', audio: { id: '123' } });
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
    expect(Cloud.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Não consegui') }));
    expect(JSON.stringify([jest.mocked(logger.warn).mock.calls, jest.mocked(Cloud.sendTextMessage).mock.calls])).not.toContain('private provider details');
  });

  it('returns existing draft buttons to Hub without sending a second WhatsApp message', async () => {
    db.whatsAppMessageLog.create.mockResolvedValue({ id: 99 });
    const result = await WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub', text: 'Gastei 36,77' });
    expect(result.replies[0].text).toContain('Aguardando confirmação');
    expect(result.replies[0].buttons).toEqual(buildPendingActionButtons(action));
    expect(Cloud.sendTextMessage).not.toHaveBeenCalled();
    expect(Cloud.sendReplyButtons).not.toHaveBeenCalled();
    expect(Cloud.sendTypingIndicator).not.toHaveBeenCalled();
    expect(db.whatsAppMessageLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'hub_completed' }) }));
  });

  it('does not run Hub messages after Cash access is revoked', async () => {
    db.whatsAppMessageLog.create.mockResolvedValue({ id: 99 });
    jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(false);
    const result = await WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub', text: 'meus saldos' });
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(result.replies[0].text).toContain('permissoes');
  });

  it('handles Hub audio with owned identity, the existing session and button-only confirmation', async () => {
    db.whatsAppMessageLog.create.mockResolvedValue({ id: 99 });
    const result = await WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub.voice', text: '', audio: { mediaId: '123' } });
    expect(Audio.transcribe).toHaveBeenCalledWith({ companyId: 3, userId: 2, role: 'ADMIN', mediaId: '123' });
    expect(Orchestrator.processTurn).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 4, requireConfirmationButton: true, message: 'Na verdade foram 45 reais na conta Itaú.' }));
    expect(result.replies[0].buttons).toEqual(buildPendingActionButtons(action));
    expect(Cloud.sendTextMessage).not.toHaveBeenCalled();
    expect(Cloud.sendReplyButtons).not.toHaveBeenCalled();
    expect(Cloud.sendTypingIndicator).not.toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
  });

  it.each(['unbound', 'no_company', 'no_channel', 'no_cash'])('never transcribes unauthorized Hub audio: %s', async reason => {
    db.whatsAppMessageLog.create.mockResolvedValue({ id: 99 });
    if (reason === 'unbound') db.whatsAppUserBinding.findUnique.mockResolvedValue(null);
    if (reason === 'no_company') jest.mocked(Users.getUserCompanyContext).mockResolvedValue(null as any);
    if (reason === 'no_channel') jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(false);
    if (reason === 'no_cash') jest.mocked(AppAccess.hasEffectiveAccess).mockImplementation(async (_user, _company, app) => app !== 'ZENIT_CASH');
    await WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub.voice', text: '', audio: { mediaId: '123' } });
    expect(Audio.transcribe).not.toHaveBeenCalled();
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
  });

  it('rejects an audio envelope carrying a confirmation button before any processing', async () => {
    await expect(WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub.voice', text: '',
      buttonId: buildPendingActionButtons(action)[0].id, audio: { mediaId: '123' } })).rejects.toThrow('audio invalida');
    expect(Audio.transcribe).not.toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
  });

  it('returns a recoverable transcription failure through Hub without a financial operation', async () => {
    db.whatsAppMessageLog.create.mockResolvedValue({ id: 99 });
    jest.mocked(Audio.transcribe).mockRejectedValueOnce(new Error('private provider detail'));
    const result = await WhatsAppIntegrationService.dispatchForHub({ waId: binding.waId, messageId: 'wamid.hub.voice', text: '', audio: { mediaId: '123' } });
    expect(result.replies[0].text).toContain('Não consegui processar');
    expect(JSON.stringify(result)).not.toContain('private provider');
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    expect(Cloud.sendTextMessage).not.toHaveBeenCalled();
  });

  it('deduplicates Hub receipts without replaying stale private data and rechecks current permissions', async () => {
    const cached = [{ text: 'Resposta privada' }];
    db.whatsAppMessageLog.findUnique.mockResolvedValue({ waId: binding.waId, payload: { hubReplies: cached } });
    const input = { waId: binding.waId, messageId: 'wamid.hub', text: 'oi' };
    expect((await WhatsAppIntegrationService.dispatchForHub(input)).replies[0].text).toContain('ja foi recebida');
    expect(JSON.stringify(await WhatsAppIntegrationService.dispatchForHub(input))).not.toContain('Resposta privada');
    expect(Orchestrator.processTurn).not.toHaveBeenCalled();
    jest.mocked(AppAccess.hasEffectiveAccess).mockResolvedValue(false);
    expect(JSON.stringify(await WhatsAppIntegrationService.dispatchForHub(input))).not.toContain('Resposta privada');
    await expect(WhatsAppIntegrationService.dispatchForHub({ ...input, waId: '5544000000000' })).rejects.toThrow('outro remetente');
  });

  it('rejects write tools on the Hub query boundary', async () => {
    await expect(WhatsAppIntegrationService.queryForHub(binding.waId, 'confirm_pending_action', { pendingActionId: 42 })).rejects.toThrow('nao permitida');
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
  });

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

  it('routes typed confirmations through the button-only assistant context', async () => {
    await webhook({ type: 'text', text: { body: 'confirmar' } });
    expect(Orchestrator.processTurn).toHaveBeenCalledWith(expect.objectContaining({ message: 'confirmar', requireConfirmationButton: true }));
    expect(Cloud.sendReplyButtons).toHaveBeenCalled();
    expect(PendingActions.confirmTransactionDraft).not.toHaveBeenCalled();
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
