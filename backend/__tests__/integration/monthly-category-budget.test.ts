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
import MonthlyCategoryBudgetService from '../../src/services/monthly-category-budget.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthDate(monthKey: string, offset: number, day = 10): Date {
  const [year, month] = addMonths(monthKey, offset).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
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
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
    await prisma.monthlyCategoryBudget.deleteMany({ where: { companyId } });
    await prisma.recurringMonthlyCategoryBudget.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
    await prisma.monthlyCategoryBudget.deleteMany({ where: { companyId } });
    await prisma.recurringMonthlyCategoryBudget.deleteMany({ where: { companyId } });
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

  it('uses the workspace timezone to validate the current planning month', async () => {
    const boundaryInstant = new Date('2026-01-01T02:30:00.000Z');
    await prisma.company.update({
      where: { id: companyId },
      data: { timeZone: 'America/Sao_Paulo' }
    });

    try {
      await MonthlyCategoryBudgetService.createPlanning({
        companyId,
        month: '2025-12',
        categoryId: siblingCategoryId,
        limitAmount: '150.00',
        includeChildren: true,
        kind: 'ONE_TIME',
        at: boundaryInstant
      });

      const saved = await prisma.monthlyCategoryBudget.findFirstOrThrow({
        where: { companyId, categoryId: siblingCategoryId }
      });
      expect(saved.referenceMonth.toISOString()).toBe('2025-12-01T12:00:00.000Z');

      await expect(
        MonthlyCategoryBudgetService.replacePlan({
          companyId,
          month: '2025-11',
          allocations: [],
          at: boundaryInstant
        })
      ).rejects.toThrow('O planejamento não pode alterar meses anteriores');

      const plan = await MonthlyCategoryBudgetService.getPlan({
        companyId,
        userId,
        month: '2025-12',
        at: boundaryInstant
      });
      expect(plan.statsAvailable).toBe(true);
    } finally {
      await prisma.company.update({
        where: { id: companyId },
        data: { timeZone: null }
      });
    }
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

  it('preserves an explicit zero limit as a tracked no-spend category', async () => {
    const month = currentMonthKey();
    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month,
        allocations: [
          { categoryId: siblingCategoryId, limitAmount: '0.00', includeChildren: false }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.summary.plannedAmount).toBe('0.00');
    expect(response.body.items).toEqual([
      expect.objectContaining({
        category: expect.objectContaining({ id: siblingCategoryId }),
        limitAmount: '0.00',
        includeChildren: false,
        origin: 'ONE_TIME'
      })
    ]);
    const stored = await prisma.monthlyCategoryBudget.findFirstOrThrow({
      where: { companyId, categoryId: siblingCategoryId }
    });
    expect(stored.isExcluded).toBe(false);
    expect(stored.limitAmount.toFixed(2)).toBe('0.00');
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

  it('projects a fixed monthly planning virtually into future months', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    const createResponse = await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month,
        categoryId: siblingCategoryId,
        limitAmount: '400.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_MONTHLY',
      limitAmount: '400.00',
      recurrenceStartMonth: month
    });
    expect(createResponse.body.items[0].recurringBudgetId).toEqual(expect.any(Number));

    const futureResponse = await request(app)
      .get('/api/financial/budgets/monthly')
      .query({ month: nextMonth })
      .set(authHeaders());

    expect(futureResponse.status).toBe(200);
    expect(futureResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_MONTHLY',
      limitAmount: '400.00',
      monthlyBudgetId: null
    });
    await expect(
      prisma.monthlyCategoryBudget.count({ where: { companyId } })
    ).resolves.toBe(0);
  });

  it('keeps a fixed monthly adjustment restricted to the selected month', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month,
        categoryId: siblingCategoryId,
        limitAmount: '400.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });

    const overrideResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month,
        allocations: [
          {
            categoryId: siblingCategoryId,
            limitAmount: '550.00',
            includeChildren: true,
            recurringChangeScope: 'MONTH_ONLY'
          }
        ]
      });

    expect(overrideResponse.status).toBe(200);
    expect(overrideResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_OVERRIDE',
      limitAmount: '550.00',
      baseLimitAmount: '400.00'
    });

    const futureResponse = await request(app)
      .get('/api/financial/budgets/monthly')
      .query({ month: nextMonth })
      .set(authHeaders());
    expect(futureResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_MONTHLY',
      limitAmount: '400.00'
    });
  });

  it('removes a fixed planning only from the selected month when replacing that month', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month,
        categoryId: siblingCategoryId,
        limitAmount: '400.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });

    const removeResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({ month, allocations: [] });
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.items).toEqual([]);

    const futureResponse = await request(app)
      .get('/api/financial/budgets/monthly')
      .query({ month: nextMonth })
      .set(authHeaders());
    expect(futureResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_MONTHLY',
      limitAmount: '400.00'
    });
  });

  it('changes a fixed monthly planning from a selected future month onward', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    const followingMonth = addMonths(month, 2);
    await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month,
        categoryId: siblingCategoryId,
        limitAmount: '400.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });

    const changeResponse = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month: nextMonth,
        allocations: [
          {
            categoryId: siblingCategoryId,
            limitAmount: '600.00',
            includeChildren: true,
            recurringChangeScope: 'FROM_MONTH'
          }
        ]
      });

    expect(changeResponse.status).toBe(200);
    expect(changeResponse.body.items[0]).toMatchObject({
      origin: 'FIXED_MONTHLY',
      limitAmount: '600.00',
      recurrenceStartMonth: nextMonth
    });

    const [originalResponse, followingResponse] = await Promise.all([
      request(app).get('/api/financial/budgets/monthly').query({ month }).set(authHeaders()),
      request(app)
        .get('/api/financial/budgets/monthly')
        .query({ month: followingMonth })
        .set(authHeaders())
    ]);
    expect(originalResponse.body.items[0].limitAmount).toBe('400.00');
    expect(followingResponse.body.items[0].limitAmount).toBe('600.00');
  });

  it('creates a one-time planning only in the selected future month', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    const createResponse = await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month: nextMonth,
        categoryId: siblingCategoryId,
        limitAmount: '250.00',
        includeChildren: true,
        kind: 'ONE_TIME'
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.items[0]).toMatchObject({
      origin: 'ONE_TIME',
      limitAmount: '250.00',
      recurringBudgetId: null
    });

    const currentResponse = await request(app)
      .get('/api/financial/budgets/monthly')
      .query({ month })
      .set(authHeaders());
    expect(currentResponse.body.items).toEqual([]);
  });

  it('ends a fixed planning from the selected month without changing prior months', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    const createResponse = await request(app)
      .post('/api/financial/budgets/monthly/items')
      .set(authHeaders())
      .send({
        month,
        categoryId: siblingCategoryId,
        limitAmount: '400.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });
    const recurringBudgetId = createResponse.body.items[0].recurringBudgetId;

    const endResponse = await request(app)
      .post(`/api/financial/budgets/monthly/recurring/${recurringBudgetId}/end`)
      .set(authHeaders())
      .send({ month: nextMonth });

    expect(endResponse.status).toBe(200);
    expect(endResponse.body.items).toEqual([]);
    const currentResponse = await request(app)
      .get('/api/financial/budgets/monthly')
      .query({ month })
      .set(authHeaders());
    expect(currentResponse.body.items[0].limitAmount).toBe('400.00');
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

  it('uses the canonical fixed projection as a category commitment', async () => {
    const month = currentMonthKey();
    const nextMonth = addMonths(month, 1);
    await prisma.recurringTransaction.create({
      data: {
        companyId,
        createdBy: userId,
        description: 'Combustível fixo projetado',
        amount: 30,
        type: TransactionType.EXPENSE,
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        startDate: monthDate(month, -1),
        nextDueDate: monthDate(nextMonth, 0),
        isActive: true,
        fromAccountId: accountId,
        categoryId: childCategoryId
      }
    });

    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month: nextMonth,
        allocations: [
          { categoryId: parentCategoryId, limitAmount: '120.00', includeChildren: true }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      realizedAmount: '0.00',
      committedAmount: '30.00',
      forecastAmount: '30.00',
      remainingAmount: '90.00',
      status: 'ON_TRACK'
    });
    const savedBefore = await prisma.monthlyCategoryBudget.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
    const scenario = await request(app).post('/api/financial/dashboard/forecast').set(authHeaders()).send({
      month: nextMonth, sources: { fixed: false, other: false, cards: false, variable: true },
      overrides: { [`ACCOUNT:${childCategoryId}`]: '999.00' }, includeOverdue: true
    });
    expect(scenario.status).toBe(200);
    expect(scenario.body.transactions.every((item: { included: boolean }) => !item.included)).toBe(true);
    expect(await prisma.monthlyCategoryBudget.findMany({ where: { companyId }, orderBy: { id: 'asc' } })).toEqual(savedBefore);
    const afterScenario = await request(app).get('/api/financial/budgets/monthly').set(authHeaders()).query({ month: nextMonth });
    expect(afterScenario.status).toBe(200);
    expect(afterScenario.body).toEqual(response.body);
  });

  it('uses only settled history when calculating the category forecast average', async () => {
    const month = currentMonthKey();
    const historicalTransactions = [];

    for (let offset = 1; offset <= 6; offset += 1) {
      const historicalDate = monthDate(month, -offset);
      historicalTransactions.push(
        {
          companyId,
          createdBy: userId,
          description: `Lazer liquidado ${offset}`,
          amount: 100,
          date: historicalDate,
          effectiveDate: historicalDate,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          fromAccountId: accountId,
          categoryId: siblingCategoryId
        },
        {
          companyId,
          createdBy: userId,
          description: `Lazer pendente ${offset}`,
          amount: 500,
          date: historicalDate,
          dueDate: historicalDate,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.PENDING,
          fromAccountId: accountId,
          categoryId: siblingCategoryId
        }
      );
    }

    await prisma.financialTransaction.createMany({
      data: historicalTransactions
    });

    const response = await request(app)
      .put('/api/financial/budgets/monthly')
      .set(authHeaders())
      .send({
        month,
        allocations: [
          { categoryId: siblingCategoryId, limitAmount: '150.00', includeChildren: true }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      historicalAverageAmount: '100.00',
      forecastAmount: '100.00',
      status: 'ON_TRACK'
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
