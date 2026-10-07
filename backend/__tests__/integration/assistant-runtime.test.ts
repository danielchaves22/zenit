process.env.INTEGRATION_SECRETS_MASTER_KEY =
  process.env.INTEGRATION_SECRETS_MASTER_KEY ||
  'assistant-integration-master-key-32-bytes-min';

import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';
import AppAccessService from '../../src/services/app-access.service';
import OpenAiIntegrationService from '../../src/services/openai-integration.service';
import PendingActionService from '../../src/services/pending-action.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import WhatsAppIntegrationService from '../../src/services/whatsapp-integration.service';
import WhatsAppCloudApiService from '../../src/services/whatsapp-cloud-api.service';
import { buildCategoryChoiceList, buildPendingActionButtons } from '../../src/utils/whatsapp-pending-action';
import type { PendingAction } from '@zenit/assistant-contracts';
import ToolExecutorService from '../../src/services/tool-executor.service';
import ToolRegistryService from '../../src/services/tool-registry.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function authHeaders(token: string, companyId: number) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Company-Id': String(companyId),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  };
}

function parseSse(text: string) {
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event:'));
      const dataLine = lines.find((line) => line.startsWith('data:'));
      return {
        event: eventLine?.slice('event:'.length).trim() || '',
        data: dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null
      };
    });
}

function getTodayDateString(timeZone = 'America/Sao_Paulo') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

jest.setTimeout(20000);

