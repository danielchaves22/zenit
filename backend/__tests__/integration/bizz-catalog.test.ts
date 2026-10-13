import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
describe('Bizz products and services catalog', () => {
  let companyId: number, otherCompanyId: number, userId: number, deniedId: number;
  let token: string, deniedToken: string;
  const headers = (company = companyId, auth = token, appKey = 'zenit-bizz') => ({
    Authorization: `Bearer ${auth}`,
    'X-Company-Id': String(company),
    'X-App-Key': appKey
  });
  const draft = (extra = {}) => ({
    name: 'Arranjo de flores',
    kind: 'PRODUCT',
    unit: 'Unidade',
    canPurchase: false,
    canSell: true,
    salePrice: '89.90',
    active: true,
    ...extra
  });
  beforeAll(async () => {
    const max = await prisma.company.aggregate({ _max: { code: true } });
    companyId = (
      await prisma.company.create({
        data: { code: (max._max.code ?? 0) + 1, name: 'Catálogo teste' }
      })
    ).id;
    otherCompanyId = (
      await prisma.company.create({
        data: { code: (max._max.code ?? 0) + 2, name: 'Outro catálogo teste' }
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Catálogo',
          email: `catalog-${randomUUID()}@example.test`,
          password: 'not-a-login-hash',
          mustChangePassword: false
        }
      })
    ).id;
    deniedId = (
      await prisma.user.create({
        data: {
          name: 'Sem Bizz',
          email: `denied-catalog-${randomUUID()}@example.test`,
          password: 'not-a-login-hash',
          mustChangePassword: false
        }
      })
    ).id;
    await prisma.userCompany.createMany({
      data: [
        { companyId, userId, role: 'USER' },
        { companyId: otherCompanyId, userId, role: 'USER' },
        { companyId, userId: deniedId, role: 'USER' }
      ]
    });
    for (const id of [companyId, otherCompanyId]) {
      await AppAccessService.setCompanyEntitlements(id, [
        { appKey: AppKey.ZENIT_BIZZ, enabled: true }
      ]);
      await AppAccessService.setUserGrants(userId, id, [
        { appKey: AppKey.ZENIT_BIZZ, granted: true }
      ]);
    }
    token = generateToken({ userId });
    deniedToken = generateToken({ userId: deniedId });
  });
  afterAll(async () => {
    const ids = [companyId, otherCompanyId].filter(Boolean);
    await prisma.bizzCatalogItem.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.userAppGrant.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.userCompany.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, deniedId].filter(Boolean) } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it('requires an effective Bizz grant and password change completion for every operation', async () => {
    await request(app).get('/api/bizz/catalog').expect(401);
    await request(app).get('/api/bizz/catalog').set(headers(companyId, deniedToken)).expect(403);
    await request(app)
      .post('/api/bizz/catalog')
      .set(headers(companyId, deniedToken))
      .send(draft({ requestKey: randomUUID() }))
      .expect(403);
    await request(app)
      .get('/api/bizz/catalog')
      .set(headers(companyId, token, 'zenit-cash'))
      .expect(403);
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    try {
      await request(app).get('/api/bizz/catalog').set(headers()).expect(403);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
    }
  });
  it('creates products and services with exact optional prices and private audit fields', async () => {
    for (const [kind, salePrice] of [
      ['PRODUCT', '89.90'],
      ['SERVICE', null],
      ['SERVICE', '0.00']
    ]) {
      const result = await request(app)
        .post('/api/bizz/catalog')
        .set(headers())
        .send(draft({ kind, salePrice, canPurchase: true, requestKey: randomUUID() }))
        .expect(201);
      expect(result.body).toMatchObject({
        kind,
        salePrice,
        version: 1,
        canPurchase: true,
        canSell: true
      });
      expect(result.body).not.toHaveProperty('companyId');
      expect(result.body).not.toHaveProperty('requestHash');
      const stored = await prisma.bizzCatalogItem.findUniqueOrThrow({
        where: { id: result.body.id }
      });
      expect(stored.createdById).toBe(userId);
      expect(stored.companyId).toBe(companyId);
    }
  });
  it('deduplicates concurrent retries and rejects reusing the key for different data', async () => {
    const body = draft({ requestKey: randomUUID(), salePrice: '89.9' });
    const results = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/bizz/catalog').set(headers()).send(body))
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    await request(app)
      .post('/api/bizz/catalog')
      .set(headers())
      .send({ ...body, salePrice: '89.90' })
      .expect(200);
    await request(app)
      .post('/api/bizz/catalog')
      .set(headers())
      .send({ ...body, salePrice: '90.00' })
      .expect(409);
    const other = await request(app)
      .post('/api/bizz/catalog')
      .set(headers(otherCompanyId))
      .send(body)
      .expect(201);
    expect(other.body.id).not.toBe(results[0].body.id);
  });
  it('isolates reads and updates even when the user has access to both companies', async () => {
    const result = await request(app)
      .post('/api/bizz/catalog')
      .set(headers())
      .send(draft({ name: 'Exclusivo empresa A', requestKey: randomUUID() }))
      .expect(201);
    const path = `/api/bizz/catalog/${result.body.id}`;
    await request(app).get(path).set(headers(otherCompanyId)).expect(404);
    await request(app)
      .put(path)
      .set(headers(otherCompanyId))
      .send(draft({ version: 1 }))
      .expect(404);
    const list = await request(app)
      .get('/api/bizz/catalog')
      .query({ q: 'Exclusivo empresa A' })
      .set(headers(otherCompanyId));
    expect(list.body.total).toBe(0);
    expect((await request(app).get(path).set(headers())).body.version).toBe(1);
  });
  it('rejects invalid fields, money precision, usage and tenant injection', async () => {
    for (const invalid of [
      { name: ' ' },
      { unit: '' },
      { unit: 'x'.repeat(41) },
      { kind: 'OTHER' },
      { canPurchase: false, canSell: false },
      { salePrice: '-1' },
      { salePrice: '1.001' },
      { salePrice: '1000000000000' },
      { salePrice: '1e3' },
      { salePrice: 'NaN' },
      { salePrice: '12,30' },
      { companyId: otherCompanyId },
      { createdById: deniedId }
    ])
      await request(app)
        .post('/api/bizz/catalog')
        .set(headers())
        .send(draft({ requestKey: randomUUID(), ...invalid }))
        .expect(400);
    for (const query of [{ kind: 'other' }, { usage: 'none' }, { status: 'deleted' }, { page: 0 }])
      await request(app).get('/api/bizz/catalog').query(query).set(headers()).expect(400);
    await request(app).get('/api/bizz/catalog/not-a-uuid').set(headers()).expect(400);
  });
  it('detects concurrent edits, clears a price and inactivates/reactivates without replacing the ID', async () => {
    const created = await request(app)
      .post('/api/bizz/catalog')
      .set(headers())
      .send(draft({ requestKey: randomUUID() }))
      .expect(201);
    const path = `/api/bizz/catalog/${created.body.id}`;
    const results = await Promise.all(
      ['Primeira edição', 'Segunda edição'].map((name) =>
        request(app)
          .put(path)
          .set(headers())
          .send(draft({ name, version: 1, salePrice: null, active: false }))
      )
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const changed = results.find((result) => result.status === 200)!;
    expect(changed.body).toMatchObject({
      id: created.body.id,
      version: 2,
      salePrice: null,
      active: false
    });
    const active = await request(app)
      .get('/api/bizz/catalog')
      .query({ q: changed.body.name })
      .set(headers());
    expect(active.body.total).toBe(0);
    const reactivated = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 2, active: true }))
      .expect(200);
    expect(reactivated.body).toMatchObject({ id: created.body.id, version: 3, active: true });
  });
  it('combines type, usage, status and search filters with stable pagination', async () => {
    const prefix = `Busca ${randomUUID()}`;
    await prisma.bizzCatalogItem.createMany({
      data: Array.from({ length: 23 }, (_, index) => ({
        companyId,
        name: `${prefix} ${String(index).padStart(2, '0')}`,
        kind: 'SERVICE',
        unit: 'Hora',
        canPurchase: true,
        canSell: true,
        active: false,
        requestKey: randomUUID(),
        requestHash: 'test',
        createdById: userId,
        updatedById: userId
      }))
    });
    const query = { q: prefix.toLowerCase(), kind: 'SERVICE', usage: 'sale', status: 'inactive' };
    const first = await request(app)
      .get('/api/bizz/catalog')
      .query(query)
      .set(headers())
      .expect(200);
    const second = await request(app)
      .get('/api/bizz/catalog')
      .query({ ...query, page: 2 })
      .set(headers())
      .expect(200);
    expect(first.body.total).toBe(23);
    expect(first.body.items).toHaveLength(20);
    expect(second.body.items).toHaveLength(3);
    expect(
      new Set([...first.body.items, ...second.body.items].map((item: { id: string }) => item.id))
        .size
    ).toBe(23);
    for (const usage of ['purchase', 'both'])
      expect(
        (
          await request(app)
            .get('/api/bizz/catalog')
            .query({ ...query, usage })
            .set(headers())
        ).body.total
      ).toBe(23);
    expect(
      (
        await request(app)
          .get('/api/bizz/catalog')
          .query({ ...query, kind: 'PRODUCT' })
          .set(headers())
      ).body.total
    ).toBe(0);
  });
});
