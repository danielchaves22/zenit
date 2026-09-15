import request from 'supertest';
import {
  AccountType,
  AppKey,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

describe('Monthly category budget', () => {
  let companyId: number;
  let otherCompanyId: number;
  let userId: number;
  let token: string;
  let parentCategoryId: number;
  let childCategoryId: number;
  let siblingCategoryId: number;
  let incomeCategoryId: number;
  let foreignCategoryId: number;
  let accountId: number;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': String(companyId),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const uniqueSuffix = String(Date.now()).slice(-7);
    const [company, otherCompany] = await Promise.all([
      prisma.company.create({
        data: { name: 'Monthly Budget Test', code: Number(`7${uniqueSuffix}`) }
      }),
      prisma.company.create({
        data: { name: 'Monthly Budget Foreign Test', code: Number(`8${uniqueSuffix}`) }
      })
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;

    const user = await prisma.user.create({
      data: {
        email: `monthly-budget-${Date.now()}@test.com`,
        password: 'test-hash',
        name: 'Monthly Budget Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    await prisma.userCompany.create({
      data: { userId, companyId, isDefault: true, role: 'ADMIN' }
    });

    const cashApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });
    await prisma.companyAppEntitlement.create({
      data: { companyId, appId: cashApp.id, enabled: true }
    });
    await prisma.userAppGrant.create({
      data: { userId, companyId, appId: cashApp.id, granted: true }
    });

    const parent = await prisma.financialCategory.create({
      data: {
        companyId,
        name: 'Transporte',
        type: TransactionType.EXPENSE,
        color: '#2563eb'
      }
    });
    parentCategoryId = parent.id;

    const [child, sibling, income, foreign] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          companyId,
          parentId: parent.id,
          name: 'Combustível',
          type: TransactionType.EXPENSE,
          color: '#f97316'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId,
          name: 'Lazer',
          type: TransactionType.EXPENSE,
          color: '#8b5cf6'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId,
          name: 'Salário',
          type: TransactionType.INCOME,
          color: '#10b981'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId: otherCompany.id,
          name: 'Categoria externa',
          type: TransactionType.EXPENSE,
          color: '#ef4444'
        }
      })
    ]);
    childCategoryId = child.id;
    siblingCategoryId = sibling.id;
    incomeCategoryId = income.id;
    foreignCategoryId = foreign.id;
    const account = await prisma.financialAccount.create({
      data: {
        companyId,
        name: 'Conta do planejamento mensal',
        type: AccountType.CHECKING,
        balance: 1000
      }
    });
    accountId = account.id;
    token = generateToken({ userId });
  });

  beforeEach(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.monthlyCategoryBudget.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.monthlyCategoryBudget.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId: otherCompanyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('saves and atomically replaces a company-scoped monthly plan', async () => {
    const month = currentMonthKey();
    const createResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month,
        allocations: [
          { categoryId: parentCategoryId, limitAmount: '500.00', includeChildren: true },
          { categoryId: siblingCategoryId, limitAmount: '250.00', includeChildren: true }
        ]
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.month).toBe(month);
    expect(createResponse.body.summary.plannedAmount).toBe('750.00');
    expect(createResponse.body.items).toHaveLength(2);

    const replaceResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month,
        allocations: [
          { categoryId: siblingCategoryId, limitAmount: '300.00', includeChildren: true }
        ]
      });

    expect(replaceResponse.status).toBe(200);
    expect(replaceResponse.body.summary.plannedAmount).toBe('300.00');
    expect(replaceResponse.body.items).toHaveLength(1);
    expect(replaceResponse.body.items[0].category.id).toBe(siblingCategoryId);

    const storedRows = await prisma.monthlyCategoryBudget.findMany({
      where: { companyId }
    });
    expect(storedRows).toHaveLength(1);
    expect(Number(storedRows[0].limitAmount)).toBe(300);

    const clearResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({ month, allocations: [] });

    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body.items).toEqual([]);
    await expect(
      prisma.monthlyCategoryBudget.count({ where: { companyId } })
    ).resolves.toBe(0);
  });

  it('rejects overlapping parent and child allocations', async () => {
    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month: currentMonthKey(),
        allocations: [
          { categoryId: parentCategoryId, limitAmount: '500.00', includeChildren: true },
          { categoryId: childCategoryId, limitAmount: '200.00', includeChildren: true }
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('cobrem os mesmos gastos');
  });

  it('aggregates child expenses into the parent limit and distinguishes realized from committed', async () => {
    const today = new Date();
    await prisma.financialTransaction.createMany({
      data: [
        {
          companyId,
          createdBy: userId,
          description: 'Abastecimento pago',
          amount: 100,
          date: today,
          effectiveDate: today,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          fromAccountId: accountId,
          categoryId: childCategoryId
        },
        {
          companyId,
          createdBy: userId,
          description: 'Abastecimento pendente',
          amount: 50,
          date: today,
          dueDate: today,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.PENDING,
          fromAccountId: accountId,
          categoryId: childCategoryId
        }
      ]
    });

    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month: currentMonthKey(),
        allocations: [
          { categoryId: parentCategoryId, limitAmount: '120.00', includeChildren: true }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      realizedAmount: '100.00',
      committedAmount: '50.00',
      forecastAmount: '150.00',
      remainingAmount: '-30.00',
      status: 'EXCEEDED'
    });
  });

  it.each([
    ['income category', () => incomeCategoryId],
    ['category from another company', () => foreignCategoryId]
  ])('rejects an invalid %s', async (_label, resolveCategoryId) => {
    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month: currentMonthKey(),
        allocations: [
          { categoryId: resolveCategoryId(), limitAmount: '100.00', includeChildren: true }
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('não pertencem a esta empresa');
  });
});
