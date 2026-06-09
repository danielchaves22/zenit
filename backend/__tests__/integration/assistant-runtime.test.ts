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
