import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';
const authHeaders = (token: string, companyId: number) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': String(companyId),
  [APP_KEY_HEADER]: APP_KEY_VALUE
});

describe('Financial Account Movement Report', () => {
  const uniqueSuffix = Date.now().toString();
  let authToken: string;
  let companyId: number;
  let otherCompanyId: number;
  let userId: number;
  let accountIds: number[];
  let foreignAccountId: number;
  let reportData: any[];

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: `Report Company ${uniqueSuffix}`,
        code: Number(uniqueSuffix.slice(-6)) + 600
      }
    });
    const otherCompany = await prisma.company.create({
      data: {
        name: `Other Report Company ${uniqueSuffix}`,
        code: Number(uniqueSuffix.slice(-6)) + 601
      }
    });
    companyId = company.id;
    otherCompanyId = otherCompany.id;

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: {
        email: `report.${uniqueSuffix}@test.com`,
        password: passwordHash,
        name: 'Report Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    await prisma.userCompany.create({
      data: { userId, companyId, isDefault: true, role: 'ADMIN' }
    });

    await AppAccessService.setCompanyEntitlements(companyId, [
      { appKey: AppKey.ZENIT_CASH, enabled: true }
    ]);
    await AppAccessService.setUserGrants(userId, companyId, [
      { appKey: AppKey.ZENIT_CASH, granted: true }
    ]);

    const [account1, account2, foreignAccount, expenseCategory, incomeCategory] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          name: `Conta Principal ${uniqueSuffix}`,
          type: 'CHECKING',
          balance: 0,
          companyId
        }
      }),
      prisma.financialAccount.create({
        data: {
          name: `Conta Secundaria ${uniqueSuffix}`,
          type: 'CASH',
          balance: 0,
          companyId
        }
      }),
      prisma.financialAccount.create({
        data: {
          name: `Conta Externa ${uniqueSuffix}`,
          type: 'CHECKING',
          balance: 0,
          companyId: otherCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: `Despesa ${uniqueSuffix}`,
          type: 'EXPENSE',
          companyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: `Receita ${uniqueSuffix}`,
          type: 'INCOME',
          companyId
        }
      })
    ]);

    accountIds = [account1.id, account2.id];
    foreignAccountId = foreignAccount.id;

    await FinancialTransactionService.createTransaction({
      description: 'Recebimento inicial',
      amount: 1000,
      date: new Date('2024-01-10T10:00:00.000Z'),
      type: 'INCOME',
      status: 'COMPLETED',
      toAccountId: account1.id,
      categoryId: incomeCategory.id,
      companyId,
      createdBy: userId
    });

    await FinancialTransactionService.createTransaction({
      description: 'Pagamento fornecedor',
      amount: 200,
      date: new Date('2024-01-11T12:00:00.000Z'),
      type: 'EXPENSE',
      status: 'COMPLETED',
      fromAccountId: account1.id,
      categoryId: expenseCategory.id,
      companyId,
      createdBy: userId
    });

    await FinancialTransactionService.createTransaction({
      description: 'Transferencia interna',
      amount: 150,
      date: new Date('2024-01-15T09:30:00.000Z'),
      type: 'TRANSFER',
      status: 'COMPLETED',
      fromAccountId: account1.id,
      toAccountId: account2.id,
      companyId,
      createdBy: userId
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        email: `report.${uniqueSuffix}@test.com`,
        password: 'password123'
      });

    authToken = loginResponse.body.token;

    const initialReport = await request(app)
      .get('/api/financial/reports/financial-account-movement')
      .query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        financialAccountIds: accountIds.join(','),
        groupBy: 'day'
      })
      .set(authHeaders(authToken, companyId));

    reportData = initialReport.body;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } }
    });
    await prisma.financialCategory.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } }
    });
    await prisma.financialAccount.deleteMany({
      where: { companyId: { in: [companyId, otherCompanyId] } }
    });
    await prisma.userAppGrant.deleteMany({
      where: { companyId }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: { companyId }
    });
    await prisma.userCompany.deleteMany({
      where: { userId }
    });
    await prisma.user.deleteMany({
      where: { id: userId }
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyId, otherCompanyId] } }
    });
    await prisma.$disconnect();
  });

  describe('GET /api/financial/reports/financial-account-movement', () => {
    it('should generate report with valid parameters', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'day'
        })
        .set(authHeaders(authToken, companyId))
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('period');
      expect(response.body[0]).toHaveProperty('periodLabel');
      expect(response.body[0]).toHaveProperty('income');
      expect(response.body[0]).toHaveProperty('expense');
      expect(response.body[0]).toHaveProperty('balance');
      expect(response.body[0].transactions).toBeInstanceOf(Array);
    });

    it('should return 400 for missing required parameters', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01'
        })
        .set(authHeaders(authToken, companyId))
        .expect(400);
    });

    it('should return 400 for invalid date range', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-31',
          endDate: '2024-01-01',
          financialAccountIds: accountIds.join(',')
        })
        .set(authHeaders(authToken, companyId))
        .expect(400);
    });

    it('should return 400 for invalid groupBy parameter', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'invalid'
        })
        .set(authHeaders(authToken, companyId))
        .expect(400);
    });

    it('should group by week correctly', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'week'
        })
        .set(authHeaders(authToken, companyId))
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      if (response.body.length > 0) {
        expect(response.body[0].periodLabel).toMatch(
          /Semana de \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/
        );
      }
    });

    it('should group by month correctly', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-03-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'month'
        })
        .set(authHeaders(authToken, companyId))
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      if (response.body.length > 0) {
        expect(String(response.body[0].periodLabel)).toContain('2024');
      }
    });
  });

  describe('POST /api/financial/reports/financial-account-movement/pdf', () => {
    it('should export report to text payload for the current PDF stub', async () => {
      const response = await request(app)
        .post('/api/financial/reports/financial-account-movement/pdf')
        .set(authHeaders(authToken, companyId))
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds,
          groupBy: 'day',
          data: reportData
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['x-generated-format']).toBe('txt');
      expect(response.headers['content-disposition']).toMatch(
        /attachment; filename="relatorio-movimentacao-contas-2024-01-01-2024-01-31\.txt"/
      );
    });

    it('should return 400 for missing data', async () => {
      await request(app)
        .post('/api/financial/reports/financial-account-movement/pdf')
        .set(authHeaders(authToken, companyId))
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .expect(400);
    });
  });

  describe('POST /api/financial/reports/financial-account-movement/excel', () => {
    it('should export report to CSV compatible with Excel', async () => {
      const response = await request(app)
        .post('/api/financial/reports/financial-account-movement/excel')
        .set(authHeaders(authToken, companyId))
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds,
          groupBy: 'day',
          data: reportData
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['x-generated-format']).toBe('csv');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename=".*\.csv"/);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(',')
        })
        .set(APP_KEY_HEADER, APP_KEY_VALUE)
        .expect(401);
    });

    it('should return 500 for accounts outside the active company', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: `${accountIds[0]},${foreignAccountId}`
        })
        .set(authHeaders(authToken, companyId))
        .expect(500);
    });
  });
});
