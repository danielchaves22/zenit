import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, FinancialTransactionEntryKind, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Financial reconciliation adjustments', () => {
  let companyId: number;
  let userId: number;
  let token: string;
  let accountId: number;
  let operationalExpenseCategoryId: number;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const companyCode = Number(`7${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Financial Reconciliation Test',
        code: companyCode
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `financial-reconciliation-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Financial Reconciliation Admin',
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
    await prisma.financialAccount.deleteMany({ where: { companyId } });

    const account = await prisma.financialAccount.create({
      data: {
        name: `Conta Teste ${Date.now()}`,
        type: 'CHECKING',
        balance: 1000,
        companyId
      }
    });
    accountId = account.id;

    const operationalExpenseCategory = await prisma.financialCategory.create({
      data: {
        name: `Operacional Despesa ${Date.now()}`,
        type: 'EXPENSE',
        color: '#EF4444',
        companyId
      }
    });
    operationalExpenseCategoryId = operationalExpenseCategory.id;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { userId, companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId, companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates reconciliation adjustments as income or expense and updates the account balance', async () => {
    const incomeAdjustmentResponse = await request(app)
      .post(`/api/financial/accounts/${accountId}/adjust-balance`)
      .set(authHeaders())
      .send({
        newBalance: 1300,
        reason: 'Conferencia inicial'
      });

    expect(incomeAdjustmentResponse.status).toBe(200);
    expect(Number(incomeAdjustmentResponse.body.balance)).toBe(1300);

    const expenseAdjustmentResponse = await request(app)
      .post(`/api/financial/accounts/${accountId}/adjust-balance`)
      .set(authHeaders())
      .send({
        newBalance: 1200,
        reason: 'Tarifa avulsa'
      });

    expect(expenseAdjustmentResponse.status).toBe(200);
    expect(Number(expenseAdjustmentResponse.body.balance)).toBe(1200);

    const transactions = await prisma.financialTransaction.findMany({
      where: { companyId },
      orderBy: { id: 'asc' }
    });

    expect(transactions).toHaveLength(2);
    expect(transactions[0].type).toBe('INCOME');
    expect(transactions[0].entryKind).toBe(FinancialTransactionEntryKind.BALANCE_ADJUSTMENT);
    expect(transactions[0].amount.toString()).toBe('300');
    expect(transactions[0].toAccountId).toBe(accountId);
    expect(transactions[0].categoryId).toBeNull();
    expect(transactions[1].type).toBe('EXPENSE');
    expect(transactions[1].entryKind).toBe(FinancialTransactionEntryKind.BALANCE_ADJUSTMENT);
    expect(transactions[1].amount.toString()).toBe('100');
    expect(transactions[1].fromAccountId).toBe(accountId);
    expect(transactions[1].categoryId).toBeNull();
  });

  it('does not create a transaction when the target balance matches the current balance', async () => {
    const response = await request(app)
      .post(`/api/financial/accounts/${accountId}/adjust-balance`)
      .set(authHeaders())
      .send({
        newBalance: 1000,
        reason: 'Sem diferenca'
      });

    expect(response.status).toBe(200);
    expect(Number(response.body.balance)).toBe(1000);

    const transactions = await prisma.financialTransaction.findMany({
      where: { companyId }
    });

    expect(transactions).toHaveLength(0);
  });

  it('ignores balance adjustments in financial summary but keeps them in account movement reports', async () => {
    const operationalExpenseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Despesa operacional',
        amount: 200,
        date: '2026-05-10T12:00:00.000Z',
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: accountId,
        categoryId: operationalExpenseCategoryId
      });

    expect(operationalExpenseResponse.status).toBe(201);

    const adjustmentResponse = await request(app)
      .post(`/api/financial/accounts/${accountId}/adjust-balance`)
      .set(authHeaders())
      .send({
        newBalance: 750,
        reason: 'Tarifa nao lancada'
      });

    expect(adjustmentResponse.status).toBe(200);
    expect(Number(adjustmentResponse.body.balance)).toBe(750);

    const summaryResponse = await request(app)
      .get('/api/financial/summary')
      .set(authHeaders())
      .query({
        startDate: '2026-05-01',
        endDate: '2026-05-31'
      });

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.income).toBe(0);
    expect(summaryResponse.body.expense).toBe(200);
    expect(summaryResponse.body.balance).toBe(-200);
    expect(summaryResponse.body.topCategories).toHaveLength(1);
    expect(summaryResponse.body.topCategories[0].id).toBe(operationalExpenseCategoryId);

    const movementReportResponse = await request(app)
      .get('/api/financial/reports/financial-account-movement')
      .set(authHeaders())
      .query({
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        financialAccountIds: accountId.toString(),
        groupBy: 'day'
      });

    expect(movementReportResponse.status).toBe(200);

    const movementTransactions = (movementReportResponse.body as Array<{ transactions: any[] }>)
      .flatMap((period) => period.transactions);

    expect(movementTransactions).toHaveLength(2);
    expect(
      movementTransactions.some((transaction) =>
        String(transaction.description).includes('Ajuste de saldo')
      )
    ).toBe(true);
    expect(
      movementTransactions.reduce(
        (sum, transaction) =>
          transaction.type === 'EXPENSE' ? sum + Number(transaction.amount) : sum,
        0
      )
    ).toBe(250);
  });
});
