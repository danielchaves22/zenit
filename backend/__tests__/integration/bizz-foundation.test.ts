import request from 'supertest';
import { createHash, randomUUID } from 'crypto';
import { AppKey, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
describe('Bizz foundation and per-user application grants', () => {
  let companyId: number,
    otherCompanyId: number,
    userId: number,
    deniedId: number,
    foreignId: number;
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
        data: {
          name: 'Floricultura Bizz Test',
          code: (max._max.code ?? 0) + 1
        }
      })
    ).id;
    otherCompanyId = (
      await prisma.company.create({
        data: {
          name: 'Outra Empresa Bizz Test',
          code: (max._max.code ?? 0) + 2
        }
      })
    ).id;
    const hash = await bcrypt.hash(password, 4);
    userId = (
      await prisma.user.create({
        data: {
          name: 'Operador Bizz',
          email,
          password: hash,
          mustChangePassword: false
        }
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
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: true }
    ]);
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
    await prisma.bizzContact.deleteMany({
      where: { companyId: { in: companies } }
    });
    await prisma.userAppGrant.deleteMany({
      where: { companyId: { in: companies } }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: { companyId: { in: companies } }
    });
    await prisma.userCompany.deleteMany({
      where: { companyId: { in: companies } }
    });
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
    expect((await request(app).get('/api/bizz/session').set(headers(deniedToken))).status).toBe(
      403
    );
    expect((await request(app).get('/api/bizz/session')).status).toBe(401);
    expect(
      (await request(app).get('/api/bizz/session').set(headers(foreignToken))).status
    ).toBe(403);
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
    expect(
      (
        await request(app)
          .post('/api/cash/bootstrap/select-company')
          .set(headers())
          .send({ companyId })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/financial/accounts')
          .set(headers(token, companyId, 'zenit-cash'))
      ).status
    ).toBe(403);
  });
  it('applies company disablement and individual revocation on the next request', async () => {
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_BIZZ, enabled: false }
    ]);
    expect((await request(app).get('/api/bizz/session').set(headers())).status).toBe(403);
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_BIZZ, enabled: true }
    ]);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: false }
    ]);
    expect((await request(app).get('/api/bizz/session').set(headers())).status).toBe(403);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: true }
    ]);
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
    expect((await request(app).get('/api/bizz/session').set(headers(deniedToken))).status).toBe(
      200
    );
    await request(app)
      .put(`/api/app-access/users/${deniedId}/grants`)
      .set(admin)
      .send({ grants: [{ appKey: 'zenit-bizz', granted: false }] });
  });
  it('requires first-access password change and verifies the current password', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: true }
    });
    expect((await request(app).get('/api/bizz/contacts').set(headers())).body.code).toBe(
      'PASSWORD_CHANGE_REQUIRED'
    );
    expect(
      (
        await request(app).put('/api/auth/password').set(headers()).send({
          currentPassword: 'incorrect',
          newPassword: 'Bizz-New-Password-43'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app).put('/api/auth/password').set(headers()).send({
          currentPassword: password,
          newPassword: 'Bizz-New-Password-43'
        })
      ).status
    ).toBe(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword
    ).toBe(false);
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
        appGrants: [{ companyId: otherCompanyId, appKey: 'zenit-bizz', granted: true }]
      });
    expect(own.status).toBe(403);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }
    ]);
    const cross = await request(app)
      .put(`/api/users/${userId}`)
      .set(headers(token, companyId, 'zenit-cash'))
      .send({
        name: 'Unauthorized edit',
        appGrants: [{ companyId: otherCompanyId, appKey: 'zenit-bizz', granted: true }]
      });
    expect(cross.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe(
      'Operador Bizz'
    );
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: false }
    ]);
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
      (await request(app).get('/api/bizz/contacts').set(headers(token, otherCompanyId))).body
        .total
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
  it('rejects tenant injection and an empty name', async () => {
    for (const data of [{ companyId: otherCompanyId }, { name: '   ' }]) {
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
  it('loads a contact directly only within an authorized company', async () => {
    const path = `/api/bizz/contacts/${contactId}`;
    const loaded = await request(app).get(path).set(headers());
    expect(loaded.status).toBe(200);
    expect(loaded.body).toMatchObject({
      id: contactId,
      isCustomer: true,
      isSupplier: true,
      version: 1
    });
    expect(loaded.body).not.toHaveProperty('companyId');
    expect(loaded.body).not.toHaveProperty('requestHash');
    expect((await request(app).get(path).set(headers(token, otherCompanyId))).status).toBe(404);
    expect((await request(app).get(path).set(headers(deniedToken))).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
    expect(
      (await request(app).get(`/api/bizz/contacts/${randomUUID()}`).set(headers())).status
    ).toBe(404);
    expect((await request(app).get('/api/bizz/contacts/invalid').set(headers())).status).toBe(
      400
    );
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
    expect(
      (await request(app).get('/api/bizz/contacts?status=inactive').set(headers())).body.total
    ).toBe(1);
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
          .send({
            ...body,
            document: '12345678000190',
            requestKey: randomUUID()
          })
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
  it('creates an unclassified person and changes relationships without replacing its identity or address', async () => {
    const body = draft({
      name: 'Pessoa sem relacionamento',
      personType: 'PERSON',
      isCustomer: false,
      isSupplier: false,
      street: 'Rua das Flores',
      city: 'Campinas',
      state: 'SP',
      requestKey: randomUUID()
    });
    const created = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      isCustomer: false,
      isSupplier: false,
      street: 'Rua das Flores',
      city: 'Campinas'
    });
    const path = `/api/bizz/contacts/${created.body.id}`;
    const filtered = await request(app)
      .get('/api/bizz/contacts?role=none&personType=PERSON')
      .set(headers());
    expect(filtered.body.items.map((item: { id: string }) => item.id)).toEqual([
      created.body.id
    ]);
    expect(
      (
        await request(app)
          .get('/api/bizz/contacts?role=none&personType=BUSINESS')
          .set(headers())
      ).body.total
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/bizz/contacts?role=none')
          .set(headers(token, otherCompanyId))
      ).body.total
    ).toBe(0);
    // Older clients do not send address fields: updates must preserve them.
    const changed = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ name: body.name, personType: 'PERSON', version: 1 }));
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      id: created.body.id,
      version: 2,
      isCustomer: true,
      isSupplier: true,
      street: 'Rua das Flores',
      city: 'Campinas'
    });
    const both = await request(app)
      .get('/api/bizz/contacts?role=both&personType=PERSON')
      .set(headers());
    expect(both.body.items.map((item: { id: string }) => item.id)).toEqual([created.body.id]);
    const cleared = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          name: body.name,
          personType: 'PERSON',
          version: 2,
          isCustomer: false,
          isSupplier: false,
          street: '',
          city: null
        })
      );
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      id: created.body.id,
      isCustomer: false,
      isSupplier: false,
      street: null,
      city: null
    });
  });
  it('preserves legacy idempotency when new empty address fields are sent', async () => {
    const data = {
      name: 'Cadastro legado',
      personType: 'BUSINESS',
      isCustomer: false,
      isSupplier: true,
      document: null,
      email: null,
      phone: null,
      notes: null,
      active: true
    };
    const requestKey = randomUUID();
    const legacy = await prisma.bizzContact.create({
      data: {
        ...data,
        requestKey,
        requestHash: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        companyId,
        createdById: userId,
        updatedById: userId
      }
    });
    const replay = await request(app)
      .post('/api/bizz/contacts')
      .set(headers())
      .send({ ...data, requestKey, street: '', city: null });
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(legacy.id);
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send({ ...data, requestKey, street: 'Outro endereço' })
      ).status
    ).toBe(409);
  });
  it('validates address lengths and relationship filters', async () => {
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send(draft({ requestKey: randomUUID(), street: 'x'.repeat(161) }))
      ).status
    ).toBe(400);
    expect(
      (await request(app).get('/api/bizz/contacts?role=invalid').set(headers())).status
    ).toBe(400);
    expect(
      (await request(app).get('/api/bizz/contacts?personType=invalid').set(headers())).status
    ).toBe(400);
  });
  it('persists multiple contact values, searches the additional ones and isolates them by company', async () => {
    const phones = ['(11) 90000-0001', '(11) 90000-0002'];
    const body = draft({
      name: 'Múltiplos contatos',
      requestKey: randomUUID(),
      phones,
      emails: [' Primeiro@Example.test ', 'compras@example.test']
    });
    const created = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      phone: '(11) 90000-0001',
      email: 'primeiro@example.test',
      phones,
      emails: ['primeiro@example.test', 'compras@example.test']
    });
    expect(created.body).not.toHaveProperty('methods');
    const path = `/api/bizz/contacts/${created.body.id}`;
    expect((await request(app).get(path).set(headers())).body.phones).toEqual(phones);
    const replay = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(created.body.id);
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send({
            ...body,
            emails: ['primeiro@example.test', 'outro@example.test']
          })
      ).status
    ).toBe(409);
    for (const q of ['COMPRAS@EXAMPLE', '90000-0002']) {
      const found = await request(app).get('/api/bizz/contacts').query({ q }).set(headers());
      expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([
        created.body.id
      ]);
      expect(
        (
          await request(app)
            .get('/api/bizz/contacts')
            .query({ q })
            .set(headers(token, otherCompanyId))
        ).body.total
      ).toBe(0);
    }
    expect(
      (
        await request(app)
          .put(path)
          .set(headers(token, otherCompanyId))
          .send(draft({ version: 1, phones: [], emails: [] }))
      ).status
    ).toBe(404);
    const changed = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          version: 1,
          phones: ['(11) 90000-0002'],
          emails: ['compras@example.test']
        })
      );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      phone: '(11) 90000-0002',
      phones: ['(11) 90000-0002'],
      email: 'compras@example.test',
      version: 2
    });
    expect(
      (
        await request(app)
          .put(path)
          .set(headers())
          .send(draft({ version: 1, phones: [], emails: [] }))
      ).status
    ).toBe(409);
    expect((await request(app).get(path).set(headers())).body.phones).toEqual([
      '(11) 90000-0002'
    ]);
    const cleared = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 2, phones: [], emails: [] }));
    expect(cleared.body).toMatchObject({
      phone: null,
      email: null,
      phones: [],
      emails: []
    });
    expect(
      await prisma.bizzContactMethod.count({
        where: { contactId: created.body.id }
      })
    ).toBe(0);
  });
  it('preserves additional values during legacy updates and accepts equivalent single-value retries', async () => {
    const body = draft({
      requestKey: randomUUID(),
      phone: '11912345678',
      email: 'legacy@example.test'
    });
    const created = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    const replay = await request(app)
      .post('/api/bizz/contacts')
      .set(headers())
      .send({ ...body, phones: [body.phone], emails: [body.email] });
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(created.body.id);
    const path = `/api/bizz/contacts/${created.body.id}`;
    await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          version: 1,
          phones: ['11912345678', '11912345679'],
          emails: ['legacy@example.test', 'extra@example.test']
        })
      )
      .expect(200);
    const legacy = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 2, phone: '11912345680', email: 'novo@example.test' }));
    expect(legacy.status).toBe(200);
    expect(legacy.body).toMatchObject({
      phones: ['11912345680', '11912345679'],
      emails: ['novo@example.test', 'extra@example.test']
    });
    const { phone, email, ...withoutValues } = draft({ version: 3 });
    const omitted = await request(app).put(path).set(headers()).send(withoutValues);
    expect(omitted.status).toBe(200);
    expect(omitted.body.phones).toEqual(legacy.body.phones);
    expect(omitted.body.emails).toEqual(legacy.body.emails);
  });
  it('rejects invalid, duplicate and excessive contact values without altering the saved contact', async () => {
    for (const values of [
      { emails: ['invalid'] },
      { emails: ['A@example.test', 'a@example.test'] },
      { phones: ['(11) 91234-5678', '11912345678'] },
      { phones: [''] },
      { phones: ['1'.repeat(41)] },
      { emails: Array.from({ length: 21 }, (_, i) => `p${i}@example.test`) }
    ]) {
      const result = await request(app)
        .post('/api/bizz/contacts')
        .set(headers())
        .send(draft({ requestKey: randomUUID(), ...values }));
      expect(result.status).toBe(400);
    }
    const created = await request(app)
      .post('/api/bizz/contacts')
      .set(headers())
      .send(draft({ requestKey: randomUUID(), emails: ['valid@example.test'] }));
    const path = `/api/bizz/contacts/${created.body.id}`;
    await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 1, emails: ['invalid'] }))
      .expect(400);
    expect((await request(app).get(path).set(headers())).body).toMatchObject({
      version: 1,
      emails: ['valid@example.test']
    });
  });
  it('serves the reference catalog only with effective Bizz access', async () => {
    const states = await request(app).get('/api/bizz/geography/states').set(headers());
    expect(states.status).toBe(200);
    expect(states.body).toHaveLength(27);
    const cities = await request(app)
      .get('/api/bizz/geography/states/SP/cities')
      .set(headers());
    expect(cities.body).toContainEqual({ code: '3509502', name: 'Campinas', stateCode: 'SP' });
    expect(cities.body.every((city: { stateCode: string }) => city.stateCode === 'SP')).toBe(
      true
    );
    expect(
      (await request(app).get('/api/bizz/geography/states/XX/cities').set(headers())).status
    ).toBe(400);
    expect(
      (await request(app).get('/api/bizz/geography/states').set(headers(deniedToken))).status
    ).toBe(403);
    expect((await request(app).get('/api/bizz/geography/states')).status).toBe(401);
  });
  it('persists the official city code, replays safely, rejects mismatches and clears a replaced city', async () => {
    const body = {
      ...draft(),
      requestKey: randomUUID(),
      location: { stateCode: 'SP', cityCode: '3509502' },
      emails: ['loja@example.test', 'financeiro@example.test'],
      phones: ['1134567890', '11976543210'],
      document: '00.000.000/E08G-12'
    };
    const created = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(created.status).toBe(201);
    const path = `/api/bizz/contacts/${created.body.id}`;
    expect(created.body).toMatchObject({
      city: 'Campinas',
      state: 'SP',
      country: 'Brasil',
      cityIbgeCode: '3509502',
      location: body.location,
      document: '00000000E08G12'
    });
    expect((await request(app).get(path).set(headers())).body.emails).toEqual(body.emails);
    const byPhone = await request(app)
      .get('/api/bizz/contacts')
      .query({ q: '(11) 97654-3210' })
      .set(headers());
    expect(byPhone.body.items.map((item: { id: string }) => item.id)).toEqual([
      created.body.id
    ]);
    const replay = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(created.body.id);
    const invalid = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 1, location: { stateCode: 'RJ', cityCode: '3509502' } }));
    expect(invalid.status).toBe(400);
    expect((await request(app).get(path).set(headers())).body).toMatchObject({
      version: 1,
      cityIbgeCode: '3509502',
      emails: body.emails
    });
    const cleared = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          version: 1,
          location: { stateCode: 'RJ', cityCode: null },
          emails: body.emails
        })
      );
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      state: 'RJ',
      city: null,
      cityIbgeCode: null,
      location: { stateCode: 'RJ', cityCode: null },
      emails: body.emails
    });
    expect((await request(app).get(path).set(headers(token, otherCompanyId))).status).toBe(404);
  });
  it('preserves an unmatched legacy address during unrelated edits and replaces it only through selection', async () => {
    const record = await prisma.bizzContact.create({
      data: {
        name: 'Endereço antigo',
        companyId,
        createdById: userId,
        updatedById: userId,
        requestKey: randomUUID(),
        requestHash: 'legacy',
        city: 'Localidade antiga',
        state: 'Estado antigo',
        country: 'Brasil'
      }
    });
    const path = `/api/bizz/contacts/${record.id}`;
    const loaded = await request(app).get(path).set(headers());
    expect(loaded.body.location).toBeNull();
    const edited = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          name: record.name,
          version: 1,
          city: record.city,
          state: record.state,
          country: record.country
        })
      );
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      city: record.city,
      state: record.state,
      location: null
    });
    const corrected = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          name: record.name,
          version: 2,
          location: { stateCode: 'SP', cityCode: '3509502' }
        })
      );
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ city: 'Campinas', cityIbgeCode: '3509502' });
    expect(
      (
        await request(app)
          .post('/api/bizz/contacts')
          .set(headers())
          .send(draft({ requestKey: randomUUID(), city: 'Inventada', state: 'SP' }))
      ).status
    ).toBe(400);
  });
  it('stores multiple addresses atomically, replays without duplicates and keeps stable IDs when changing the primary', async () => {
    const delivery = {
      label: 'Entrega',
      street: 'Rua das Rosas',
      addressNumber: '12',
      location: { stateCode: 'SP', cityCode: '3509502' }
    };
    const billing = {
      label: 'Cobrança',
      street: 'Rua Central',
      location: { stateCode: 'RJ', cityCode: '3304557' }
    };
    const body = draft({ requestKey: randomUUID(), addresses: [delivery, billing] });
    const created = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(created.status).toBe(201);
    expect(created.body.addresses).toHaveLength(2);
    expect(created.body).toMatchObject({
      street: delivery.street,
      city: 'Campinas',
      state: 'SP'
    });
    const [first, second] = created.body.addresses;
    expect(first).toMatchObject({ label: 'Entrega', city: 'Campinas' });
    expect(second).toMatchObject({ label: 'Cobrança', city: 'Rio de Janeiro' });
    const replay = await request(app).post('/api/bizz/contacts').set(headers()).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.addresses).toEqual(created.body.addresses);
    const path = `/api/bizz/contacts/${created.body.id}`;
    const reordered = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          version: 1,
          addresses: [
            { ...billing, id: second.id },
            { ...delivery, id: first.id }
          ]
        })
      );
    expect(reordered.status).toBe(200);
    expect(reordered.body).toMatchObject({
      street: billing.street,
      city: 'Rio de Janeiro',
      state: 'RJ'
    });
    expect(reordered.body.addresses.map((value: { id: string }) => value.id)).toEqual([
      second.id,
      first.id
    ]);
    const stale = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 1, addresses: [] }));
    expect(stale.status).toBe(409);
    expect((await request(app).get(path).set(headers())).body.addresses).toHaveLength(2);
    // Legacy clients edit the primary only and retain the other address.
    const legacy = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 2, street: 'Rua Alterada' }));
    expect(legacy.status).toBe(200);
    expect(legacy.body.addresses).toHaveLength(2);
    expect(legacy.body.addresses[0]).toMatchObject({
      id: second.id,
      street: 'Rua Alterada',
      label: 'Cobrança'
    });
    expect(legacy.body.addresses[1]).toMatchObject({ id: first.id, street: delivery.street });
    const removed = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 3, addresses: [{ ...delivery, id: first.id, label: null }] }));
    expect(removed.status).toBe(200);
    expect(removed.body.addresses).toHaveLength(1);
    expect(removed.body.addresses[0]).toMatchObject({ id: first.id, label: null });
    expect(removed.body.street).toBe(delivery.street);
    const cleared = await request(app)
      .put(path)
      .set(headers())
      .send(draft({ version: 4, addresses: [] }));
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      addresses: [],
      city: null,
      state: null,
      country: null,
      street: null,
      cityIbgeCode: null
    });
    expect((await request(app).get(path).set(headers())).body.addresses).toEqual([]);
    expect(
      await prisma.bizzContactAddress.count({ where: { contactId: created.body.id } })
    ).toBe(0);
  });
  it('rejects invalid and foreign address IDs without changing saved records', async () => {
    const address = {
      label: 'Comercial',
      street: 'Rua Principal',
      location: { stateCode: 'SP', cityCode: '3509502' }
    };
    const created = await request(app)
      .post('/api/bizz/contacts')
      .set(headers())
      .send(draft({ requestKey: randomUUID(), addresses: [address] }));
    expect(created.status).toBe(201);
    const id = created.body.addresses[0].id;
    const foreign = await request(app)
      .post('/api/bizz/contacts')
      .set(headers(token, otherCompanyId))
      .send(draft({ requestKey: randomUUID(), addresses: [address] }));
    const otherRecord = await request(app)
      .post('/api/bizz/contacts')
      .set(headers())
      .send(draft({ requestKey: randomUUID(), addresses: [address] }));
    for (const addresses of [
      [{ ...address, id: foreign.body.addresses[0].id }],
      [{ ...address, id: otherRecord.body.addresses[0].id }],
      [{ ...address, id: randomUUID() }],
      [
        { ...address, id },
        { ...address, id }
      ],
      [{ ...address, id, location: { stateCode: 'RJ', cityCode: '3509502' } }],
      [{ label: 'Sem endereço' }],
      Array.from({ length: 21 }, () => address)
    ]) {
      const failed = await request(app)
        .put(`/api/bizz/contacts/${created.body.id}`)
        .set(headers())
        .send(draft({ version: 1, addresses }));
      expect(failed.status).toBe(400);
      expect(
        (await request(app).get(`/api/bizz/contacts/${created.body.id}`).set(headers())).body
      ).toMatchObject({ version: 1, addresses: [{ id, street: address.street }] });
    }
    expect(
      (
        await request(app)
          .put(`/api/bizz/contacts/${created.body.id}`)
          .set(headers(token, otherCompanyId))
          .send(draft({ version: 1, addresses: [] }))
      ).status
    ).toBe(404);
  });
  it('keeps an unresolved legacy address while adding a new one and saving through the new format', async () => {
    const record = await prisma.bizzContact.create({
      data: {
        name: 'Cadastro antigo com endereço',
        companyId,
        createdById: userId,
        updatedById: userId,
        requestKey: randomUUID(),
        requestHash: 'legacy',
        city: 'Localidade antiga',
        state: 'Estado antigo',
        country: 'Brasil'
      }
    });
    const path = `/api/bizz/contacts/${record.id}`;
    const loaded = await request(app).get(path).set(headers());
    const { cityIbgeCode: _code, location: _location, ...old } = loaded.body.addresses[0];
    expect(loaded.body.addresses[0].location).toBeNull();
    const added = await request(app)
      .put(path)
      .set(headers())
      .send(
        draft({
          version: 1,
          addresses: [
            old,
            { street: 'Rua Nova', location: { stateCode: 'SP', cityCode: '3509502' } }
          ]
        })
      );
    expect(added.status).toBe(200);
    expect(added.body.addresses).toHaveLength(2);
    expect(added.body.addresses[0]).toMatchObject({
      id: old.id,
      city: record.city,
      state: record.state,
      country: record.country,
      location: null
    });
    expect(added.body.addresses[1]).toMatchObject({ street: 'Rua Nova', city: 'Campinas' });
    expect(await prisma.bizzContactAddress.count({ where: { contactId: record.id } })).toBe(2);
  });
});
