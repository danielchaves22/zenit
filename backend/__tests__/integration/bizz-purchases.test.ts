import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
describe('Bizz purchases and shared Cash installments', () => {
  let companyId: number,
    otherCompanyId: number,
    userId: number,
    deniedId: number,
    accountId: number,
    otherAccountId: number,
    categoryId: number;
  let token: string, deniedToken: string, supplierId: string, itemId: string, otherItemId: string;
  const headers = (company = companyId, auth = token, key = 'zenit-bizz') => ({
    Authorization: `Bearer ${auth}`,
    'X-Company-Id': String(company),
    'X-App-Key': key
  });
  const draft = (extra = {}) => ({
    requestKey: randomUUID(),
    supplierId,
    date: '2026-10-13',
    items: [{ catalogItemId: itemId, quantity: '1', unitPrice: '100.00' }],
    fromAccountId: accountId,
    categoryId,
    installmentCount: 3,
    firstDueDate: '2028-01-31',
    ...extra
  });
  const create = async (extra = {}) =>
    (await request(app).post('/api/bizz/purchases').set(headers()).send(draft(extra)).expect(201))
      .body;
  const pay = (purchase: any, extra = {}) => ({
    requestKey: randomUUID(),
    expectedUpdatedAt: purchase.installments[0].updatedAt,
    amount: purchase.installments[0].amount,
    fromAccountId: accountId,
    effectiveDate: '2026-10-13',
    ...extra
  });
  const settle = (purchase: any, body: any) =>
    request(app)
      .post(`/api/bizz/purchases/${purchase.id}/installments/${purchase.installments[0].id}/settle`)
      .set(headers())
      .send(body);
  beforeAll(async () => {
    const max = await prisma.company.aggregate({ _max: { code: true } });
    companyId = (
      await prisma.company.create({
        data: { code: (max._max.code ?? 0) + 1, name: 'Compras teste' }
      })
    ).id;
    otherCompanyId = (
      await prisma.company.create({
        data: { code: (max._max.code ?? 0) + 2, name: 'Outras compras teste' }
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Comprador',
          email: `buyer-${randomUUID()}@example.test`,
          password: 'not-a-login-hash',
          mustChangePassword: false
        }
      })
    ).id;
    deniedId = (
      await prisma.user.create({
        data: {
          name: 'Consulta',
          email: `buyer-denied-${randomUUID()}@example.test`,
          password: 'not-a-login-hash',
          mustChangePassword: false
        }
      })
    ).id;
    await prisma.userCompany.createMany({
      data: [
        { userId, companyId, role: 'USER' },
        { userId, companyId: otherCompanyId, role: 'SUPERUSER' },
        { userId: deniedId, companyId, role: 'USER' }
      ]
    });
    for (const id of [companyId, otherCompanyId]) {
      await AppAccessService.setCompanyEntitlements(id, [
        { appKey: AppKey.ZENIT_BIZZ, enabled: true },
        { appKey: AppKey.ZENIT_CASH, enabled: true }
      ]);
      await AppAccessService.setUserGrants(userId, id, [
        { appKey: AppKey.ZENIT_BIZZ, granted: true }
      ]);
    }
    await AppAccessService.setUserGrants(deniedId, companyId, [
      { appKey: AppKey.ZENIT_BIZZ, granted: true }
    ]);
    supplierId = (
      await prisma.bizzContact.create({
        data: {
          companyId,
          name: 'Flores do teste',
          isSupplier: true,
          requestKey: randomUUID(),
          requestHash: 'test',
          createdById: userId,
          updatedById: userId
        }
      })
    ).id;
    for (const id of [companyId, otherCompanyId]) {
      const item = await prisma.bizzCatalogItem.create({
        data: {
          companyId: id,
          name: 'Rosa',
          kind: 'PRODUCT',
          unit: 'Unidade',
          canPurchase: true,
          canSell: true,
          requestKey: randomUUID(),
          requestHash: 'test',
          createdById: userId,
          updatedById: userId
        }
      });
      if (id === companyId) itemId = item.id;
      else otherItemId = item.id;
    }
    accountId = (
      await prisma.financialAccount.create({
        data: { companyId, name: 'Conta de compras', type: 'CHECKING', balance: '1000.00' }
      })
    ).id;
    otherAccountId = (
      await prisma.financialAccount.create({
        data: {
          companyId: otherCompanyId,
          name: 'Outra conta',
          type: 'CHECKING',
          balance: '1000.00'
        }
      })
    ).id;
    categoryId = (
      await prisma.financialCategory.create({
        data: { companyId, name: 'Compras', type: 'EXPENSE' }
      })
    ).id;
    await prisma.userFinancialAccountAccess.create({
      data: { userId, companyId, financialAccountId: accountId, grantedBy: userId }
    });
    token = generateToken({ userId });
    deniedToken = generateToken({ userId: deniedId });
  });
  afterAll(async () => {
    const ids = [companyId, otherCompanyId].filter(Boolean);
    await prisma.bizzPurchasePayment.deleteMany({
      where: { purchase: { companyId: { in: ids } } }
    });
    await prisma.financialTransaction.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.installmentPlan.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.bizzPurchase.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.bizzCatalogItem.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.bizzContact.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.userFinancialAccountAccess.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.financialCategory.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.financialAccount.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.userCompany.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, deniedId].filter(Boolean) } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it('creates exactly one financial plan on concurrent retries, distributes cents and clamps dates', async () => {
    const body = draft();
    const before = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const results = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/bizz/purchases').set(headers()).send(body))
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 200, 201]);
    const purchase = results[0].body;
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    expect(purchase.installments.map((item: any) => item.amount)).toEqual([
      '33.33',
      '33.33',
      '33.34'
    ]);
    expect(purchase.installments.map((item: any) => item.dueDate)).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31'
    ]);
    expect(
      await prisma.financialTransaction.count({ where: { bizzPurchaseId: purchase.id } })
    ).toBe(3);
    expect(
      (await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.eq(
        before.balance
      )
    ).toBe(true);
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers())
      .send({ ...body, installmentCount: 2 })
      .expect(409);
  });
  it('keeps financial access scoped without requiring a Cash app grant', async () => {
    await request(app).get('/api/bizz/purchases').expect(401);
    await request(app).get('/api/financial/transactions').set(headers()).expect(403);
    await request(app)
      .get('/api/financial/transactions')
      .set(headers(companyId, token, 'zenit-cash'))
      .expect(403);
    const options = await request(app)
      .get('/api/bizz/purchases/options')
      .set(headers())
      .expect(200);
    expect(options.body.accounts.map((item: any) => item.id)).toEqual([accountId]);
    expect(options.body.accounts[0]).not.toHaveProperty('balance');
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers(companyId, deniedToken))
      .send(draft())
      .expect(403);
    const purchase = await create();
    const read = await request(app)
      .get(`/api/bizz/purchases/${purchase.id}`)
      .set(headers(companyId, deniedToken))
      .expect(200);
    expect(read.body.installments[0]).toMatchObject({ canSettle: false, account: null });
    await request(app)
      .post(`/api/bizz/purchases/${purchase.id}/installments/${purchase.installments[0].id}/settle`)
      .set(headers(companyId, deniedToken))
      .send(pay(purchase))
      .expect(403);
    await request(app)
      .get(`/api/bizz/purchases/${purchase.id}`)
      .set(headers(otherCompanyId))
      .expect(404);
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers())
      .send(draft({ fromAccountId: otherAccountId }))
      .expect(403);
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers())
      .send(draft({ items: [{ catalogItemId: otherItemId, quantity: '1', unitPrice: '5' }] }))
      .expect(400);
  });
  it('settles only once under concurrent retries and preserves the purchase value on discount', async () => {
    const purchase = await create();
    const before = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const body = pay(purchase, { amount: '30.00' });
    const results = await Promise.all([
      settle(purchase, body),
      settle(purchase, body),
      settle(purchase, body)
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    expect(results[0].body).toMatchObject({ total: '100.00', paidCount: 1 });
    expect(results[0].body.installments[0]).toMatchObject({
      amount: '33.33',
      paidAmount: '30.00',
      status: 'COMPLETED'
    });
    const stored = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id: purchase.installments[0].id }
    });
    expect(stored.amount.toFixed(2)).toBe('30.00');
    expect(stored.originalAmount?.toFixed(2)).toBe('33.33');
    expect(
      (await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.eq(
        before.balance.minus(30)
      )
    ).toBe(true);
    await settle(purchase, pay(purchase)).expect(409);
    await settle(purchase, { ...body, amount: '31.00' }).expect(409);
    await request(app)
      .post(`/api/bizz/purchases/${purchase.id}/cancel`)
      .set(headers())
      .send({})
      .expect(409);
  });
  it('rejects stale payment data and cross-purchase installment IDs', async () => {
    const purchase = await create();
    const another = await create();
    await settle(purchase, pay(purchase, { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })).expect(
      409
    );
    await request(app)
      .post(`/api/bizz/purchases/${another.id}/installments/${purchase.installments[0].id}/settle`)
      .set(headers())
      .send(pay(purchase))
      .expect(404);
    await settle(purchase, pay(purchase, { fromAccountId: otherAccountId })).expect(403);
  });
  it('cancels only wholly unpaid purchases atomically and blocks later payments', async () => {
    const purchase = await create();
    const result = await request(app)
      .post(`/api/bizz/purchases/${purchase.id}/cancel`)
      .set(headers())
      .send({})
      .expect(200);
    expect(result.body.status).toBe('CANCELED');
    expect(result.body.installments.every((item: any) => item.status === 'CANCELED')).toBe(true);
    await request(app)
      .post(`/api/bizz/purchases/${purchase.id}/cancel`)
      .set(headers())
      .send({})
      .expect(200);
    await settle(purchase, pay(purchase)).expect(409);
  });
  it('validates values and references before persisting a purchase', async () => {
    const count = await prisma.bizzPurchase.count({ where: { companyId } });
    for (const unitPrice of ['NaN', '0', '-1', '2.999', 'abc'])
      await request(app)
        .post('/api/bizz/purchases')
        .set(headers())
        .send(draft({ items: [{ catalogItemId: itemId, quantity: '1', unitPrice }] }))
        .expect(400);
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers())
      .send(draft({ firstDueDate: '2027-02-29' }))
      .expect(400);
    await request(app)
      .post('/api/bizz/purchases')
      .set(headers())
      .send(draft({ categoryId: 2147483647 }))
      .expect(400);
    expect(await prisma.bizzPurchase.count({ where: { companyId } })).toBe(count);
    const rounded = await create({
      installmentCount: 1,
      items: [{ catalogItemId: itemId, quantity: '0.125', unitPrice: '0.04' }]
    });
    expect(rounded.total).toBe('0.01');
    await prisma.bizzCatalogItem.update({ where: { id: itemId }, data: { name: 'Nome alterado' } });
    expect(
      (await request(app).get(`/api/bizz/purchases/${rounded.id}`).set(headers()).expect(200)).body
        .items[0].name
    ).toBe('Rosa');
  });
  it('honors company enablement and disabled/revoked account access', async () => {
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: false }
    ]);
    await request(app).post('/api/bizz/purchases').set(headers()).send(draft()).expect(403);
    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true }
    ]);
    const purchase = await create();
    await prisma.financialAccount.update({ where: { id: accountId }, data: { isActive: false } });
    await settle(purchase, pay(purchase)).expect(403);
    await prisma.financialAccount.update({ where: { id: accountId }, data: { isActive: true } });
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await request(app).post('/api/bizz/purchases').set(headers()).send(draft()).expect(403);
    await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  });
  it('rolls back a failed payment without writing a receipt or affecting the purchase', async () => {
    const purchase = await create({
      items: [{ catalogItemId: itemId, quantity: '1', unitPrice: '100000.00' }],
      installmentCount: 1
    });
    const before = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const result = await settle(purchase, pay(purchase));
    expect(result.status).toBe(400);
    expect(await prisma.bizzPurchasePayment.count({ where: { purchaseId: purchase.id } })).toBe(0);
    expect(
      (await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.eq(
        before.balance
      )
    ).toBe(true);
    expect(
      (
        await prisma.financialTransaction.findUniqueOrThrow({
          where: { id: purchase.installments[0].id }
        })
      ).status
    ).toBe('PENDING');
  });
  it('serializes cancellation against settlement without partial changes', async () => {
    const purchase = await create({ installmentCount: 1 });
    const before = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const results = await Promise.all([
      settle(purchase, pay(purchase)),
      request(app).post(`/api/bizz/purchases/${purchase.id}/cancel`).set(headers()).send({})
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const stored = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id: purchase.installments[0].id }
    });
    const after = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const canceled = await prisma.bizzPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(after.balance.toFixed(2)).toBe(
      before.balance.minus(stored.status === 'COMPLETED' ? 100 : 0).toFixed(2)
    );
    expect(Boolean(canceled.canceledAt)).toBe(stored.status === 'CANCELED');
  });
  it('uses the same records when paid from Cash and prevents commercial edits, archive and deletion', async () => {
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }
    ]);
    const cash = headers(companyId, token, 'zenit-cash');
    const purchase = await create({ installmentCount: 1 });
    const id = purchase.installments[0].id;
    const path = `/api/financial/transactions/${id}`;
    await request(app).put(path).set(cash).send({ amount: 101 }).expect(400);
    await request(app).put(path).set(cash).send({ status: 'CANCELED' }).expect(400);
    await request(app).delete(path).set(cash).expect(400);
    await request(app).patch(`${path}/archive`).set(cash).send({}).expect(400);
    const original = await prisma.financialTransaction.findUniqueOrThrow({ where: { id } });
    await request(app)
      .put(path)
      .set(cash)
      .send({
        status: 'COMPLETED',
        effectiveDate: '2026-10-13T12:00:00.000Z',
        amount: 95,
        date: '2026-10-13',
        description: original.description,
        type: 'EXPENSE',
        fromAccountId: accountId,
        toAccountId: null,
        categoryId,
        installmentNumber: 1,
        totalInstallments: 1
      })
      .expect(200);
    const read = (
      await request(app).get(`/api/bizz/purchases/${purchase.id}`).set(headers()).expect(200)
    ).body;
    expect(read).toMatchObject({ status: 'PAID', total: '100.00', paidCount: 1 });
    expect(read.installments[0]).toMatchObject({ paidAmount: '95.00', amount: '100.00' });
    await settle(purchase, pay(purchase)).expect(409);
    await request(app).put(path).set(cash).send({ status: 'PENDING' }).expect(400);
    await request(app).put(path).set(cash).send({ amount: 90 }).expect(400);
  });
});
