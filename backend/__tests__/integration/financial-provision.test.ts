import request from 'supertest';
import { AppKey, PrismaClient, TransactionType } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function currentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function targetDateKey(monthOffset = 3): string {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() + monthOffset, 15, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`;
}

function todayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

describe('Financial provisions', () => {
  let companyId: number;
  let otherCompanyId: number;
  let userId: number;
  let token: string;
  let expenseCategoryId: number;
  let incomeCategoryId: number;
  let foreignCategoryId: number;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': String(companyId),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const suffix = String(Date.now()).slice(-7);
    const [company, otherCompany] = await Promise.all([
      prisma.company.create({
        data: { name: 'Financial Provision Test', code: Number(`5${suffix}`) }
      }),
      prisma.company.create({
        data: { name: 'Financial Provision Foreign Test', code: Number(`6${suffix}`) }
      })
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;

    const user = await prisma.user.create({
      data: {
        email: `financial-provision-${Date.now()}@test.com`,
        password: 'test-hash',
        name: 'Financial Provision Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;
    token = generateToken({ userId });

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

    const [expense, income, foreign] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          companyId,
          name: 'Despesas anuais',
          type: TransactionType.EXPENSE,
          color: '#8b5cf6'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId,
          name: 'Receitas provisão',
          type: TransactionType.INCOME,
          color: '#10b981'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId: otherCompanyId,
          name: 'Despesa externa',
          type: TransactionType.EXPENSE,
          color: '#ef4444'
        }
      })
    ]);
    expenseCategoryId = expense.id;
    incomeCategoryId = income.id;
    foreignCategoryId = foreign.id;
  });

  beforeEach(async () => {
    await prisma.financialProvisionEntry.deleteMany({
      where: { provision: { companyId } }
    });
    await prisma.financialProvision.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialProvisionEntry.deleteMany({
      where: { provision: { companyId } }
    });
    await prisma.financialProvision.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } }
    });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createProvision(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/financial/budgets/provisions')
      .set(authHeaders())
      .send({
        name: 'IPVA',
        categoryId: expenseCategoryId,
        kind: 'ONE_TIME',
        expectedAmount: '1200.00',
        initialReservedAmount: '200.00',
        startMonth: currentMonthKey(),
        targetDate: targetDateKey(),
        notes: 'Reserva para o imposto',
        ...overrides
      });
  }

  it('creates and lists a company-scoped provision with its initial balance', async () => {
    const createResponse = await createProvision();

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: 'IPVA',
      kind: 'ONE_TIME',
      status: 'ACTIVE',
      state: 'IN_PROGRESS',
      expectedAmount: '1200.00',
      reservedAmount: '200.00',
      remainingAmount: '1000.00',
      category: { id: expenseCategoryId }
    });
    expect(createResponse.body.entries[0]).toMatchObject({
      type: 'INITIAL_BALANCE',
      amount: '200.00',
      reservedAmountChange: '200.00'
    });

    const listResponse = await request(app)
      .get('/api/financial/budgets/provisions')
      .set(authHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.summary).toMatchObject({
      activeCount: 1,
      expectedAmount: '1200.00',
      reservedAmount: '200.00',
      remainingAmount: '1000.00'
    });
    expect(listResponse.body.items).toHaveLength(1);
  });

  it('records contributions and withdrawals without allowing a negative reserved amount', async () => {
    const provisionId = (await createProvision()).body.id;

    const contribution = await request(app)
      .post(`/api/financial/budgets/provisions/${provisionId}/entries`)
      .set(authHeaders())
      .send({ type: 'CONTRIBUTION', amount: '100.00', occurredAt: todayKey() });
    expect(contribution.status).toBe(201);
    expect(contribution.body.reservedAmount).toBe('300.00');

    const withdrawal = await request(app)
      .post(`/api/financial/budgets/provisions/${provisionId}/entries`)
      .set(authHeaders())
      .send({ type: 'WITHDRAWAL', amount: '50.00', occurredAt: todayKey() });
    expect(withdrawal.status).toBe(201);
    expect(withdrawal.body.reservedAmount).toBe('250.00');

    const invalidWithdrawal = await request(app)
      .post(`/api/financial/budgets/provisions/${provisionId}/entries`)
      .set(authHeaders())
      .send({ type: 'WITHDRAWAL', amount: '251.00' });
    expect(invalidWithdrawal.status).toBe(400);
    expect(invalidWithdrawal.body.error).toContain('não pode superar');
  });

  it('completes a one-time provision when it is used', async () => {
    const provisionId = (await createProvision()).body.id;
    const response = await request(app)
      .post(`/api/financial/budgets/provisions/${provisionId}/use`)
      .set(authHeaders())
      .send({ actualAmount: '1150.00', occurredAt: todayKey() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'COMPLETED',
      state: 'COMPLETED',
      reservedAmount: '0.00',
      lastUsedAmount: '1150.00'
    });
    expect(response.body.entries[0]).toMatchObject({
      type: 'USE',
      reservedAmountChange: '-200.00'
    });
  });

  it('rolls an annual provision into its next cycle and carries unused reserves', async () => {
    const createResponse = await createProvision({
      kind: 'ANNUAL',
      initialReservedAmount: '1200.00'
    });
    const previousTargetDate = createResponse.body.targetDate;

    const response = await request(app)
      .post(`/api/financial/budgets/provisions/${createResponse.body.id}/use`)
      .set(authHeaders())
      .send({ actualAmount: '1000.00', occurredAt: todayKey() });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.reservedAmount).toBe('200.00');
    expect(response.body.targetDate).not.toBe(previousTargetDate);
    expect(Number(response.body.targetDate.slice(0, 4))).toBe(
      Number(previousTargetDate.slice(0, 4)) + 1
    );
  });

  it.each([
    ['an income category', () => incomeCategoryId],
    ['a category from another company', () => foreignCategoryId]
  ])('rejects %s', async (_label, resolveCategoryId) => {
    const response = await createProvision({ categoryId: resolveCategoryId() });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('não pertence a esta empresa');
  });

  it('cancels a provision while preserving its audit history', async () => {
    const provisionId = (await createProvision()).body.id;
    const response = await request(app)
      .post(`/api/financial/budgets/provisions/${provisionId}/cancel`)
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'CANCELED', state: 'CANCELED' });
    await expect(
      prisma.financialProvisionEntry.count({ where: { provisionId } })
    ).resolves.toBe(1);
  });
});
