import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppKey, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
describe('Bizz foundation and per-user application grants', () => {
  let companyId: number, otherCompanyId: number, userId: number, deniedId: number, foreignId: number;
  let token: string, deniedToken: string, foreignToken: string, contactId: string;
  const suffix = randomUUID();
  const password = 'Bizz-Test-Initial-42';
  const email = `bizz-${suffix}@example.test`;
  const headers = (auth = token, company = companyId, appKey = 'zenit-bizz') => ({
    Authorization: `Bearer ${auth}`,
    'X-Company-Id': String(company),
    'X-App-Key': appKey
  });
  const draft = (extra = {}) => ({
    name: 'Flores da Serra',
    personType: 'BUSINESS',
    isCustomer: true,
    isSupplier: true,
    document: null,
    email: '',
    phone: '',
    notes: '',
    active: true,
    ...extra
  });
  beforeAll(async () => {
    const max = await prisma.company.aggregate({ _max: { code: true } });
    companyId = (
      await prisma.company.create({
        data: { name: 'Floricultura Bizz Test', code: (max._max.code ?? 0) + 1 }
      })
    ).id;
    otherCompanyId = (
      await prisma.company.create({
        data: { name: 'Outra Empresa Bizz Test', code: (max._max.code ?? 0) + 2 }
      })
    ).id;
    const hash = await bcrypt.hash(password, 4);
    userId = (
      await prisma.user.create({
        data: { name: 'Operador Bizz', email, password: hash, mustChangePassword: false }
      })
    ).id;
    deniedId = (
      await prisma.user.create({
        data: {
          name: 'Sem Bizz',
          email: `denied-${suffix}@example.test`,
          password: hash,
          role: 'ADMIN',
          mustChangePassword: false
        }
      })
    ).id;
    foreignId = (
      await prisma.user.create({
        data: {
          name: 'Outro usuário',
          email: `foreign-${suffix}@example.test`,
          password: hash,
          mustChangePassword: false
        }
      })
    ).id;
    await prisma.userCompany.createMany({
      data: [
        { companyId, userId, role: 'SUPERUSER' },
        { companyId, userId: deniedId, role: 'ADMIN' },
        { companyId: otherCompanyId, userId, role: 'USER' },
        { companyId: otherCompanyId, userId: foreignId, role: 'USER' }
      ]
    });
    for (const id of [companyId, otherCompanyId])
      await AppAccessService.setCompanyEntitlements(id, [
        { appKey: AppKey.ZENIT_BIZZ, enabled: true },
        { appKey: AppKey.ZENIT_CASH, enabled: true },
        { appKey: AppKey.ZENIT_ADMIN, enabled: true }
      ]);
    await AppAccessService.setUserGrants(userId, companyId, [{ appKey: AppKey.ZENIT_BIZZ, granted: true }]);
    await AppAccessService.setUserGrants(userId, otherCompanyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: true }
    ]);
    await AppAccessService.setUserGrants(deniedId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true },
      { appKey: AppKey.ZENIT_ADMIN, granted: true }
    ]);
    await AppAccessService.setUserGrants(foreignId, otherCompanyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: true }
    ]);
    token = generateToken({ userId });
    deniedToken = generateToken({ userId: deniedId });
    foreignToken = generateToken({ userId: foreignId });
  });
  afterAll(async () => {
    const companies = [companyId, otherCompanyId].filter(Boolean);
    const users = [userId, deniedId, foreignId].filter(Boolean);
    await prisma.bizzContact.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.userAppGrant.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.userCompany.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.$disconnect();
  });
  it('allows the ecosystem login only with an effective Bizz grant', async () => {
    const granted = await request(app)
      .post('/api/auth/login')
      .set('X-App-Key', 'zenit-bizz')
      .send({ email, password });
    expect(granted.status).toBe(200);
    expect(granted.body.user.appAccessByCompany[companyId]).toContainEqual({
      appKey: 'zenit-bizz',
      enabled: true,
      granted: true,
      allowed: true
    });
    const denied = await request(app)
      .post('/api/auth/login')
      .set('X-App-Key', 'zenit-bizz')
      .send({ email: `denied-${suffix}@example.test`, password });
    expect(denied.status).toBe(403);
  });
  it('denies an ADMIN without a Bizz grant, missing identity and foreign memberships', async () => {
    expect((await request(app).get('/api/bizz/session').set(headers(deniedToken))).status).toBe(403);
    expect((await request(app).get('/api/bizz/session')).status).toBe(401);
    expect((await request(app).get('/api/bizz/session').set(headers(foreignToken))).status).toBe(403);
  });
  it('does not let a Cash grant enter Bizz or a Bizz grant enter Cash/admin routes', async () => {
    expect(
      (
        await request(app)
          .get('/api/BIZZ/contacts')
          .set(headers(deniedToken, companyId, 'zenit-cash'))
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/bizz/contacts')
          .set(headers(deniedToken, companyId, 'zenit-cash'))
      ).status
    ).toBe(403);
    for (const path of [
      '/api/cash/personal-workspace',
      '/api/financial/accounts',
      '/api/users',
      '/api/companies',
      '/api/app-access/users/1/grants'
    ]) {
      expect((await request(app).get(path).set(headers())).status).toBe(403);
    }
    expect((await request(app).post('/api/cash/bootstrap/select-company').set(headers()).send({ companyId })).status).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/financial/accounts')
          .set(headers(token, companyId, 'zenit-cash'))
      ).status
    ).toBe(403);
  });
  it('applies company disablement and individual revocation on the next request', async () => {
    await AppAccessService.setCompanyEntitlements(companyId, [{ appKey: AppKey.ZENIT_BIZZ, enabled: false }]);
    expect((await request(app).get('/api/bizz/session').set(headers())).status).toBe(403);
    await AppAccessService.setCompanyEntitlements(companyId, [{ appKey: AppKey.ZENIT_BIZZ, enabled: true }]);
    await AppAccessService.setUserGrants(userId, companyId, [{ appKey: AppKey.ZENIT_BIZZ, granted: false }]);
    expect((await request(app).get('/api/bizz/session').set(headers())).status).toBe(403);
    await AppAccessService.setUserGrants(userId, companyId, [{ appKey: AppKey.ZENIT_BIZZ, granted: true }]);
  });
  it('lets an existing administrator grant and revoke Bizz through the existing API', async () => {
    const admin = headers(deniedToken, companyId, 'zenit-admin');
    expect(
      (
        await request(app)
          .put(`/api/app-access/users/${deniedId}/grants`)
          .set(admin)
          .send({ grants: [{ appKey: 'zenit-bizz', granted: true }] })
      ).status
    ).toBe(200);
    expect((await request(app).get('/api/bizz/session').set(headers(deniedToken))).status).toBe(200);
    await request(app)
      .put(`/api/app-access/users/${deniedId}/grants`)
      .set(admin)
      .send({ grants: [{ appKey: 'zenit-bizz', granted: false }] });
  });
  it('requires first-access password change and verifies the current password', async () => {
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    expect((await request(app).get('/api/bizz/contacts').set(headers())).body.code).toBe(
      'PASSWORD_CHANGE_REQUIRED'
    );
    expect(
      (
        await request(app)
          .put('/api/auth/password')
          .set(headers())
          .send({ currentPassword: 'incorrect', newPassword: 'Bizz-New-Password-43' })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .put('/api/auth/password')
          .set(headers())
          .send({ currentPassword: password, newPassword: 'Bizz-New-Password-43' })
      ).status
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(false);
  });
  it('does not grant Bizz implicitly when creating default application grants', async () => {
    const defaults = await AppAccessService.buildDefaultGrantsForCompanies([companyId]);
    expect(defaults.some((grant) => grant.appKey === AppKey.ZENIT_BIZZ)).toBe(false);
  });
  it('blocks self-granting through profile updates and cross-company grants by SUPERUSER', async () => {
    await AppAccessService.setUserGrants(foreignId, otherCompanyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }
    ]);
    const own = await request(app)
      .put(`/api/users/${foreignId}`)
      .set(headers(foreignToken, otherCompanyId, 'zenit-cash'))
      .send({
        appGrants: [{ companyId: otherCompanyId, appKey: 'zenit-admin', granted: true }]
      });
    expect(own.status).toBe(403);
    await AppAccessService.setUserGrants(userId, companyId, [{ appKey: AppKey.ZENIT_CASH, granted: true }]);
    const cross = await request(app)
      .put(`/api/users/${userId}`)
      .set(headers(token, companyId, 'zenit-cash'))
      .send({
        name: 'Unauthorized edit',
        appGrants: [{ companyId: otherCompanyId, appKey: 'zenit-admin', granted: true }]
      });
    expect(cross.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe('Operador Bizz');
    await AppAccessService.setUserGrants(userId, companyId, [{ appKey: AppKey.ZENIT_CASH, granted: false }]);
  });
  it('creates exactly one record for concurrent repeated requests', async () => {
    const body = draft({ requestKey: randomUUID() });
    const responses = await Promise.all(
      [1, 2].map(() => request(app).post('/api/bizz/contacts').set(headers()).send(body))
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    contactId = responses[0].body.id;
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send({ ...body, name: 'Outro cadastro' })
      ).status
    ).toBe(409);
  });
  it('shows one shared record in both lists and isolates companies', async () => {
    for (const role of ['customer', 'supplier']) {
      const response = await request(app).get(`/api/bizz/contacts?role=${role}`).set(headers());
      expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([contactId]);
    }
    expect(
      (await request(app).get('/api/bizz/contacts').set(headers(token, otherCompanyId))).body.total
    ).toBe(0);
    expect(
      (
        await request(app)
          .put(`/api/bizz/contacts/${contactId}`)
          .set(headers(token, otherCompanyId))
          .send(draft({ version: 1 }))
      ).status
    ).toBe(404);
  });
  it('rejects tenant injection, an empty name and a contact without a role', async () => {
    for (const data of [
      { companyId: otherCompanyId },
      { name: '   ' },
      { isCustomer: false, isSupplier: false }
    ]) {
      expect(
        (
          await request(app)
            .post('/api/bizz/contacts')
            .set(headers())
            .send(draft({ requestKey: randomUUID(), ...data }))
        ).status
      ).toBe(400);
    }
  });
  it('detects concurrent edits and supports inactivation without deletion', async () => {
    const saved = await request(app)
      .put(`/api/bizz/contacts/${contactId}`)
      .set(headers())
      .send(draft({ version: 1, active: false }));
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    expect(
      (
        await request(app)
          .put(`/api/bizz/contacts/${contactId}`)
          .set(headers())
          .send(draft({ version: 1 }))
      ).status
    ).toBe(409);
    expect((await request(app).get('/api/bizz/contacts').set(headers())).body.total).toBe(0);
    expect((await request(app).get('/api/bizz/contacts?status=inactive').set(headers())).body.total).toBe(1);
  });
  it('normalizes duplicate documents within a company and allows them in another', async () => {
    const body = draft({ document: '12.345.678/0001-90' });
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send({ ...body, requestKey: randomUUID() })
      ).status
    ).toBe(201);
    const search = await request(app)
      .get('/api/bizz/contacts')
      .query({ q: '12.345.678/0001-90' })
      .set(headers());
    expect(search.status).toBe(200);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0].document).toBe('12345678000190');
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send({ ...body, document: '12345678000190', requestKey: randomUUID() })
      ).status
    ).toBe(409);
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers(token, otherCompanyId))
          .send({ ...body, requestKey: randomUUID() })
      ).status
    ).toBe(201);
  });
});
