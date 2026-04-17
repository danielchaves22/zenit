import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Process domain routes', () => {
  let uniqueSuffix: string;
  let companyAId: number;
  let companyBId: number;
  let adminUserId: number;
  let superUserId: number;
  let regularUserId: number;
  let outsiderUserId: number;

  let adminToken: string;
  let superToken: string;
  let userToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    uniqueSuffix = Date.now().toString();
    const baseCode = Number(uniqueSuffix.slice(-6));
    const passwordHash = await bcrypt.hash('Senha123', 10);

    const companyA = await prisma.company.create({
      data: { name: `Process Company A ${uniqueSuffix}`, code: baseCode }
    });
    const companyB = await prisma.company.create({
      data: { name: `Process Company B ${uniqueSuffix}`, code: baseCode + 1 }
    });

    companyAId = companyA.id;
    companyBId = companyB.id;

    const admin = await prisma.user.create({
      data: {
        email: `admin.process.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Admin Process',
        role: 'ADMIN'
      }
    });

    const superuser = await prisma.user.create({
      data: {
        email: `super.process.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Super Process',
        role: 'SUPERUSER'
      }
    });

    const user = await prisma.user.create({
      data: {
        email: `user.process.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'User Process',
        role: 'USER'
      }
    });

    const outsider = await prisma.user.create({
      data: {
        email: `outsider.process.${uniqueSuffix}@zenit.com`,
        password: passwordHash,
        name: 'Outsider Process',
        role: 'USER'
      }
    });

    adminUserId = admin.id;
    superUserId = superuser.id;
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
      .send({ email: `admin.process.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    adminToken = adminLogin.body.token;

    const superLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `super.process.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    superToken = superLogin.body.token;

    const userLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `user.process.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
    userToken = userLogin.body.token;

    const outsiderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: `outsider.process.${uniqueSuffix}@zenit.com`, password: 'Senha123' });
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
    await prisma.processTag.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.inboundImport.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
    await prisma.userCompany.deleteMany({
      where: { userId: { in: [adminUserId, superUserId, regularUserId, outsiderUserId] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, superUserId, regularUserId, outsiderUserId] } }
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } }
    });
    await prisma.$disconnect();
  });

  it('permite criar processo manual em qualquer status', async () => {
    const statuses = ['SOLICITACAO', 'INICIAL', 'CALCULO'] as const;

    for (const status of statuses) {
      const response = await request(app)
        .post('/api/processes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', String(companyAId))
        .send({ status, originType: 'MANUAL' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe(status);
    }
  });

  it('permite criacao por ADMIN, SUPERUSER e USER na empresa ativa', async () => {
    const adminRes = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'SOLICITACAO' });

    const superRes = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'INICIAL' });

    const userRes = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'CALCULO' });

    expect(adminRes.status).toBe(201);
    expect(superRes.status).toBe(201);
    expect(userRes.status).toBe(201);
  });

  it('registra historico ao alterar status em qualquer direcao', async () => {
    const created = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'SOLICITACAO' });

    const processId = created.body.id;

    const toCalculo = await request(app)
      .patch(`/api/processes/${processId}/status`)
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'CALCULO', reason: 'Avanco para calculo' });

    const backToInicial = await request(app)
      .patch(`/api/processes/${processId}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'INICIAL', reason: 'Retorno para revisao' });

    const history = await request(app)
      .get(`/api/processes/${processId}/status-history`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    expect(toCalculo.status).toBe(200);
    expect(backToInicial.status).toBe(200);
    expect(history.status).toBe(200);
    expect(history.body.length).toBeGreaterThanOrEqual(3);
    expect(history.body[0].toStatus).toBe('INICIAL');
  });

  it('garante isolamento por tenant', async () => {
    const created = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'SOLICITACAO' });

    const outsiderGet = await request(app)
      .get(`/api/processes/${created.body.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Company-Id', String(companyBId));

    expect(created.status).toBe(201);
    expect(outsiderGet.status).toBe(404);
  });

  it('realiza soft delete removendo da listagem e preservando historico', async () => {
    const created = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'SOLICITACAO' });

    const processId = created.body.id;

    await request(app)
      .patch(`/api/processes/${processId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'INICIAL' });

    const deleteRes = await request(app)
      .delete(`/api/processes/${processId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const listRes = await request(app)
      .get('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const processInDb = await prisma.process.findUnique({ where: { id: processId } });
    const historyCount = await prisma.processStatusHistory.count({ where: { processId } });

    expect(deleteRes.status).toBe(204);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((item: any) => item.id === processId)).toBe(false);
    expect(processInDb?.deletedAt).not.toBeNull();
    expect(historyCount).toBeGreaterThanOrEqual(2);
  });

  it('impede tag duplicada por empresa e aplica filtros ANY/ALL por tags', async () => {
    const tagName = `email-${uniqueSuffix}`;
    const tagRes1 = await request(app)
      .post('/api/process-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ name: tagName });

    const tagRes2 = await request(app)
      .post('/api/process-tags')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ name: tagName });

    const secondTag = await request(app)
      .post('/api/process-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ name: `urgente-${uniqueSuffix}` });

    const createdProcess = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        status: 'SOLICITACAO',
        tagIds: [tagRes1.body.id, secondTag.body.id]
      });

    const createdProcessOnlyOneTag = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        status: 'SOLICITACAO',
        tagIds: [tagRes1.body.id]
      });

    const filteredAny = await request(app)
      .get('/api/processes')
      .query({ tagIds: `${tagRes1.body.id},${secondTag.body.id}`, tagMatchMode: 'ANY' })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const filteredAll = await request(app)
      .get('/api/processes')
      .query({ tagIds: `${tagRes1.body.id},${secondTag.body.id}`, tagMatchMode: 'ALL' })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    const filteredNoTagWithAll = await request(app)
      .get('/api/processes')
      .query({ tagMatchMode: 'ALL' })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    expect(tagRes1.status).toBe(201);
    expect(tagRes2.status).toBe(409);
    expect(createdProcess.status).toBe(201);
    expect(createdProcessOnlyOneTag.status).toBe(201);
    expect(filteredAny.status).toBe(200);
    expect(filteredAll.status).toBe(200);
    expect(filteredNoTagWithAll.status).toBe(200);
    expect(filteredAny.body.data.some((item: any) => item.id === createdProcess.body.id)).toBe(true);
    expect(filteredAny.body.data.some((item: any) => item.id === createdProcessOnlyOneTag.body.id)).toBe(true);
    expect(filteredAll.body.data.some((item: any) => item.id === createdProcess.body.id)).toBe(true);
    expect(filteredAll.body.data.some((item: any) => item.id === createdProcessOnlyOneTag.body.id)).toBe(false);
    expect(filteredNoTagWithAll.body.data.some((item: any) => item.id === createdProcess.body.id)).toBe(true);
    expect(filteredNoTagWithAll.body.data.some((item: any) => item.id === createdProcessOnlyOneTag.body.id)).toBe(true);
  });

  it('lista tags com search e limit', async () => {
    const prefix = `scope-${uniqueSuffix}`;

    const createA = await request(app)
      .post('/api/process-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ name: `${prefix}-a` });

    const createB = await request(app)
      .post('/api/process-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ name: `${prefix}-b` });

    const listLimited = await request(app)
      .get('/api/process-tags')
      .query({ search: prefix, limit: 1 })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId));

    expect(createA.status).toBe(201);
    expect(createB.status).toBe(201);
    expect(listLimited.status).toBe(200);
    expect(Array.isArray(listLimited.body)).toBe(true);
    expect(listLimited.body.length).toBe(1);
    expect(String(listLimited.body[0].name)).toContain(prefix);
  });

  it('bloqueia deduplicidade de importacao e aceita processo com sourceImportId opcional', async () => {
    const externalId = `msg-${uniqueSuffix}`;

    const importRes = await request(app)
      .post('/api/inbound-imports')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        sourceType: 'EMAIL',
        externalId,
        payloadMetadata: { subject: 'Inicial trabalhista' }
      });

    const duplicateImportRes = await request(app)
      .post('/api/inbound-imports')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        sourceType: 'EMAIL',
        externalId
      });

    const processWithoutImport = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({ status: 'INICIAL', originType: 'MANUAL' });

    const processWithImport = await request(app)
      .post('/api/processes')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Company-Id', String(companyAId))
      .send({
        status: 'SOLICITACAO',
        originType: 'IMPORT',
        sourceImportId: importRes.body.id
      });

    expect(importRes.status).toBe(201);
    expect(duplicateImportRes.status).toBe(409);
    expect(processWithoutImport.status).toBe(201);
    expect(processWithImport.status).toBe(201);
    expect(processWithImport.body.sourceImportId).toBe(importRes.body.id);
  });
});
