process.env.INTEGRATION_SECRETS_MASTER_KEY =
  process.env.INTEGRATION_SECRETS_MASTER_KEY ||
  'integration-test-master-key-32-bytes-minimum';
process.env.GMAIL_OAUTH_CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID || 'test-client-id';
process.env.GMAIL_OAUTH_CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET || 'test-client-secret';
process.env.GMAIL_OAUTH_REDIRECT_URI =
  process.env.GMAIL_OAUTH_REDIRECT_URI ||
  'http://localhost:3000/api/integrations/gmail/oauth/callback';

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../src/app').default;
const { PrismaClient } = require('@prisma/client');
const GmailClientService = require('../../src/services/gmail-client.service').default;
const LegalEmailExtractionService = require('../../src/services/legal-email-extraction.service').default;
const EmailIngestionService = require('../../src/services/email-ingestion.service').default;
const { encryptSecret } = require('../../src/utils/secret-crypto');

const prisma = new PrismaClient();

describe('Integrations and email ingestion', () => {
  let uniqueSuffix: string;
  let companyAId: number;
  let companyBId: number;
  let adminUserId: number;
  let superUserId: number;
  let regularUserId: number;
  let outsiderUserId: number;

  let adminToken = '';
  let superUserToken = '';
  let userToken = '';
  let outsiderToken = '';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(async () => {
    uniqueSuffix = Date.now().toString();
    const baseCode = Number(uniqueSuffix.slice(-6));
    const passwordHash = await bcrypt.hash('Senha123', 10);

    const companyA = await prisma.company.create({
      data: { name: `Integrations Company A ${uniqueSuffix}`, code: baseCode }
    });
    const companyB = await prisma.company.create({
      data: { name: `Integrations Company B ${uniqueSuffix}`, code: baseCode + 1 }
    });

    companyAId = companyA.id;
    companyBId = companyB.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin.integrations.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Admin Integrations',
        role: 'ADMIN'
      }
    });

    const superUser = await prisma.user.create({
      data: {
        email: `superuser.integrations.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Superuser Integrations',
        role: 'SUPERUSER'
      }
    });

    const user = await prisma.user.create({
      data: {
        email: `user.integrations.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'User Integrations',
        role: 'USER'
      }
    });

    const outsider = await prisma.user.create({
      data: {
        email: `outsider.integrations.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Outsider Integrations',
        role: 'USER'
      }
    });

    adminUserId = admin.id;
    superUserId = superUser.id;
    regularUserId = user.id;
    outsiderUserId = outsider.id;

    await prisma.userCompany.createMany({
      data: [
        { userId: adminUserId, companyId: companyAId, role: 'ADMIN', isDefault: true },
        { userId: superUserId, companyId: companyAId, role: 'SUPERUSER', isDefault: true },
        { userId: regularUserId, companyId: companyAId, role: 'USER', isDefault: true },
        { userId: outsiderUserId, companyId: companyBId, role: 'USER', isDefault: true }
      ]
    });

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `admin.integrations.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    adminToken = adminLogin.body.token;

    const superUserLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `superuser.integrations.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    superUserToken = superUserLogin.body.token;

    const userLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `user.integrations.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    userToken = userLogin.body.token;

    const outsiderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `outsider.integrations.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    outsiderToken = outsiderLogin.body.token;
  });

  afterAll(async () => {
    await prisma.processTagLink.deleteMany({
      where: {
        process: { companyId: { in: [companyAId, companyBId] } }
      }
    });
    await prisma.processStatusHistory.deleteMany({
      where: {
        process: { companyId: { in: [companyAId, companyBId] } }
      }
    });
    await prisma.process.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.inboundImport.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.gmailSyncState.deleteMany({
      where: {
        connection: { companyId: { in: [companyAId, companyBId] } }
      }
    });
    await prisma.gmailConnection.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.emailIngestionConfig.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.companyAiCredential.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });

    await prisma.userCompany.deleteMany({
      where: { userId: { in: [adminUserId, superUserId, regularUserId, outsiderUserId] } }
    });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, superUserId, regularUserId, outsiderUserId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });

    await prisma.$disconnect();
  });

  it('valida governanca OpenAI (tenant somente leitura e escrita via admin)', async () => {
    const statusBefore = await request(app)
      .get('/api/integrations/openai/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const tenantWriteDeniedForAdmin = await request(app)
      .put('/api/integrations/openai/byok')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ apiKey: 'sk-admin-should-be-denied-1234567890' });

    const tenantTestDeniedForAdmin = await request(app)
      .post('/api/integrations/openai/test')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({});

    const adminRouteDeniedForSuperuser = await request(app)
      .put(`/api/admin/companies/${companyAId}/openai`)
      .set('Authorization', `Bearer ${superUserToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ apiKey: 'sk-superuser-denied-1234567890' });

    const savedByAdminRoute = await request(app)
      .put(`/api/admin/companies/${companyAId}/openai`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        apiKey: 'sk-admin-valid-key-1234567890',
        model: 'gpt-4o-mini',
        promptVersion: 'v1',
        isActive: true
      });

    const statusAfter = await request(app)
      .get('/api/integrations/openai/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const adminStatusAfter = await request(app)
      .get(`/api/admin/companies/${companyAId}/openai`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const fetchSpy = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] })
    } as any);

    const testedByAdminRoute = await request(app)
      .post(`/api/admin/companies/${companyAId}/openai/test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({});

    expect(statusBefore.status).toBe(200);
    expect(statusBefore.body.configured).toBe(false);
    expect(statusBefore.body.credential).toBeUndefined();

    expect(tenantWriteDeniedForAdmin.status).toBe(403);
    expect(tenantTestDeniedForAdmin.status).toBe(403);

    expect(adminRouteDeniedForSuperuser.status).toBe(403);

    expect(savedByAdminRoute.status).toBe(200);
    expect(savedByAdminRoute.body.provider).toBe('OPENAI');

    expect(statusAfter.status).toBe(200);
    expect(statusAfter.body.configured).toBe(true);
    expect(statusAfter.body.model).toBe('gpt-4o-mini');
    expect(statusAfter.body.promptVersion).toBe('v1');
    expect(statusAfter.body.isActive).toBe(true);
    expect(statusAfter.body.credential).toBeUndefined();

    expect(adminStatusAfter.status).toBe(200);
    expect(adminStatusAfter.body.configured).toBe(true);
    expect(adminStatusAfter.body.credential?.model).toBe('gpt-4o-mini');

    expect(fetchSpy).toHaveBeenCalled();
    expect(testedByAdminRoute.status).toBe(200);
    expect(testedByAdminRoute.body.ok).toBe(true);
  });

  it('valida endpoints Gmail com permissao estrita de SUPERUSER e isolamento por tenant', async () => {
    const status = await request(app)
      .get('/api/integrations/gmail/status')
      .set('Authorization', `Bearer ${superUserToken}`)
      .set('X-Company-Id', String(companyAId));

    const oauthStart = await request(app)
      .post('/api/integrations/gmail/oauth/start')
      .set('Authorization', `Bearer ${superUserToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({});

    const oauthDeniedForAdmin = await request(app)
      .post('/api/integrations/gmail/oauth/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({});

    const configDeniedForAdmin = await request(app)
      .put('/api/integrations/gmail/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ enabled: true });

    const configDeniedForUser = await request(app)
      .put('/api/integrations/gmail/config')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ enabled: true });

    const configSaved = await request(app)
      .put('/api/integrations/gmail/config')
      .set('Authorization', `Bearer ${superUserToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        enabled: true,
        subjectRequiredText: 'Inicial Trabalhista',
        lookbackDays: 4,
        pollingIntervalMinutes: 6,
        reconciliationIntervalMinutes: 45,
        maxEmailsPerRun: 25
      });

    const outsiderStatus = await request(app)
      .get('/api/integrations/gmail/status')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Company-Id', String(companyAId));

    expect(status.status).toBe(200);
    expect(status.body.connected).toBe(false);

    expect(oauthStart.status).toBe(200);
    expect(String(oauthStart.body.authUrl || '')).toContain('https://accounts.google.com/o/oauth2');
    expect(typeof oauthStart.body.state).toBe('string');

    expect(oauthDeniedForAdmin.status).toBe(403);
    expect(configDeniedForAdmin.status).toBe(403);
    expect(configDeniedForUser.status).toBe(403);

    expect(configSaved.status).toBe(200);
    expect(configSaved.body.enabled).toBe(true);
    expect(configSaved.body.lookbackDays).toBe(4);

    expect(outsiderStatus.status).toBe(403);
  });

  it('garante idempotencia de ingestao por messageId e por threadId', async () => {
    const refreshTokenEncrypted = encryptSecret('refresh-token-integration-test');

    const connection = await prisma.gmailConnection.create({
      data: {
        companyId: companyAId,
        googleEmail: `mailbox.${uniqueSuffix}@cliente.com`,
        refreshTokenCiphertext: refreshTokenEncrypted.ciphertext,
        refreshTokenIv: refreshTokenEncrypted.iv,
        refreshTokenTag: refreshTokenEncrypted.tag,
        status: 'ACTIVE'
      }
    });

    await prisma.emailIngestionConfig.upsert({
      where: { companyId: companyAId },
      update: {
        enabled: true,
        subjectRequiredText: 'Inicial Trabalhista',
        lookbackDays: 3,
        pollingIntervalMinutes: 5,
        reconciliationIntervalMinutes: 60,
        maxEmailsPerRun: 10
      },
      create: {
        companyId: companyAId,
        enabled: true,
        subjectRequiredText: 'Inicial Trabalhista',
        lookbackDays: 3,
        pollingIntervalMinutes: 5,
        reconciliationIntervalMinutes: 60,
        maxEmailsPerRun: 10
      }
    });

    const toBase64Url = (raw: string) =>
      Buffer.from(raw, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    const makeMessage = (id: string, threadId: string) => ({
      id,
      threadId,
      internalDate: String(Date.now()),
      snippet: 'Solicitacao de inicial trabalhista',
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'Subject', value: 'Inicial Trabalhista - Cliente XPTO' },
          { name: 'From', value: 'advogado.externo@cliente.com' }
        ],
        body: {
          data: toBase64Url('Solicito cálculo da inicial. Reclamante: JOAO TESTE')
        }
      }
    });

    jest.spyOn(GmailClientService, 'refreshAccessToken').mockResolvedValue({
      access_token: 'gmail-access-token',
      expires_in: 3600
    });

    jest.spyOn(GmailClientService, 'listMessages').mockResolvedValue({
      messages: [
        { id: 'gmail-message-1', threadId: 'gmail-thread-1' },
        { id: 'gmail-message-2', threadId: 'gmail-thread-1' }
      ]
    });

    jest.spyOn(GmailClientService, 'getMessage').mockImplementation(async (...args: any[]) => {
      const messageId = String(args[1] || '');
      if (messageId === 'gmail-message-1') return makeMessage('gmail-message-1', 'gmail-thread-1');
      return makeMessage('gmail-message-2', 'gmail-thread-1');
    });

    jest.spyOn(LegalEmailExtractionService, 'extract').mockResolvedValue({
      advogado: 'Advogado Externo',
      reclamante: 'JOAO TESTE'
    });

    const firstRun = await EmailIngestionService.syncCompany(companyAId, 'manual', true);

    const processesAfterFirstRun = await prisma.process.findMany({
      where: {
        companyId: companyAId,
        sourceProvider: 'GMAIL',
        sourceThreadId: 'gmail-thread-1',
        deletedAt: null
      }
    });

    const importsAfterFirstRun = await prisma.inboundImport.findMany({
      where: {
        companyId: companyAId,
        sourceType: 'EMAIL',
        externalId: { in: ['gmail-message-1', 'gmail-message-2'] }
      }
    });

    const secondRun = await EmailIngestionService.syncCompany(companyAId, 'manual', true);

    const processesAfterSecondRun = await prisma.process.findMany({
      where: {
        companyId: companyAId,
        sourceProvider: 'GMAIL',
        sourceThreadId: 'gmail-thread-1',
        deletedAt: null
      }
    });

    const importsAfterSecondRun = await prisma.inboundImport.findMany({
      where: {
        companyId: companyAId,
        sourceType: 'EMAIL',
        externalId: { in: ['gmail-message-1', 'gmail-message-2'] }
      }
    });

    expect(connection.id).toBeGreaterThan(0);

    expect(firstRun.createdProcesses).toBe(1);
    expect(firstRun.linkedImports).toBe(1);

    expect(processesAfterFirstRun).toHaveLength(1);
    expect(importsAfterFirstRun).toHaveLength(2);
    expect(importsAfterFirstRun.every((item: any) => item.destinationType === 'PROCESS')).toBe(true);

    expect(secondRun.createdProcesses).toBe(0);
    expect(secondRun.alreadyLinked).toBe(2);

    expect(processesAfterSecondRun).toHaveLength(1);
    expect(importsAfterSecondRun).toHaveLength(2);

    const processId = processesAfterSecondRun[0].id;
    expect(importsAfterSecondRun.every((item: any) => item.destinationId === String(processId))).toBe(true);
  });
});
