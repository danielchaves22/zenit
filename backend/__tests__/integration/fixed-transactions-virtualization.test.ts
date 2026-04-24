import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';
import FixedTransactionService, { buildOccurrenceKeyValue } from '../../src/services/fixed-transaction.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Fixed transactions virtualization and materialization', () => {
  let companyId: number;
  let userId: number;
  let token: string;
  let expenseAccountId: number;
  let expenseCategoryId: number;

  const now = new Date();

  const monthBounds = (monthOffset = 0) => {
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
    return { start, end };
  };

  const buildOccurrenceDate = (monthOffset: number, dayOfMonth: number) => {
    const year = now.getFullYear();
    const month = now.getMonth() + monthOffset;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dayOfMonth, lastDay), 12, 0, 0, 0);
  };

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const listTransactions = async (startDate: Date, endDate: Date, extraParams: Record<string, any> = {}) => {
    return request(app)
      .get('/api/financial/transactions')
      .set(authHeaders())
      .query({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ...extraParams
      });
  };

  beforeAll(async () => {
    const companyCode = Number(`8${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Fixed Virtualization Test',
        code: companyCode
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `fixed-virtualization-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Fixed Virtualization Admin',
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

    const app = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.companyAppEntitlement.upsert({
      where: {
        unique_company_app_entitlement: {
          companyId,
          appId: app.id
        }
      },
      update: { enabled: true },
      create: { companyId, appId: app.id, enabled: true }
    });

    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId,
          companyId,
          appId: app.id
        }
      },
      update: { granted: true },
      create: { userId, companyId, appId: app.id, granted: true }
    });

    const account = await prisma.financialAccount.create({
      data: {
        name: 'Fixed Test Expense Account',
        type: 'CHECKING',
        balance: 10000,
        allowNegativeBalance: true,
        companyId
      }
    });
    expenseAccountId = account.id;

    const category = await prisma.financialCategory.create({
      data: {
        name: 'Fixed Test Expense Category',
        type: 'EXPENSE',
        color: '#FF0000',
        companyId
      }
    });
    expenseCategoryId = category.id;

    token = generateToken({ userId });
  });

  beforeEach(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
    await prisma.financialTag.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('returns validation error when listing transactions without period', async () => {
    const response = await request(app)
      .get('/api/financial/transactions')
      .set(authHeaders());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'startDate' }),
        expect.objectContaining({ field: 'endDate' })
      ])
    );
  });

  it('returns materialized plus virtual fixed when period is provided and includeVirtualFixed defaults to true', async () => {
    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Fixed Expense Projection',
        amount: 155.9,
        type: 'EXPENSE',
        dayOfMonth: 10,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    const fixedTemplateId = fixedResponse.body.id;

    const materializedDate = buildOccurrenceDate(1, 20);
    const materializedResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Manual Future Expense',
        amount: 200,
        date: materializedDate.toISOString(),
        dueDate: materializedDate.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(materializedResponse.status).toBe(201);

    const { start, end } = monthBounds(1);
    const listResponse = await listTransactions(start, end);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data)).toBe(true);

    const foundManual = listResponse.body.data.find((item: any) => item.id === materializedResponse.body.id);
    const foundVirtual = listResponse.body.data.find(
      (item: any) => item.fixedTemplateId === fixedTemplateId && item.isVirtual === true
    );

    expect(foundManual).toBeDefined();
    expect(foundVirtual).toBeDefined();
  });

  it('does not create virtual duplicate when competence already has materialized occurrence', async () => {
    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'No Duplicate Fixed',
        amount: 90,
        type: 'EXPENSE',
        dayOfMonth: 7,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    const fixedTemplateId = fixedResponse.body.id;
    const occurrenceDate = buildOccurrenceDate(1, 7);

    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${fixedTemplateId}/materialize`)
      .set(authHeaders())
      .send({ occurrenceDate: occurrenceDate.toISOString() });

    expect([200, 201]).toContain(materializeResponse.status);

    const { start, end } = monthBounds(1);
    const listResponse = await listTransactions(start, end);

    expect(listResponse.status).toBe(200);
    const occurrences = listResponse.body.data.filter(
      (item: any) => item.fixedTemplateId === fixedTemplateId && new Date(item.dueDate).getDate() === 7
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].isVirtual).toBe(false);
  });

  it('does not generate virtual replacement when linked materialized occurrence is canceled', async () => {
    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Canceled Still Blocks Virtual',
        amount: 130,
        type: 'EXPENSE',
        dayOfMonth: 9,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    const fixedTemplateId = fixedResponse.body.id;
    const occurrenceDate = buildOccurrenceDate(2, 9);

    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${fixedTemplateId}/materialize`)
      .set(authHeaders())
      .send({ occurrenceDate: occurrenceDate.toISOString() });

    expect([200, 201]).toContain(materializeResponse.status);
    const transactionId = materializeResponse.body.transaction.id;

    const cancelResponse = await request(app)
      .put(`/api/financial/transactions/${transactionId}`)
      .set(authHeaders())
      .send({ status: 'CANCELED' });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.status).toBe('CANCELED');

    const dayStart = new Date(
      occurrenceDate.getFullYear(),
      occurrenceDate.getMonth(),
      occurrenceDate.getDate(),
      0,
      0,
      0,
      0
    );
    const dayEnd = new Date(
      occurrenceDate.getFullYear(),
      occurrenceDate.getMonth(),
      occurrenceDate.getDate(),
      23,
      59,
      59,
      999
    );

    const listResponse = await listTransactions(dayStart, dayEnd);
    expect(listResponse.status).toBe(200);

    const occurrences = listResponse.body.data.filter((item: any) => item.fixedTemplateId === fixedTemplateId);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe('CANCELED');
    expect(occurrences[0].isVirtual).toBe(false);
  });

  it('materialization on demand is idempotent under concurrent calls', async () => {
    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Concurrent Materialization',
        amount: 88.5,
        type: 'EXPENSE',
        dayOfMonth: 12,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    const fixedTemplateId = fixedResponse.body.id;
    const occurrenceDate = buildOccurrenceDate(1, 12);
    const occurrenceKey = buildOccurrenceKeyValue(fixedTemplateId, occurrenceDate);

    const responses = await Promise.all(
      Array.from({ length: 6 }).map(() =>
        request(app)
          .post(`/api/financial/fixed-transactions/${fixedTemplateId}/materialize`)
          .set(authHeaders())
          .send({ occurrenceDate: occurrenceDate.toISOString() })
      )
    );

    const statusCodes = responses.map((res) => res.status);
    expect(statusCodes.some((status) => status === 201)).toBe(true);
    expect(statusCodes.every((status) => status === 200 || status === 201)).toBe(true);

    const count = await prisma.financialTransaction.count({
      where: {
        companyId,
        occurrenceKey
      }
    });
    expect(count).toBe(1);
  });

  it('daily materialization job does not duplicate occurrence already materialized manually', async () => {
    const referenceDate = buildOccurrenceDate(1, 14);

    const fixed = await prisma.recurringTransaction.create({
      data: {
        description: 'Daily Job No Duplicate',
        amount: 75,
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        dayOfMonth: referenceDate.getDate(),
        startDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0),
        nextDueDate: referenceDate,
        isActive: true,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId,
        companyId,
        createdBy: userId
      }
    });

    const occurrenceKey = buildOccurrenceKeyValue(fixed.id, referenceDate);

    const manualResult = await FixedTransactionService.materializeOccurrence({
      templateId: fixed.id,
      occurrenceDate: referenceDate,
      companyId,
      userId
    });
    expect(manualResult.created).toBe(true);

    await FixedTransactionService.materializeDueOccurrencesForDate(referenceDate);

    const count = await prisma.financialTransaction.count({
      where: {
        companyId,
        occurrenceKey
      }
    });
    expect(count).toBe(1);
  });

  it('template update impacts only next competence', async () => {
    const currentMonthLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedDay = Math.min(now.getDate() + 1, currentMonthLastDay);

    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Versioned Fixed',
        amount: 100,
        type: 'EXPENSE',
        dayOfMonth: projectedDay,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString(),
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    const oldTemplateId = createResponse.body.id;

    const updateResponse = await request(app)
      .put(`/api/financial/fixed-transactions/${oldTemplateId}`)
      .set(authHeaders())
      .send({
        amount: 250
      });

    expect(updateResponse.status).toBe(200);
    const newTemplateId = updateResponse.body.id;
    expect(newTemplateId).not.toBe(oldTemplateId);

    const oldTemplate = await prisma.recurringTransaction.findUnique({ where: { id: oldTemplateId } });
    const newTemplate = await prisma.recurringTransaction.findUnique({ where: { id: newTemplateId } });

    expect(oldTemplate).not.toBeNull();
    expect(newTemplate).not.toBeNull();
    expect(oldTemplate?.endDate).not.toBeNull();
    expect(newTemplate?.startDate.getMonth()).toBe((now.getMonth() + 1) % 12);

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const nextMonth = monthBounds(1);

    const currentMonthList = await listTransactions(currentMonthStart, currentMonthEnd);
    expect(currentMonthList.status).toBe(200);
    const currentVirtual = currentMonthList.body.data.find(
      (item: any) => item.fixedTemplateId === oldTemplateId && item.isVirtual === true
    );
    expect(currentVirtual).toBeDefined();
    expect(Number(currentVirtual.amount)).toBe(100);

    const nextMonthList = await listTransactions(nextMonth.start, nextMonth.end);
    expect(nextMonthList.status).toBe(200);
    const nextVirtual = nextMonthList.body.data.find(
      (item: any) => item.fixedTemplateId === newTemplateId && item.isVirtual === true
    );
    expect(nextVirtual).toBeDefined();
    expect(Number(nextVirtual.amount)).toBe(250);
  });
});
