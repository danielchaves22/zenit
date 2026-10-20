import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const globalPath = '/api/admin/product-attributes';
const localPath = '/api/bizz/attributes';
describe('Product characteristics: global catalog and company extensions', () => {
  let companyId: number, otherCompanyId: number, userId: number, adminId: number;
  const header = (platform = false, company = companyId) => ({
    Authorization: `Bearer ${generateToken({ userId: platform ? adminId : userId })}`,
    'X-App-Key': platform ? 'zenit-admin' : 'zenit-bizz',
    'X-Company-Id': String(company)
  });
  const definition = (extra = {}) => ({
    name: `Cor ${randomUUID()}`,
    type: 'SELECT',
    description: '',
    unit: '',
    active: true,
    options: [{ label: 'Branco', active: true }],
    requestKey: randomUUID(),
    ...extra
  });
  const product = (extra = {}) => ({
    name: 'Vaso',
    kind: 'PRODUCT',
    unit: 'Unidade',
    canPurchase: true,
    canSell: true,
    salePrice: '19.99',
    active: true,
    requestKey: randomUUID(),
    ...extra
  });
  const payload = (item: any, extra = {}) => ({
    name: item.name,
    description: item.description,
    type: item.type,
    unit: item.unit,
    active: item.active,
    version: item.version,
    options: item.options.map(({ id, label, active }: any) => ({ id, label, active })),
    ...extra
  });
  async function create(platform = true, extra = {}, company = companyId) {
    const item = (
      await request(app)
        .post(platform ? globalPath : localPath)
        .set(header(platform, company))
        .send(definition(extra))
        .expect(201)
    ).body;
    return platform
      ? (await request(app).get(`${localPath}/${item.id}`).set(header(false, company)).expect(200))
          .body
      : item;
  }
  beforeAll(async () => {
    const max = await prisma.company.aggregate({ _max: { code: true } });
    companyId = (
      await prisma.company.create({ data: { name: 'Atributos A', code: (max._max.code ?? 0) + 1 } })
    ).id;
    otherCompanyId = (
      await prisma.company.create({ data: { name: 'Atributos B', code: (max._max.code ?? 0) + 2 } })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `attributes-${randomUUID()}@example.test`,
          name: 'Empresa',
          password: 'not-a-login-hash',
          role: 'USER',
          mustChangePassword: false
        }
      })
    ).id;
    adminId = (
      await prisma.user.create({
        data: {
          email: `attributes-admin-${randomUUID()}@example.test`,
          name: 'Plataforma',
          password: 'not-a-login-hash',
          role: 'ADMIN',
          mustChangePassword: false
        }
      })
    ).id;
    for (const id of [companyId, otherCompanyId]) {
      await prisma.userCompany.create({ data: { companyId: id, userId, role: 'USER' } });
      await AppAccessService.setCompanyEntitlements(id, [
        { appKey: AppKey.ZENIT_BIZZ, enabled: true }
      ]);
      await AppAccessService.setUserGrants(userId, id, [
        { appKey: AppKey.ZENIT_BIZZ, granted: true }
      ]);
    }
  });
  afterAll(async () => {
    const companies = [companyId, otherCompanyId].filter(Boolean);
    await prisma.bizzCatalogItem.deleteMany({ where: { companyId: { in: companies } } });
    const attrs = await prisma.productAttribute.findMany({
      where: { createdById: { in: [userId, adminId] } }
    });
    await prisma.productAttributeOption.deleteMany({
      where: { attributeId: { in: attrs.map((a) => a.id) } }
    });
    await prisma.productAttribute.deleteMany({ where: { id: { in: attrs.map((a) => a.id) } } });
    await prisma.userAppGrant.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.userCompany.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.$disconnect();
  });
  it('restricts platform writes to global administrators and rejects tenant scope injection', async () => {
    await request(app).get(globalPath).expect(401);
    await request(app).post(globalPath).set(header()).send(definition()).expect(403);
    await request(app)
      .get(globalPath)
      .set({ ...header(), 'X-App-Key': 'zenit-admin' })
      .expect(403);
    await request(app)
      .post(localPath)
      .set(header())
      .send(definition({ companyId: otherCompanyId }))
      .expect(400);
    const a = await create();
    await request(app)
      .put(`${localPath}/${a.id}`)
      .set(header())
      .send(payload(a, { name: 'Alterado' }))
      .expect(403);
    expect(
      (await request(app).get(`${globalPath}/${a.id}`).set(header(true)).expect(200)).body.name
    ).toBe(a.name);
  });
  it('isolates definitions and extra options by company, even for users in both companies', async () => {
    const global = await create();
    const local = await create(false);
    const response = await request(app)
      .put(`${localPath}/${global.id}/options`)
      .set(header())
      .send({ revision: global.revision, options: [{ label: 'Terracota', active: true }] })
      .expect(200);
    // Empty options revisions are identical, irrespective of the caller.
    const custom = response.body.options.find((o: any) => o.scope === 'company');
    expect(custom.label).toBe('Terracota');
    const other = (
      await request(app)
        .get(`${localPath}/${global.id}`)
        .set(header(false, otherCompanyId))
        .expect(200)
    ).body;
    expect(other.options.map((o: any) => o.label)).toEqual(['Branco']);
    await request(app)
      .get(`${localPath}/${local.id}`)
      .set(header(false, otherCompanyId))
      .expect(404);
    await request(app).get(`${globalPath}/${local.id}`).set(header(true)).expect(404);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header(false, otherCompanyId))
      .send(product({ attributes: [{ attributeId: global.id, optionId: custom.id }] }))
      .expect(400);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header(false, otherCompanyId))
      .send(product({ attributes: [{ attributeId: local.id, optionId: local.options[0].id }] }))
      .expect(404);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(
        product({
          attributes: [{ attributeId: global.id, optionId: custom.id }]
        })
      )
      .expect(201);
    const owned = (await request(app).get(`${localPath}/${global.id}`).set(header()).expect(200))
      .body;
    await request(app)
      .put(`${localPath}/${global.id}/options`)
      .set(header())
      .send({
        revision: owned.revision,
        options: owned.options.map(({ id, label, active }: any) => ({ id, label, active }))
      })
      .expect(400); // Global option IDs cannot be edited through the company endpoint.
  });
  it('deduplicates retries and rejects normalized duplicate names and options', async () => {
    const input = definition();
    const responses = await Promise.all(
      [1, 2].map(() => request(app).post(globalPath).set(header(true)).send(input))
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    await request(app)
      .post(localPath)
      .set(header())
      .send({ ...input, name: input.name.toUpperCase(), requestKey: randomUUID() })
      .expect(409);
    await request(app)
      .post(globalPath)
      .set(header(true))
      .send(
        definition({
          options: [
            { label: 'Azúl', active: true },
            { label: 'AZUL ', active: true }
          ]
        })
      )
      .expect(400);
    const a = await create();
    await request(app)
      .put(`${localPath}/${a.id}/options`)
      .set(header())
      .send({
        revision: a.revision,
        options: [{ label: 'BRANCO', active: true }]
      })
      .expect(409);
  });
  it('guards concurrent company edits without conflicting with other companies', async () => {
    const a = await create();
    const first = { revision: a.revision, options: [{ label: 'Azul', active: true }] };
    await request(app).put(`${localPath}/${a.id}/options`).set(header()).send(first).expect(200);
    await request(app).put(`${localPath}/${a.id}/options`).set(header()).send(first).expect(409);
    await request(app)
      .put(`${localPath}/${a.id}/options`)
      .set(header(false, otherCompanyId))
      .send(first)
      .expect(200);
    await request(app)
      .put(`${globalPath}/${a.id}`)
      .set(header(true))
      .send(payload(a, { description: 'Cores' }))
      .expect(200);
    await request(app).put(`${globalPath}/${a.id}`).set(header(true)).send(payload(a)).expect(409);
  });
  it('stores optional typed values exactly and rejects wrong types, duplicate attributes and services', async () => {
    const size = await create(false, { type: 'NUMBER', unit: 'cm', options: [] });
    const text = await create(false, { type: 'TEXT', options: [] });
    const attributes = [
      { attributeId: size.id, numberValue: '123456789012.123456' },
      { attributeId: text.id, textValue: 'Artesanal' }
    ];
    const stored = await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(product({ attributes }))
      .expect(201);
    expect(stored.body.attributes.find((v: any) => v.attributeId === size.id).numberValue).toBe(
      '123456789012.123456'
    );
    await request(app).post('/api/bizz/catalog').set(header()).send(product()).expect(201);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(product({ kind: 'SERVICE' }))
      .expect(201);
    for (const bad of [
      [{ attributeId: size.id, textValue: '12' }],
      [{ attributeId: size.id, numberValue: '1.1234567' }],
      [{ attributeId: text.id, textValue: 'x', numberValue: '12' }],
      [attributes[0], attributes[0]]
    ])
      await request(app)
        .post('/api/bizz/catalog')
        .set(header())
        .send(product({ attributes: bad }))
        .expect(400);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(product({ attributes, kind: 'SERVICE' }))
      .expect(400);
    const { requestKey: _, ...update } = product({ name: 'Vaso alterado' });
    const edited = await request(app)
      .put(`/api/bizz/catalog/${stored.body.id}`)
      .set(header())
      .send({ ...update, version: 1 })
      .expect(200); // Legacy client preserves assignments.
    expect(edited.body.attributes).toHaveLength(2);
    await request(app)
      .put(`${localPath}/${size.id}`)
      .set(header())
      .send(payload(size, { unit: 'm' }))
      .expect(409);
  });
  it('preserves inactive assignments but blocks new use and protects used option meanings', async () => {
    const a = await create();
    const attributes = [{ attributeId: a.id, optionId: a.options[0].id }];
    const created = await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(product({ attributes }))
      .expect(201);
    await request(app)
      .put(`${globalPath}/${a.id}`)
      .set(header(true))
      .send(
        payload(a, {
          options: [{ id: a.options[0].id, label: 'Preto', active: true }]
        })
      )
      .expect(409);
    await request(app)
      .put(`${globalPath}/${a.id}`)
      .set(header(true))
      .send(payload(a, { active: false }))
      .expect(200);
    await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(product({ attributes }))
      .expect(400);
    const { requestKey: _, ...update } = product();
    await request(app)
      .put(`/api/bizz/catalog/${created.body.id}`)
      .set(header())
      .send({ ...update, attributes, version: 1 })
      .expect(200);
    await request(app)
      .put(`/api/bizz/catalog/${created.body.id}`)
      .set(header())
      .send({ ...update, attributes: [], version: 2 })
      .expect(200);
    const other = await create();
    await request(app)
      .post('/api/bizz/catalog')
      .set(header())
      .send(
        product({
          attributes: [{ attributeId: other.id, optionId: a.options[0].id }]
        })
      )
      .expect(400);
  });
});
