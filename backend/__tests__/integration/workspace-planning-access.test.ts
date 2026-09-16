import request from 'supertest';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Workspace planning authorization', () => {
  let companyId: number;
  let adminUserId: number;
  let regularUserId: number;
  let adminToken: string;
  let regularToken: string;

  function headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'X-Company-Id': String(companyId),
      [APP_KEY_HEADER]: APP_KEY_VALUE
    };
  }

  beforeAll(async () => {
    const suffix = String(Date.now()).slice(-7);
    const company = await prisma.company.create({
      data: { name: 'Workspace Planning Access Test', code: Number(`4${suffix}`) }
    });
    companyId = company.id;

    const [admin, regular] = await Promise.all([
      prisma.user.create({
        data: {
          email: `planning-admin-${Date.now()}@test.com`,
          password: 'test-hash',
          name: 'Planning Admin',
          role: 'ADMIN'
        }
      }),
      prisma.user.create({
        data: {
          email: `planning-reader-${Date.now()}@test.com`,
          password: 'test-hash',
          name: 'Planning Reader',
          role: 'USER'
        }
      })
    ]);
    adminUserId = admin.id;
    regularUserId = regular.id;
    adminToken = generateToken({ userId: admin.id });
    regularToken = generateToken({ userId: regular.id });

    await prisma.userCompany.createMany({
      data: [
        { userId: admin.id, companyId, isDefault: true, role: 'ADMIN' },
        { userId: regular.id, companyId, isDefault: true, role: 'USER' }
      ]
    });

    const cashApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });
    await prisma.companyAppEntitlement.create({
      data: { companyId, appId: cashApp.id, enabled: true }
    });
    await prisma.userAppGrant.createMany({
      data: [
        { userId: admin.id, companyId, appId: cashApp.id, granted: true },
        { userId: regular.id, companyId, appId: cashApp.id, granted: true }
      ]
    });
  });

  afterAll(async () => {
    await prisma.userAppGrant.deleteMany({ where: { companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, regularUserId] } } });
    await prisma.$disconnect();
  });

  it('allows workspace members to read and exposes their effective capabilities', async () => {
    const [monthly, provisions] = await Promise.all([
      request(app)
        .get('/api/financial/budgets/monthly?month=2026-09')
        .set(headers(regularToken)),
      request(app).get('/api/financial/budgets/provisions').set(headers(regularToken))
    ]);

    expect(monthly.status).toBe(200);
    expect(monthly.body.access).toEqual({ canRead: true, canManage: false });
    expect(provisions.status).toBe(200);
    expect(provisions.body.access).toEqual({ canRead: true, canManage: false });

    const adminMonthly = await request(app)
      .get('/api/financial/budgets/monthly?month=2026-09')
      .set(headers(adminToken));
    expect(adminMonthly.status).toBe(200);
    expect(adminMonthly.body.access).toEqual({ canRead: true, canManage: true });
  });

  it.each([
    ['put', '/api/financial/budgets/monthly'],
    ['post', '/api/financial/budgets/monthly/items'],
    ['post', '/api/financial/budgets/monthly/recurring/1/end'],
    ['post', '/api/financial/budgets/provisions'],
    ['put', '/api/financial/budgets/provisions/1'],
    ['post', '/api/financial/budgets/provisions/1/entries'],
    ['post', '/api/financial/budgets/provisions/1/use'],
    ['post', '/api/financial/budgets/provisions/1/cancel']
  ] as const)('rejects ordinary member management through %s %s', async (method, path) => {
    const response = await request(app)[method](path).set(headers(regularToken)).send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('WORKSPACE_PLANNING_MANAGEMENT_FORBIDDEN');
  });
});
