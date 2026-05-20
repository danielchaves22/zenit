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

describe('User routes (CRUD & RBAC)', () => {
  const uniqueSuffix = Date.now().toString();
  let adminToken: string;
  let superToken: string;
  let userToken: string;
  let equinoxId: number;
  let otherCompanyId: number;
  let adminId: number;
  let superId: number;
  let userId: number;

  beforeAll(async () => {
    const equinox = await prisma.company.create({
      data: { name: `Equinox ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 200 }
    });
    const other = await prisma.company.create({
      data: { name: `Outra ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 201 }
    });
    equinoxId = equinox.id;
    otherCompanyId = other.id;

    const hash = await bcrypt.hash('P@ssw0rd', 10);
    const ad = await prisma.user.create({
      data: {
        email: `admin.${uniqueSuffix}@equinox.com`,
        password: hash,
        name: 'Admin',
        role: 'ADMIN'
      }
    });
    const su = await prisma.user.create({
      data: {
        email: `super.${uniqueSuffix}@outra.com`,
        password: hash,
        name: 'Super',
        role: 'SUPERUSER'
      }
    });
    const us = await prisma.user.create({
      data: {
        email: `user.${uniqueSuffix}@outra.com`,
        password: hash,
        name: 'User',
        role: 'USER'
      }
    });
    adminId = ad.id;
    superId = su.id;
    userId = us.id;

    await prisma.userCompany.create({ data: { userId: adminId, companyId: equinoxId, isDefault: true, role: 'ADMIN' } });
    await prisma.userCompany.create({ data: { userId: superId, companyId: otherCompanyId, isDefault: true, role: 'SUPERUSER' } });
    await prisma.userCompany.create({ data: { userId, companyId: otherCompanyId, isDefault: true, role: 'USER' } });

    await AppAccessService.setCompanyEntitlements(equinoxId, [
      { appKey: AppKey.ZENIT_ADMIN, enabled: true }
    ]);
    await AppAccessService.setCompanyEntitlements(otherCompanyId, [
      { appKey: AppKey.ZENIT_ADMIN, enabled: true }
    ]);
    await AppAccessService.setUserGrants(adminId, equinoxId, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);
    await AppAccessService.setUserGrants(superId, otherCompanyId, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);
    await AppAccessService.setUserGrants(userId, otherCompanyId, [
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);

    const resAd = await request(app)
      .post('/api/auth/login')
      .send({ email: `admin.${uniqueSuffix}@equinox.com`, password: 'P@ssw0rd' });
    adminToken = resAd.body.token;

    const resSu = await request(app)
      .post('/api/auth/login')
      .send({ email: `super.${uniqueSuffix}@outra.com`, password: 'P@ssw0rd' });
    superToken = resSu.body.token;

    const resUs = await request(app)
      .post('/api/auth/login')
      .send({ email: `user.${uniqueSuffix}@outra.com`, password: 'P@ssw0rd' });
    userToken = resUs.body.token;
  });

  afterAll(async () => {
    const companyIds = [equinoxId, otherCompanyId].filter(Boolean);

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

  describe('GET /api/users', () => {
    it('ADMIN ve todos os usuarios', async () => {
      const res = await request(app)
        .get('/api/users')
        .set(authHeaders(adminToken, equinoxId));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const emails = res.body.map((user: any) => user.email);
      expect(emails).toEqual(expect.arrayContaining([
        `admin.${uniqueSuffix}@equinox.com`,
        `super.${uniqueSuffix}@outra.com`,
        `user.${uniqueSuffix}@outra.com`
      ]));
    });

    it('SUPERUSER ve so usuarios da sua empresa', async () => {
      const res = await request(app)
        .get('/api/users')
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(200);
      expect(res.body.map((u: any) => u.email).sort()).toEqual(
        [`super.${uniqueSuffix}@outra.com`, `user.${uniqueSuffix}@outra.com`].sort()
      );
    });

    it('USER ve apenas seu proprio registro', async () => {
      const res = await request(app)
        .get('/api/users')
        .set(authHeaders(userToken, otherCompanyId));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe(`user.${uniqueSuffix}@outra.com`);
    });
  });

  describe('POST /api/users', () => {
    it('ADMIN pode criar SUPERUSER em qualquer empresa', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeaders(adminToken, equinoxId))
        .send({
          email: `novo.${uniqueSuffix}@outra.com`,
          password: '1234',
          name: 'Novo',
          companyId: otherCompanyId,
          newRole: 'SUPERUSER'
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('ADMIN nao pode criar USER', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeaders(adminToken, equinoxId))
        .send({
          email: `negado.${uniqueSuffix}@outra.com`,
          password: '1234',
          name: 'Negado',
          companyId: otherCompanyId,
          newRole: 'USER'
        });
      expect(res.status).toBe(403);
    });

    it('SUPERUSER nao pode criar em outra empresa', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeaders(superToken, otherCompanyId))
        .send({
          email: `x.${uniqueSuffix}@equinox.com`,
          password: '1234',
          name: 'X',
          companyId: equinoxId,
          newRole: 'USER'
        });
      expect(res.status).toBe(403);
    });

    it('SUPERUSER pode criar usuario na propria empresa usando companies', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeaders(superToken, otherCompanyId))
        .send({
          email: `supercreate.${uniqueSuffix}@outra.com`,
          password: '1234',
          name: 'Super Create',
          newRole: 'USER',
          companies: [{ companyId: otherCompanyId, role: 'USER' }]
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('USER nao pode criar usuarios', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeaders(userToken, otherCompanyId))
        .send({
          email: `y.${uniqueSuffix}@outra.com`,
          password: '1234',
          name: 'Y',
          companyId: otherCompanyId,
          newRole: 'USER'
        });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('ADMIN pode ver qualquer usuario pelo ID', async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set(authHeaders(adminToken, equinoxId));
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(`user.${uniqueSuffix}@outra.com`);
    });

    it('SUPERUSER pode ver usuarios da sua empresa', async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(200);
    });

    it('SUPERUSER nao pode ver usuarios de outra empresa', async () => {
      const res = await request(app)
        .get(`/api/users/${adminId}`)
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(403);
    });

    it('USER so pode ver seu proprio perfil', async () => {
      const resOk = await request(app)
        .get(`/api/users/${userId}`)
        .set(authHeaders(userToken, otherCompanyId));
      expect(resOk.status).toBe(200);

      const resNo = await request(app)
        .get(`/api/users/${superId}`)
        .set(authHeaders(userToken, otherCompanyId));
      expect(resNo.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('ADMIN pode editar qualquer usuario', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}`)
        .set(authHeaders(adminToken, equinoxId))
        .send({ name: 'User Edited By Admin' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('User Edited By Admin');
    });

    it('SUPERUSER pode editar usuario da propria empresa', async () => {
      const res = await request(app)
        .put(`/api/users/${superId}`)
        .set(authHeaders(superToken, otherCompanyId))
        .send({ name: 'Super Edited' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Super Edited');
    });

    it('SUPERUSER nao pode editar usuario de outra empresa', async () => {
      const res = await request(app)
        .put(`/api/users/${adminId}`)
        .set(authHeaders(superToken, otherCompanyId))
        .send({ name: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('USER pode editar apenas seu proprio perfil', async () => {
      const resOk = await request(app)
        .put(`/api/users/${userId}`)
        .set(authHeaders(userToken, otherCompanyId))
        .send({ name: 'User Self-Edited' });
      expect(resOk.status).toBe(200);
      expect(resOk.body.name).toBe('User Self-Edited');

      const resNo = await request(app)
        .put(`/api/users/${superId}`)
        .set(authHeaders(userToken, otherCompanyId))
        .send({ name: 'Attempt Fail' });
      expect(resNo.status).toBe(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('ADMIN pode excluir qualquer usuario', async () => {
      const temp = await prisma.user.create({
        data: {
          email: `todelete.${uniqueSuffix}@outra.com`,
          password: await bcrypt.hash('pass', 10),
          name: 'Temp',
          role: 'USER'
        }
      });
      await prisma.userCompany.create({
        data: { userId: temp.id, companyId: otherCompanyId, isDefault: true, role: 'USER' }
      });
      const res = await request(app)
        .delete(`/api/users/${temp.id}`)
        .set(authHeaders(adminToken, equinoxId));
      expect(res.status).toBe(204);
    });

    it('SUPERUSER pode excluir usuario da propria empresa', async () => {
      const temp2 = await prisma.user.create({
        data: {
          email: `temp2.${uniqueSuffix}@outra.com`,
          password: await bcrypt.hash('pass', 10),
          name: 'Temp2',
          role: 'USER'
        }
      });
      await prisma.userCompany.create({
        data: { userId: temp2.id, companyId: otherCompanyId, isDefault: true, role: 'USER' }
      });
      const res = await request(app)
        .delete(`/api/users/${temp2.id}`)
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(204);
    });

    it('SUPERUSER nao pode excluir usuario de outra empresa', async () => {
      const res = await request(app)
        .delete(`/api/users/${adminId}`)
        .set(authHeaders(superToken, otherCompanyId));
      expect(res.status).toBe(403);
    });

    it('USER nao pode excluir usuarios', async () => {
      const res = await request(app)
        .delete(`/api/users/${superId}`)
        .set(authHeaders(userToken, otherCompanyId));
      expect(res.status).toBe(403);
    });
  });
});
