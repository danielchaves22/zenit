import request from 'supertest';
import app from '../../src/app';
import { AppKey, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import AppAccessService from '../../src/services/app-access.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-admin';
const authHeaders = (token: string, companyId: number) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': companyId.toString(),
  [APP_KEY_HEADER]: APP_KEY_VALUE
});

describe('Company routes (RBAC)', () => {
  const uniqueSuffix = Date.now().toString();
  let adminToken: string;
  let superToken: string;
  let userToken: string;
  let equinoxId: number;
  let otherCompanyId: number;
  const createdCompanyIds: number[] = [];

  beforeAll(async () => {
    const eq = await prisma.company.create({
      data: { name: `Equinox ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) }
    });
    const ot = await prisma.company.create({
      data: { name: `Outra ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 1 }
    });
    equinoxId = eq.id;
    otherCompanyId = ot.id;

    const hash = await bcrypt.hash('Senha123', 10);
    const ad = await prisma.user.create({
      data: {
        email: `admin.${uniqueSuffix}@e.com`,
        password: hash,
        name: 'Adm',
        role: 'ADMIN'
      }
    });
    const su = await prisma.user.create({
      data: {
        email: `super.${uniqueSuffix}@o.com`,
        password: hash,
        name: 'Sup',
        role: 'SUPERUSER'
      }
    });
    const us = await prisma.user.create({
      data: {
        email: `user.${uniqueSuffix}@o.com`,
        password: hash,
        name: 'User',
        role: 'USER'
      }
    });

    await prisma.userCompany.create({ data: { userId: ad.id, companyId: eq.id, isDefault: true, role: 'ADMIN' } });
    await prisma.userCompany.create({ data: { userId: su.id, companyId: ot.id, isDefault: true, role: 'SUPERUSER' } });
    await prisma.userCompany.create({ data: { userId: us.id, companyId: ot.id, isDefault: true, role: 'USER' } });

    await AppAccessService.setCompanyEntitlements(eq.id, [
      { appKey: AppKey.ZENIT_ADMIN, enabled: true }
    ]);
    await AppAccessService.setCompanyEntitlements(ot.id, [
      { appKey: AppKey.ZENIT_ADMIN, enabled: true }
    ]);
    await AppAccessService.setUserGrants(ad.id, eq.id, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);
    await AppAccessService.setUserGrants(su.id, ot.id, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);
    await AppAccessService.setUserGrants(us.id, ot.id, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);

    const r1 = await request(app)
      .post('/api/auth/login')
      .send({ email: `admin.${uniqueSuffix}@e.com`, password: 'Senha123' });
    adminToken = r1.body.token;
    const r2 = await request(app)
      .post('/api/auth/login')
      .send({ email: `super.${uniqueSuffix}@o.com`, password: 'Senha123' });
    superToken = r2.body.token;
    const r3 = await request(app)
      .post('/api/auth/login')
      .send({ email: `user.${uniqueSuffix}@o.com`, password: 'Senha123' });
    userToken = r3.body.token;
  });

  afterAll(async () => {
    const companyIds = [equinoxId, otherCompanyId, ...createdCompanyIds].filter(Boolean);

    await prisma.userAppGrant.deleteMany({
      where: { companyId: { in: companyIds } }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: { companyId: { in: companyIds } }
    });
    await prisma.userCompany.deleteMany({
      where: { companyId: { in: companyIds } }
    });
    await prisma.user.deleteMany({
      where: { email: { contains: uniqueSuffix } }
    });
    await prisma.company.deleteMany({
      where: { id: { in: companyIds } }
    });
    await prisma.$disconnect();
  });

  describe('POST /api/companies', () => {
    it('ADMIN pode criar empresa', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set(authHeaders(adminToken, equinoxId))
        .send({ name: `Nova ${uniqueSuffix}`, address: 'Rua X' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      createdCompanyIds.push(res.body.id);
    });

    it('SUPERUSER nao pode criar empresa', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set(authHeaders(superToken, otherCompanyId))
        .send({ name: `Err ${uniqueSuffix}`, address: 'Rua Y' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/companies', () => {
    it('ADMIN ve todas as empresas', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set(authHeaders(adminToken, equinoxId));
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('SUPERUSER lista apenas empresas vinculadas', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(otherCompanyId);
    });

    it('USER nao pode listar', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set(authHeaders(userToken, otherCompanyId));
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/companies/:id', () => {
    it('ADMIN pode editar empresa', async () => {
      const res = await request(app)
        .put(`/api/companies/${equinoxId}`)
        .set(authHeaders(adminToken, equinoxId))
        .send({ name: `EquinoxX ${uniqueSuffix}` });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`EquinoxX ${uniqueSuffix}`);
    });

    it('SUPERUSER nao pode editar', async () => {
      const res = await request(app)
        .put(`/api/companies/${otherCompanyId}`)
        .set(authHeaders(superToken, otherCompanyId))
        .send({ name: `Teste ${uniqueSuffix}` });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('ADMIN pode excluir', async () => {
      const nova = await prisma.company.create({
        data: { name: `Temp ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 99 }
      });
      const res = await request(app)
        .delete(`/api/companies/${nova.id}`)
        .set(authHeaders(adminToken, equinoxId));
      expect(res.status).toBe(204);
    });

    it('USER nao pode excluir', async () => {
      const res = await request(app)
        .delete(`/api/companies/${equinoxId}`)
        .set(authHeaders(userToken, otherCompanyId));
      expect(res.status).toBe(403);
    });
  });
});
