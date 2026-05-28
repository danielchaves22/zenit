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

  it('persists category nature and supports filtering by nature', async () => {
    const operationalResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria Operacional ${Date.now()}`,
        type: 'EXPENSE',
        color: '#2563EB',
        icon: 'wallet'
      });

    expect(operationalResponse.status).toBe(201);
    expect(operationalResponse.body.nature).toBe('OPERATIONAL');

    const conciliationResponse = await request(app)
      .post('/api/financial/categories')
      .set(authHeaders())
      .send({
        name: `Categoria Conciliacao ${Date.now()}`,
        type: 'EXPENSE',
        nature: 'CONCILIATION',
        color: '#F59E0B',
        icon: 'tag'
      });

    expect(conciliationResponse.status).toBe(201);
    expect(conciliationResponse.body.nature).toBe('CONCILIATION');

    const filteredResponse = await request(app)
      .get('/api/financial/categories')
      .set(authHeaders())
      .query({ nature: 'CONCILIATION' });

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body).toHaveLength(1);
    expect(filteredResponse.body[0].id).toBe(conciliationResponse.body.id);
    expect(filteredResponse.body[0].nature).toBe('CONCILIATION');
  });

  it('does not allow conciliation categories to become defaults', async () => {
    const conciliationCategory = await prisma.financialCategory.create({
      data: {
        name: `Categoria Conciliacao Default ${Date.now()}`,
        type: 'EXPENSE',
        nature: 'CONCILIATION',
        color: '#F59E0B',
        companyId
      }
    });

    const response = await request(app)
      .post(`/api/financial/categories/${conciliationCategory.id}/set-default`)
      .set(authHeaders());

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('operacionais');
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
