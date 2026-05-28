import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Financial categories', () => {
  let companyId: number;
  let userId: number;
  let token: string;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const companyCode = Number(`8${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Financial Category Test',
        code: companyCode
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `financial-category-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Financial Category Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    await prisma.userCompany.create({
      data: {
        userId,
        companyId,
        isDefault: true,
        role: 'ADMIN',
        manageFinancialAccounts: true,
        manageFinancialCategories: true
      }
    });

    const ecosystemApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.companyAppEntitlement.upsert({
      where: {
        unique_company_app_entitlement: {
          companyId,
          appId: ecosystemApp.id
        }
      },
      update: { enabled: true },
      create: { companyId, appId: ecosystemApp.id, enabled: true }
    });

    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId,
          companyId,
          appId: ecosystemApp.id
        }
      },
      update: { granted: true },
      create: { userId, companyId, appId: ecosystemApp.id, granted: true }
    });

    token = generateToken({ userId });
  });

  beforeEach(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates multiple non-default categories of the same type', async () => {
    const firstResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria A ${Date.now()}`,
        type: 'EXPENSE',
        color: '#6366F1',
        icon: 'car',
        parentId: null,
        accountingCode: ''
      });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.isDefault).toBe(false);
    expect(firstResponse.body.icon).toBe('car');

    const secondResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria B ${Date.now()}`,
        type: 'EXPENSE',
        color: '#22C55E',
        icon: 'receipt',
        parentId: null,
        accountingCode: ''
      });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.isDefault).toBe(false);
    expect(secondResponse.body.icon).toBe('receipt');

    const storedCategories = await prisma.financialCategory.findMany({
      where: { companyId, type: 'EXPENSE' },
      orderBy: { id: 'asc' }
    });

    expect(storedCategories).toHaveLength(2);
    expect(storedCategories.every((category) => category.isDefault === false)).toBe(true);
    expect(storedCategories.map((category) => category.icon)).toEqual(['car', 'receipt']);
  });

  it('creates categories without nature metadata and supports filtering by type', async () => {
    const expenseResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria Despesa ${Date.now()}`,
        type: 'EXPENSE',
        color: '#2563EB',
        icon: 'wallet'
      });

    expect(expenseResponse.status).toBe(201);
    expect(expenseResponse.body).not.toHaveProperty('nature');

    const incomeResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria Receita ${Date.now()}`,
        type: 'INCOME',
        color: '#22C55E',
        icon: 'coins'
      });

    expect(incomeResponse.status).toBe(201);
    expect(incomeResponse.body).not.toHaveProperty('nature');

    const filteredResponse = await request(app)
      .get('/api/financial/categories')
      .set(authHeaders())
      .query({ type: 'EXPENSE' });

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body).toHaveLength(1);
    expect(filteredResponse.body[0].id).toBe(expenseResponse.body.id);
    expect(filteredResponse.body[0].type).toBe('EXPENSE');
  });

  it('keeps a single default category per type when switching the default', async () => {
    const firstCategory = await prisma.financialCategory.create({
      data: {
        name: `Categoria Default A ${Date.now()}`,
        type: 'EXPENSE',
        color: '#6366F1',
        companyId
      }
    });

    const secondCategory = await prisma.financialCategory.create({
      data: {
        name: `Categoria Default B ${Date.now()}`,
        type: 'EXPENSE',
        color: '#22C55E',
        companyId
      }
    });

    const firstSetDefaultResponse = await request(app)
      .post(`/api/financial/categories/${firstCategory.id}/set-default`)
      .set(authHeaders());

    expect(firstSetDefaultResponse.status).toBe(200);

    const secondSetDefaultResponse = await request(app)
      .post(`/api/financial/categories/${secondCategory.id}/set-default`)
      .set(authHeaders());

    expect(secondSetDefaultResponse.status).toBe(200);

    const storedCategories = await prisma.financialCategory.findMany({
      where: { companyId, type: 'EXPENSE' },
      orderBy: { id: 'asc' }
    });

    expect(storedCategories.find((category) => category.id === firstCategory.id)?.isDefault).toBe(
      false
    );
    expect(
      storedCategories.find((category) => category.id === secondCategory.id)?.isDefault
    ).toBe(true);
    expect(storedCategories.filter((category) => category.isDefault)).toHaveLength(1);
  });
});