describe('Assistant runtime', () => {
  let companyId: number;
  let userId: number;
  let token: string;

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: `Assistant Runtime Company ${Date.now()}`,
        code: Number(`7${String(Date.now()).slice(-7)}`)
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `assistant-runtime-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Assistant Runtime User',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    await prisma.userCompany.create({
      data: {
        userId,
        companyId,
        role: 'ADMIN',
        isDefault: true,
        manageFinancialAccounts: true,
        manageFinancialCategories: true
      }
    });

    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true }
    ]);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }
    ]);

    await OpenAiIntegrationService.upsertByok({
      companyId,
      apiKey: 'sk-assistant-runtime-test-key',
      promptVersion: 'v1',
      isActive: true
    });

    token = generateToken({ userId });
  });

  beforeEach(async () => {
    jest.restoreAllMocks();

    await prisma.whatsAppMessageLog.deleteMany({ where: { companyId } });
    await prisma.whatsAppUserBinding.deleteMany({ where: { userId } });
    await prisma.assistantToolTrace.deleteMany({ where: { companyId } });
    await prisma.assistantPendingAction.deleteMany({ where: { companyId } });
    await prisma.assistantMessage.deleteMany({ where: { companyId } });
    await prisma.assistantTurn.deleteMany({ where: { companyId } });
    await prisma.assistantSession.deleteMany({ where: { companyId } });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });

    await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Nubank',
        type: 'CHECKING',
        isDefault: true,
        balance: 1000
      }
    });

    await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Combustivel',
        type: 'EXPENSE',
        color: '#2563EB',
        icon: 'fuel',
        isDefault: true
      }
    });

    await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Receitas',
        type: 'INCOME',
        color: '#16A34A',
        icon: 'wallet',
        isDefault: true
      }
    });
  });

  afterAll(async () => {
    await prisma.whatsAppMessageLog.deleteMany({ where: { companyId } });
    await prisma.whatsAppUserBinding.deleteMany({ where: { userId } });
    await prisma.assistantToolTrace.deleteMany({ where: { companyId } });
    await prisma.assistantPendingAction.deleteMany({ where: { companyId } });
    await prisma.assistantMessage.deleteMany({ where: { companyId } });
    await prisma.assistantTurn.deleteMany({ where: { companyId } });
    await prisma.assistantSession.deleteMany({ where: { companyId } });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.companyAiCredential.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createDecisionDraft() {
    const session = await prisma.assistantSession.create({ data: { userId, companyId } });
    const turn = await prisma.assistantTurn.create({ data: { sessionId: session.id, userId, companyId } });
    const account = await prisma.financialAccount.findFirstOrThrow({ where: { companyId } });
    const category = await prisma.financialCategory.findFirstOrThrow({ where: { companyId, type: 'EXPENSE' } });
    const action = await PendingActionService.createTransactionDraftAction({
      sessionId: session.id, turnId: turn.id, userId, companyId,
      summary: { description: 'Compra por WhatsApp', amount: 36.77, date: '2026-09-29',
        type: 'EXPENSE', status: 'COMPLETED', fromAccount: { id: account.id, name: account.name } },
      payload: { description: 'Compra por WhatsApp', amount: 36.77, date: '2026-09-29',
        type: 'EXPENSE', status: 'COMPLETED', fromAccountId: account.id, categoryId: category.id }
    });
    return { pendingActionId: action.id, sessionId: session.id, userId, companyId,
      role: 'ADMIN' as const, expectedUpdatedAt: new Date(action.updatedAt) };
  }

  async function categoryChoiceFixture() {
    const session = await prisma.assistantSession.create({ data: { userId, companyId } });
    const turn = await prisma.assistantTurn.create({ data: { sessionId: session.id, userId, companyId } });
    const categories = await Promise.all(['Restaurante', 'Lanches'].map(name => prisma.financialCategory.create({
      data: { name, companyId, type: 'EXPENSE', color: '#123456', icon: 'wallet' }
    })));
    const context = { sessionId: session.id, turnId: turn.id, userId, companyId, role: 'ADMIN' as const,
      mode: 'OPERATOR' as const, requireConfirmationButton: true };
    const args = { description: 'Almoço', amount: 40, type: 'EXPENSE', date: '2026-10-07',
      notes: 'Manter observação', categoryCandidateIds: categories.map(category => category.id) };
    const result = await ToolExecutorService.executeTool('create_transaction_draft', args, context);
    return { context, args, categories, action: result.pendingAction! };
  }

  it('persiste a escolha no rascunho, preserva correcoes e exige confirmacao atual depois da selecao', async () => {
    const { context, categories, action } = await categoryChoiceFixture();
    const decision = { ...context, pendingActionId: action.id, expectedUpdatedAt: new Date(action.updatedAt) };
    expect(action.summary.category).toBeNull();
    expect(action.summary.categoryOptions?.map(option => option.id)).toEqual(categories.map(category => category.id));
    expect(buildPendingActionButtons(action).some(button => button.title === 'Confirmar')).toBe(false);
    await expect(PendingActionService.confirmTransactionDraft(decision)).rejects.toThrow('Escolha a categoria');
    const corrected = (await ToolExecutorService.executeTool('update_transaction_draft', {
      pendingActionId: action.id, amount: 45, categoryCandidateIds: null, categoryId: null
    }, context)).pendingAction!;
    expect(corrected.id).toBe(action.id);
    expect(corrected.summary.categoryOptions).toEqual(action.summary.categoryOptions);
    await expect(PendingActionService.selectTransactionCategory({ ...decision, categoryId: categories[0].id })).rejects.toThrow('desatualizada');
    const current = { ...decision, expectedUpdatedAt: new Date(corrected.updatedAt) };
    await expect(PendingActionService.selectTransactionCategory({ ...current, sessionId: 999999, categoryId: categories[0].id })).rejects.toThrow();
    const unoffered = await prisma.financialCategory.findFirstOrThrow({ where: { companyId, type: 'EXPENSE', isDefault: true } });
    await expect(PendingActionService.selectTransactionCategory({ ...current, categoryId: unoffered.id })).rejects.toThrow('nao oferecida');
    const selected = await PendingActionService.selectTransactionCategory({ ...current, categoryId: categories[1].id });
    expect(selected.summary).toMatchObject({ amount: 45, description: 'Almoço', date: '2026-10-07',
      notes: 'Manter observação', category: { id: categories[1].id } });
    expect(selected.summary.categoryOptions).toBeUndefined();
    const stored = await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.payload).toMatchObject({ amount: 45, categoryId: categories[1].id, fromAccountId: selected.summary.fromAccount!.id });
    expect(await prisma.assistantPendingAction.count({ where: { companyId } })).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    await expect(PendingActionService.selectTransactionCategory({ ...current, categoryId: categories[0].id })).rejects.toThrow();
    await expect(PendingActionService.confirmTransactionDraft(current)).rejects.toThrow();
    await PendingActionService.confirmTransactionDraft({ ...current, expectedUpdatedAt: new Date(selected.updatedAt) });
    expect(await prisma.financialTransaction.count({ where: { companyId, categoryId: categories[1].id } })).toBe(1);
  });

  it('revalida empresa e tipo dos candidatos e da escolha; permite categoria explicita sem lista', async () => {
    const { context, categories, action, args } = await categoryChoiceFixture();
    const income = await prisma.financialCategory.findFirstOrThrow({ where: { companyId, type: 'INCOME' } });
    for (const ids of [[categories[0].id, income.id], [categories[0].id, 99999999], [categories[0].id, categories[0].id]]) {
      await expect(ToolExecutorService.executeTool('create_transaction_draft', { ...args, categoryCandidateIds: ids }, context)).rejects.toThrow();
    }
    await prisma.financialCategory.update({ where: { id: categories[0].id }, data: { type: 'INCOME' } });
    await expect(PendingActionService.selectTransactionCategory({ ...context, pendingActionId: action.id,
      expectedUpdatedAt: new Date(action.updatedAt), categoryId: categories[0].id })).rejects.toThrow('indisponivel');
    const chosen = (await ToolExecutorService.executeTool('update_transaction_draft', {
      pendingActionId: action.id, categoryId: categories[1].id
    }, context)).pendingAction!;
    expect(chosen.id).toBe(action.id);
    expect(chosen.summary.categoryOptions).toBeUndefined();
    expect(chosen.summary.category?.id).toBe(categories[1].id);
  });

  it('resolve opcao unica, oferece empate sem hint e pede esclarecimento quando nao ha correspondencia', async () => {
    const { context } = await categoryChoiceFixture();
    context.turnId = (await prisma.assistantTurn.create({ data: { sessionId: context.sessionId, userId, companyId } })).id;
    const unique = await ToolExecutorService.executeTool('create_transaction_draft', {
      description: 'Gasolina', amount: 50, type: 'EXPENSE'
    }, context);
    expect(unique.pendingAction?.summary.category?.name).toBe('Combustivel');
    expect(unique.pendingAction?.summary.categoryOptions).toBeUndefined();
    await prisma.financialCategory.create({ data: { companyId, name: 'Combustivel carro', type: 'EXPENSE', color: '#123456', icon: 'fuel' } });
    context.turnId = (await prisma.assistantTurn.create({ data: { sessionId: context.sessionId, userId, companyId } })).id;
    const tied = await ToolExecutorService.executeTool('create_transaction_draft', {
      description: 'Gasolina', amount: 50, type: 'EXPENSE'
    }, context);
    expect(tied.pendingAction?.summary.categoryOptions).toHaveLength(2);
    const missing = await ToolExecutorService.executeTool('create_transaction_draft', {
      description: 'Xyz123', amount: 50, type: 'EXPENSE'
    }, context);
    expect(missing.pendingAction).toBeUndefined();
    expect(missing.data).toMatchObject({ ok: false, missingFields: ['category'] });
  });

  it.each(['hub', 'webhook'] as const)('entrega lista e usa o ID da selecao sem pedir outra decisao a IA (%s)', async transport => {
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true }, { appKey: AppKey.ZENIT_WHATSAPP, enabled: true }
    ]);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }, { appKey: AppKey.ZENIT_WHATSAPP, granted: true }
    ]);
    const { context, categories, action } = await categoryChoiceFixture();
    const waId = `5598${String(userId).padStart(9, '0')}`;
    const binding = await prisma.whatsAppUserBinding.create({ data: { userId, activeCompanyId: companyId, waId, phoneNumber: `+${waId}` } });
    await prisma.whatsAppBindingCompanyContext.create({ data: {
      bindingId: binding.id, companyId, assistantSessionId: context.sessionId
    } });
    jest.spyOn(WhatsAppCloudApiService, 'verifySignature').mockReturnValue(true);
    jest.spyOn(WhatsAppCloudApiService, 'sendTypingIndicator').mockResolvedValue();
    let sent = 0;
    const sentResult = async () => ({ messageId: `wamid.choice.out.${companyId}.${++sent}`, raw: {} });
    jest.spyOn(WhatsAppCloudApiService, 'sendTextMessage').mockImplementation(sentResult);
    const listSpy = jest.spyOn(WhatsAppCloudApiService, 'sendListMessage').mockImplementation(sentResult);
    const buttonSpy = jest.spyOn(WhatsAppCloudApiService, 'sendReplyButtons').mockImplementation(sentResult);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ id: 'resp.read', output: [
      { type: 'function_call', name: 'get_pending_action', call_id: 'read', arguments: '{}' }
    ] }))).mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{"mode":"OPERATOR","message":"Escolha a categoria."}' })));
    if (transport === 'hub') {
      const result = await WhatsAppIntegrationService.dispatchForHub({ waId, messageId: `list.${transport}.${companyId}`, text: 'Reenvie o rascunho' });
      expect(result.replies[0].list).toEqual(buildCategoryChoiceList(action));
      expect(result.replies[0].buttons).toBeUndefined();
    } else {
      await WhatsAppIntegrationService.processWebhookPayload({ payload: { entry: [{ changes: [{ value: { messages: [
        { id: `list.${transport}.${companyId}`, from: waId, type: 'text', text: { body: 'Reenvie o rascunho' } }
      ] } }] }] } });
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ list: buildCategoryChoiceList(action) }));
      expect(buttonSpy).not.toHaveBeenCalled();
    }
    const before = fetchSpy.mock.calls.length;
    const row = buildCategoryChoiceList(action).rows[1];
    if (transport === 'hub') {
      const result = await WhatsAppIntegrationService.dispatchForHub({ waId, messageId: `choice.${transport}.${companyId}`, text: '', buttonId: row.id });
      expect(result.replies[0].buttons?.[0].title).toBe('Confirmar');
      expect(result.replies[0].text).toContain(categories[1].name);
    } else {
      await WhatsAppIntegrationService.processWebhookPayload({ payload: { entry: [{ changes: [{ value: { messages: [
        { id: `choice.${transport}.${companyId}`, from: waId, type: 'interactive', interactive: {
          type: 'list_reply', list_reply: { id: row.id, title: 'Confirmar tudo' }
        } }
      ] } }] }] } });
      expect(buttonSpy).toHaveBeenCalledWith(expect.objectContaining({ buttons: expect.arrayContaining([expect.objectContaining({ title: 'Confirmar' })]) }));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(before);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    expect((await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: action.id } })).payload).toMatchObject({ categoryId: categories[1].id });
  });

  it.each(['webhook', 'hub'] as const)('recebe voz, corrige o mesmo rascunho por voz, rejeita botoes antigos e grava apenas a versao revisada (%s)', async (transport) => {
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true }, { appKey: AppKey.ZENIT_WHATSAPP, enabled: true }
    ]);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }, { appKey: AppKey.ZENIT_WHATSAPP, granted: true }
    ]);
    const waId = `5599${String(userId).padStart(9, '0')}`;
    await prisma.whatsAppUserBinding.create({ data: { userId, activeCompanyId: companyId, waId, phoneNumber: `+${waId}` } });
    const nubank = await prisma.financialAccount.findFirstOrThrow({ where: { companyId, name: 'Nubank' } });
    const itau = await prisma.financialAccount.create({ data: { companyId, name: 'Itau', type: 'CHECKING', balance: 500 } });
    const category = await prisma.financialCategory.findFirstOrThrow({ where: { companyId, type: 'EXPENSE' } });
    jest.spyOn(WhatsAppCloudApiService, 'verifySignature').mockReturnValue(true);
    jest.spyOn(WhatsAppCloudApiService, 'sendTypingIndicator').mockResolvedValue();
    jest.spyOn(WhatsAppCloudApiService, 'downloadAudio').mockResolvedValue({ buffer: Buffer.from('audio'), mimeType: 'audio/ogg', filename: 'voz.ogg' });
    let sent = 0;
    const sendResult = async () => ({ messageId: `wamid.out.${companyId}.${++sent}`, raw: {} });
    const textSpy = jest.spyOn(WhatsAppCloudApiService, 'sendTextMessage').mockImplementation(sendResult);
    const buttonsSpy = jest.spyOn(WhatsAppCloudApiService, 'sendReplyButtons').mockImplementation(sendResult);
    const response = (data: unknown) => new Response(JSON.stringify(data));
    const tool = (name: string, args: object) => response({ id: `resp.${name}`, output: [
      { type: 'function_call', name, call_id: `call.${name}`, arguments: JSON.stringify(args) }
    ] });
    const final = response({ output_text: '{"mode":"OPERATOR","message":"Confira o rascunho."}' });
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ text: 'Gastei cinquenta reais no posto pela conta Nubank.' }))
      .mockResolvedValueOnce(tool('create_transaction_draft', { description: 'Combustivel no posto', amount: 50, type: 'EXPENSE',
        fromAccountId: nubank.id, categoryId: category.id }))
      .mockResolvedValueOnce(final);
    const hubReplies: { text: string; buttons?: { id: string; title: string }[] }[] = [];
    const inbound = async (id: string, message: { type: string; text?: { body: string }; audio?: { id: string }; interactive?: { button_reply: { id: string; title: string } } }) => {
      if (transport === 'hub') {
        const result = await WhatsAppIntegrationService.dispatchForHub({ waId, messageId: `${companyId}.${id}`,
          text: message.text?.body || '', buttonId: message.interactive?.button_reply.id,
          ...(message.audio ? { audio: { mediaId: message.audio.id } } : {}) });
        hubReplies.push(...result.replies);
      } else await WhatsAppIntegrationService.processWebhookPayload({ payload: {
        entry: [{ changes: [{ value: { messages: [{ id: `${companyId}.${id}`, from: waId, ...message }] } }] }]
      } });
    };
    const sentButtons = () => transport === 'hub' ? hubReplies.filter(reply => reply.buttons).map(reply => reply.buttons!)
      : buttonsSpy.mock.calls.map(call => call[0].buttons);
    await inbound('voice1', { type: 'audio', audio: { id: '123' } });
    const first = await prisma.assistantPendingAction.findFirstOrThrow({ where: { companyId } });
    const firstButtons = sentButtons()[0];
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    expect((first.payload as any).amount).toBe(50);

    fetchSpy.mockResolvedValueOnce(response({ text: 'Na verdade foram quarenta e cinco, e usei a conta Itau.' }))
      .mockResolvedValueOnce(tool('get_pending_action', {}))
      .mockResolvedValueOnce(tool('update_transaction_draft', { pendingActionId: first.id, amount: 45, fromAccountId: itau.id }))
      .mockResolvedValueOnce(response({ output_text: '{"mode":"OPERATOR","message":"Rascunho corrigido. Confira antes de confirmar."}' }));
    await inbound('voice2', { type: 'audio', audio: { id: '456' } });
    const revised = await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: first.id } });
    expect(await prisma.assistantPendingAction.count({ where: { companyId } })).toBe(1);
    expect(revised.sessionId).toBe(first.sessionId);
    expect(revised.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    expect(revised.payload).toMatchObject({ amount: 45, fromAccountId: itau.id, description: 'Combustivel no posto', categoryId: category.id });
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    const secondModelRequest = JSON.parse(String(fetchSpy.mock.calls[4][1]?.body));
    expect(JSON.stringify(secondModelRequest.input)).toContain('cinquenta reais');
    expect(JSON.stringify(secondModelRequest.input)).toContain('quarenta e cinco');
    const voiceLog = await prisma.whatsAppMessageLog.findUniqueOrThrow({ where: { whatsappMessageId: `${companyId}.voice2` } });
    expect(voiceLog.text).toContain('quarenta e cinco');

    // Even an unexpected model tool call cannot turn a spoken/textual "confirmar" into a write.
    for (const inputKind of ['text', 'audio']) {
      if (inputKind === 'audio') fetchSpy.mockResolvedValueOnce(response({ text: 'Pode confirmar.' }));
      fetchSpy.mockResolvedValueOnce(tool('confirm_pending_action', { pendingActionId: first.id }))
        .mockResolvedValueOnce(tool('get_pending_action', { pendingActionId: first.id }))
        .mockResolvedValueOnce(response({ output_text: '{"mode":"OPERATOR","message":"Toque no botão Confirmar."}' }));
      await inbound(`confirm_by_${inputKind}`, inputKind === 'audio'
        ? { type: 'audio', audio: { id: '789' } } : { type: 'text', text: { body: 'Confirmar' } });
      expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    }

    const click = (id: string, button: { id: string; title: string }) => inbound(id,
      { type: 'interactive', interactive: { button_reply: button } });
    await click('old_button', firstButtons[0]);
    const lastText = transport === 'hub' ? hubReplies[hubReplies.length - 1].text : textSpy.mock.calls[textSpy.mock.calls.length - 1][0].text;
    expect(lastText).toContain('não está mais válido');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    const revisedAction = await PendingActionService.getPendingAction({ pendingActionId: first.id, userId, companyId });
    expect(sentButtons()[1]).toEqual(buildPendingActionButtons(revisedAction as PendingAction));
    await click('new_button', sentButtons()[1][0]);
    const transactions = await prisma.financialTransaction.findMany({ where: { companyId } });
    expect(transactions).toHaveLength(1);
    expect(Number(transactions[0].amount)).toBe(45);
    expect(transactions[0].fromAccountId).toBe(itau.id);
    const callsBeforeReplay = fetchSpy.mock.calls.length;
    await inbound('voice2', { type: 'audio', audio: { id: '456' } });
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeReplay);
    expect(WhatsAppCloudApiService.downloadAudio).toHaveBeenCalledTimes(3);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(1);
    if (transport === 'hub') {
      expect(textSpy).not.toHaveBeenCalled();
      expect(buttonsSpy).not.toHaveBeenCalled();
      expect(WhatsAppCloudApiService.sendTypingIndicator).not.toHaveBeenCalled();
    }
  }, 30000);

  it('grava apenas uma transacao quando dois cliques confirmam o mesmo rascunho', async () => {
    const decision = await createDecisionDraft();
    const results = await Promise.allSettled([
      PendingActionService.confirmTransactionDraft(decision),
      PendingActionService.confirmTransactionDraft(decision)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(1);
    await expect(PendingActionService.cancelPendingAction(decision)).rejects.toThrow();
    const stored = await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: decision.pendingActionId } });
    expect(stored.status).toBe('CONFIRMED');
    expect(stored.confirmedTransactionId).not.toBeNull();
  });

  it('preserva campos nulos da tool estrita numa correcao e bloqueia confirmacao por linguagem natural no WhatsApp', async () => {
    const decision = await createDecisionDraft();
    const old = await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: decision.pendingActionId } });
    const other = await prisma.financialAccount.create({ data: { companyId, name: 'Outra conta autorizada', type: 'CHECKING' } });
    const payload = { ...(old.payload as object), fromAccountId: other.id, notes: 'Preservar observacao', dueDate: '2026-10-10', effectiveDate: '2026-09-20' };
    await prisma.assistantPendingAction.update({ where: { id: old.id }, data: { payload } });
    const context = { sessionId: decision.sessionId, turnId: old.turnId, userId, companyId, role: 'ADMIN' as const,
      mode: 'OPERATOR' as const, requireConfirmationButton: true };
    const definition = ToolRegistryService.getToolsForMode('OPERATOR').find(tool => tool.name === 'update_transaction_draft')!;
    const args = Object.fromEntries(Object.keys(definition.parameters.properties as object).map(key => [key, null]));
    const result = await ToolExecutorService.executeTool('update_transaction_draft', { ...args, amount: 45 }, context);
    expect(result.data.ok).toBe(true);
    const revised = await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: old.id } });
    expect(revised.payload).toMatchObject({ amount: 45, fromAccountId: other.id, notes: 'Preservar observacao',
      dueDate: '2026-10-10', effectiveDate: '2026-09-20' });
    await expect(ToolExecutorService.executeTool('confirm_pending_action', { pendingActionId: old.id }, context)).rejects.toThrow('botao Confirmar');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
  });

  it('rejeita revisao antiga e contexto de outra sessao sem gravar lancamentos', async () => {
    const decision = await createDecisionDraft();
    const changed = await prisma.assistantPendingAction.update({
      where: { id: decision.pendingActionId },
      data: { updatedAt: new Date(decision.expectedUpdatedAt.getTime() + 1000) }
    });
    await expect(PendingActionService.confirmTransactionDraft(decision)).rejects.toThrow();
    await expect(PendingActionService.cancelPendingAction(decision)).rejects.toThrow();
    await expect(PendingActionService.confirmTransactionDraft({ ...decision,
      expectedUpdatedAt: changed.updatedAt, sessionId: decision.sessionId + 1
    })).rejects.toThrow();
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    expect((await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: decision.pendingActionId } })).status).toBe('PENDING');
  });

  it('desfaz a confirmacao se a gravacao financeira falhar e permite tentar novamente', async () => {
    const decision = await createDecisionDraft();
    const create = jest.spyOn(FinancialTransactionService, 'createTransaction').mockRejectedValueOnce(new Error('simulated failure'));
    await expect(PendingActionService.confirmTransactionDraft(decision)).rejects.toThrow('simulated failure');
    expect((await prisma.assistantPendingAction.findUniqueOrThrow({ where: { id: decision.pendingActionId } })).status).toBe('PENDING');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    create.mockRestore();
    await expect(PendingActionService.confirmTransactionDraft(decision)).resolves.toMatchObject({ pendingAction: { status: 'CONFIRMED' } });
  });

  it('cancelar pelo botao impede uma confirmacao posterior', async () => {
    const decision = await createDecisionDraft();
    await expect(PendingActionService.cancelPendingAction(decision)).resolves.toMatchObject({ status: 'CANCELED' });
    await expect(PendingActionService.confirmTransactionDraft(decision)).rejects.toThrow();
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
  });

  it('bloqueia criacao de sessao sem autenticacao e sem cabecalho de app', async () => {
    const withoutAuth = await request(app).post('/api/assistant/sessions').send({});
    expect(withoutAuth.status).toBe(401);

    const withoutAppHeader = await request(app)
      .post('/api/assistant/sessions')
      .set({
        Authorization: `Bearer ${token}`,
        'X-Company-Id': String(companyId)
      })
      .send({});

    expect(withoutAppHeader.status).toBe(400);
    expect(withoutAppHeader.body.error).toContain('X-App-Key');
  });

  it('cria draft via SSE, persiste trace e confirma a transacao', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_1',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_1',
                arguments: JSON.stringify({
                  description: 'Posto Shell',
                  amount: 120.5,
                  type: 'EXPENSE',
                  date: '2026-06-03',
                  accountHint: 'Nubank',
                  categoryHint: 'Combustivel',
                  status: 'COMPLETED'
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_2',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Preparei o rascunho de combustivel. Revise e confirme.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});

    expect(sessionResponse.status).toBe(201);
    const sessionId = Number(sessionResponse.body.sessionId);

    const streamResponse = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'gastei 120,50 no posto shell hoje no nubank'
      });

    expect(streamResponse.status).toBe(200);

    const events = parseSse(streamResponse.text);
    expect(events.map((event) => event.event)).toEqual([
      'turn.started',
      'message.delta',
      'message.delta',
      'message.completed',
      'pending_action.created',
      'turn.completed'
    ]);

    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.mode).toBe('OPERATOR');
    expect(completedEvent?.data.response.pendingAction.summary.description).toBe('Posto Shell');
    expect(completedEvent?.data.response.pendingAction.summary.category.name).toBe('Combustivel');

    const pendingActionId = Number(completedEvent?.data.response.pendingAction.id);
    const pendingAction = await prisma.assistantPendingAction.findUnique({
      where: { id: pendingActionId }
    });
    expect(pendingAction?.status).toBe('PENDING');

    const toolTrace = await prisma.assistantToolTrace.findFirst({
      where: { companyId },
      orderBy: { id: 'desc' }
    });
    expect(toolTrace?.toolName).toBe('create_transaction_draft');
    expect(toolTrace?.status).toBe('success');

    const confirmResponse = await request(app)
      .post(`/api/assistant/pending-actions/${pendingActionId}/confirm`)
      .set(authHeaders(token, companyId))
      .send({});

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.pendingAction.status).toBe('CONFIRMED');

    const storedTransactions = await prisma.financialTransaction.findMany({
      where: { companyId }
    });
    expect(storedTransactions).toHaveLength(1);
    expect(storedTransactions[0].description).toBe('Posto Shell');
    expect(Number(storedTransactions[0].amount)).toBe(120.5);
    expect(storedTransactions[0].dueDate).not.toBeNull();
    expect(storedTransactions[0].effectiveDate).not.toBeNull();
    expect(storedTransactions[0].dueDate?.toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(storedTransactions[0].effectiveDate?.toISOString().slice(0, 10)).toBe('2026-06-03');
  });

  it('confirma rascunho por linguagem natural na mesma sessao', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_a1',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_a1',
                arguments: JSON.stringify({
                  description: 'Barba e cabelo Daniel',
                  amount: 80,
                  type: 'EXPENSE',
                  date: '2026-06-05',
                  accountHint: 'Nubank',
                  categoryHint: 'Combustivel',
                  status: 'COMPLETED'
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_a2',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Rascunho criado. Confirme se estiver correto.'
            })
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_a3',
            output: [
              {
                type: 'function_call',
                name: 'confirm_pending_action',
                call_id: 'call_a2',
                arguments: JSON.stringify({
                  pendingActionId: null
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_a4',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Lancamento confirmado com sucesso.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});

    const sessionId = Number(sessionResponse.body.sessionId);

    const firstStream = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'gastei 80 com barba e cabelo hoje no nubank'
      });

    expect(firstStream.status).toBe(200);

    const secondStream = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'confirmado'
      });

    expect(secondStream.status).toBe(200);

    const events = parseSse(secondStream.text);
    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.message).toContain('confirmado');
    expect(completedEvent?.data.response.pendingAction.status).toBe('CONFIRMED');
    expect(completedEvent?.data.response.actions).toEqual([]);

    const storedTransactions = await prisma.financialTransaction.findMany({
      where: { companyId }
    });
    expect(storedTransactions).toHaveLength(1);

    const latestPendingAction = await prisma.assistantPendingAction.findFirst({
      where: { companyId },
      orderBy: { id: 'desc' }
    });
    expect(latestPendingAction?.status).toBe('CONFIRMED');
  });

  it('permite buscas intermediarias e ainda cria o rascunho no mesmo turno', async () => {
    const checkingAccount = await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco',
        type: 'CHECKING',
        balance: 500
      }
    });

    await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco Visa',
        type: 'CREDIT_CARD',
        bankName: 'Bradesco',
        creditLimit: 3000,
        allowNegativeBalance: true
      }
    });

    const clothingCategory = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Vestuário',
        type: 'EXPENSE',
        color: '#6366F1',
        icon: 'shirt'
      }
    });

    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_b1',
            output: [
              {
                type: 'function_call',
                name: 'search_accounts',
                call_id: 'call_b1',
                arguments: JSON.stringify({
                  query: 'Bradesco pix',
                  type: null,
                  limit: 5
                })
              },
              {
                type: 'function_call',
                name: 'search_categories',
                call_id: 'call_b2',
                arguments: JSON.stringify({
                  query: 'vestuario roupas aniversario',
                  type: 'EXPENSE',
                  limit: 5
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_b2',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_b3',
                arguments: JSON.stringify({
                  description: 'Roupas aniversario do Fabio',
                  amount: 345,
                  type: 'EXPENSE',
                  date: null,
                  status: null,
                  accountHint: 'Bradesco pix',
                  categoryId: clothingCategory.id
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_b3',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Preparei o rascunho. Revise e confirme.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});
    const sessionId = Number(sessionResponse.body.sessionId);

    const streamResponse = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'gastei 345 reais em roupas para o aniversario do Fabio na conta do Bradesco e no pix'
      });

    expect(streamResponse.status).toBe(200);
    const events = parseSse(streamResponse.text);
    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.pendingAction).toBeTruthy();
    expect(completedEvent?.data.response.pendingAction.summary.status).toBe('COMPLETED');
    expect(completedEvent?.data.response.pendingAction.summary.date).toBe(getTodayDateString());
    expect(completedEvent?.data.response.pendingAction.summary.dueDate).toBe(getTodayDateString());
    expect(completedEvent?.data.response.pendingAction.summary.effectiveDate).toBe(
      getTodayDateString()
    );
    expect(completedEvent?.data.response.pendingAction.summary.fromAccount.name).toBe(
      checkingAccount.name
    );
    expect(completedEvent?.data.response.pendingAction.summary.category.name).toBe(
      clothingCategory.name
    );

    const traces = await prisma.assistantToolTrace.findMany({
      where: { companyId, turnId: completedEvent?.data.response.assistantTurnId },
      orderBy: { id: 'asc' }
    });
    expect(traces.map((trace) => trace.toolName)).toEqual([
      'search_accounts',
      'search_categories',
      'create_transaction_draft'
    ]);
  });

  it('resolve vestuario por conceito quando a dica vier como tennis', async () => {
    await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco',
        type: 'CHECKING',
        balance: 500
      }
    });

    const clothingCategory = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Vestuário',
        type: 'EXPENSE',
        color: '#6366F1',
        icon: 'shirt'
      }
    });

    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_c1',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_c1',
                arguments: JSON.stringify({
                  description: 'Tennis no Shopping Catuai',
                  amount: 90,
                  type: 'EXPENSE',
                  date: null,
                  status: 'COMPLETED',
                  fromAccountHint: 'Bradesco',
                  categoryHint: 'tennis',
                  notes: 'Pago via Pix'
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_c2',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Preparei o rascunho. Revise e confirme.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});
    const sessionId = Number(sessionResponse.body.sessionId);

    const streamResponse = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: '90 reais tennis no shopping catuai conta bradesco no pix'
      });

    expect(streamResponse.status).toBe(200);
    const events = parseSse(streamResponse.text);
    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.pendingAction.summary.category.name).toBe(
      clothingCategory.name
    );
  });

  it('prefere conta de disponibilidade quando banco e cartao tem nomes parecidos sem mencao explicita de credito', async () => {
    const checkingAccount = await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco',
        type: 'CHECKING',
        balance: 500
      }
    });

    await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco Visa',
        type: 'CREDIT_CARD',
        bankName: 'Bradesco',
        creditLimit: 3000,
        allowNegativeBalance: true
      }
    });

    const clothingCategory = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'VestuÃ¡rio',
        type: 'EXPENSE',
        color: '#6366F1',
        icon: 'shirt'
      }
    });

    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_pref_1',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_pref_1',
                arguments: JSON.stringify({
                  description: 'Camisa social',
                  amount: 120,
                  type: 'EXPENSE',
                  date: null,
                  status: null,
                  fromAccountHint: 'Bradesco',
                  categoryId: clothingCategory.id
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_pref_2',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Preparei o rascunho. Revise e confirme.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});
    const sessionId = Number(sessionResponse.body.sessionId);

    const streamResponse = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: '120 reais de camisa social na conta Bradesco'
      });

    expect(streamResponse.status).toBe(200);
    const events = parseSse(streamResponse.text);
    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.pendingAction.summary.fromAccount.name).toBe(
      checkingAccount.name
    );
  });

  it('prefere subcategoria especifica de alimentacao para life burger', async () => {
    await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Bradesco',
        type: 'CHECKING',
        balance: 500
      }
    });

    const foodCategory = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Alimentação',
        type: 'EXPENSE',
        color: '#64b4f2',
        icon: 'utensilsCrossed'
      }
    });

    const snacksCategory = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Lanches / Sorvetes',
        type: 'EXPENSE',
        color: '#f97316',
        icon: 'iceCreamCone',
        parentId: foodCategory.id
      }
    });

    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_d1',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_d1',
                arguments: JSON.stringify({
                  description: 'Life Burger',
                  amount: 55,
                  type: 'EXPENSE',
                  date: null,
                  status: 'COMPLETED',
                  fromAccountHint: 'Bradesco',
                  categoryHint: 'life burger',
                  notes: 'Pago via Pix'
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_d2',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Preparei o rascunho. Revise e confirme.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});
    const sessionId = Number(sessionResponse.body.sessionId);

    const streamResponse = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: '55 reais no Life Burger conta Bradesco no pix'
      });

    expect(streamResponse.status).toBe(200);
    const events = parseSse(streamResponse.text);
    const completedEvent = events.find((event) => event.event === 'message.completed');
    expect(completedEvent?.data.response.pendingAction.summary.category.name).toBe(
      snacksCategory.name
    );
  });

  it('permite cancelar o rascunho e preserva a sessao quando a IA falha', async () => {
    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_10',
            output: [
              {
                type: 'function_call',
                name: 'create_transaction_draft',
                call_id: 'call_10',
                arguments: JSON.stringify({
                  description: 'Salario',
                  amount: 3500,
                  type: 'INCOME',
                  date: '2026-06-03',
                  accountHint: 'Nubank',
                  categoryHint: 'Receitas',
                  status: 'COMPLETED'
                })
              }
            ]
          })
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_11',
            output_text: JSON.stringify({
              mode: 'OPERATOR',
              message: 'Rascunho de receita montado. Confirme se estiver correto.'
            })
          })
      } as any);

    const sessionResponse = await request(app)
      .post('/api/assistant/sessions')
      .set(authHeaders(token, companyId))
      .send({});
    const sessionId = Number(sessionResponse.body.sessionId);

    const firstStream = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'recebi 3500 de salario hoje'
      });

    expect(firstStream.status).toBe(200);
    const createdPendingAction = await prisma.assistantPendingAction.findFirst({
      where: { companyId, sessionId },
      orderBy: { id: 'desc' }
    });
    expect(createdPendingAction).not.toBeNull();
    const createdPendingActionId = createdPendingAction!.id;

    const cancelResponse = await request(app)
      .post(`/api/assistant/pending-actions/${createdPendingActionId}/cancel`)
      .set(authHeaders(token, companyId))
      .send({});

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.pendingAction.status).toBe('CANCELED');

    jest.restoreAllMocks();
    jest.spyOn(global as any, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'upstream failure' } })
    } as any);

    const failedStream = await request(app)
      .post(`/api/assistant/sessions/${sessionId}/messages/stream`)
      .set(authHeaders(token, companyId))
      .send({
        message: 'gastei 40 de gasolina'
      });

    expect(failedStream.status).toBe(200);
    const failedEvents = parseSse(failedStream.text);
    expect(failedEvents.at(-1)?.event).toBe('turn.error');

    const historyResponse = await request(app)
      .get(`/api/assistant/sessions/${sessionId}/history`)
      .set(authHeaders(token, companyId));

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.sessionId).toBe(sessionId);
    expect(historyResponse.body.messages.length).toBeGreaterThanOrEqual(2);
  });
});
