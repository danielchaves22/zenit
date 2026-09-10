import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('Compras parceladas fora do cartao', () => {
  let token: string;
  let companyId: number;
  let userId: number;
  let accountId: number;
  let categoryId: number;

  beforeAll(async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const company = await prisma.company.create({
      data: {
        name: `Empresa Parcelamento ${uniqueSuffix}`,
        code: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100_000)
      }
    });
    companyId = company.id;

    const user = await prisma.user.create({
      data: {
        email: `parcelamento-${uniqueSuffix}@teste.local`,
        password: await bcrypt.hash('senha123', 10),
        name: 'Admin Parcelamento',
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

    const cashApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.companyAppEntitlement.upsert({
      where: {
        unique_company_app_entitlement: {
          companyId,
          appId: cashApp.id
        }
      },
      update: { enabled: true },
      create: { companyId, appId: cashApp.id, enabled: true }
    });

    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId,
          companyId,
          appId: cashApp.id
        }
      },
      update: { granted: true },
      create: { userId, companyId, appId: cashApp.id, granted: true }
    });

    const account = await prisma.financialAccount.create({
      data: {
        name: `Conta Parcelamento ${uniqueSuffix}`,
        type: 'CHECKING',
        companyId
      }
    });
    accountId = account.id;

    const category = await prisma.financialCategory.create({
      data: {
        name: `Compras ${uniqueSuffix}`,
        type: 'EXPENSE',
        companyId
      }
    });
    categoryId = category.id;

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        email: user.email,
        password: 'senha123'
      });

    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.installmentPlan.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('cria parcelas reais agrupadas, divide o total e preserva o fim do mes', async () => {
    const createResponse = await request(app)
      .post('/api/financial/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Company-Id', companyId.toString())
      .set('X-App-Key', 'zenit-cash')
      .send({
        description: 'Notebook no boleto',
        amount: 100,
        date: '2026-01-15T12:00:00.000Z',
        dueDate: '2026-01-31T12:00:00.000Z',
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: accountId,
        categoryId,
        installmentCount: 3
      });

    expect({
      status: createResponse.status,
      body: createResponse.body
    }).toEqual({
      status: 201,
      body: expect.any(Array)
    });
    expect(createResponse.body).toHaveLength(3);
    expect(createResponse.body.map((item: any) => item.amount)).toEqual([
      '33.33',
      '33.33',
      '33.34'
    ]);
    expect(createResponse.body.map((item: any) => item.installmentNumber)).toEqual([1, 2, 3]);
    expect(new Set(createResponse.body.map((item: any) => item.installmentPlanId)).size).toBe(1);
    expect(createResponse.body.every((item: any) => item.purchaseGroupId === null)).toBe(true);
    expect(createResponse.body.map((item: any) => item.dueDate.slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31'
    ]);

    const transactionListResponse = await request(app)
      .get('/api/financial/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Company-Id', companyId.toString())
      .set('X-App-Key', 'zenit-cash')
      .query({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z'
      });

    expect(transactionListResponse.status).toBe(200);
    expect(transactionListResponse.body.data).toHaveLength(3);
    expect(
      transactionListResponse.body.data.every(
        (item: any) => item.installmentPlanId === createResponse.body[0].installmentPlanId
      )
    ).toBe(true);

    const listResponse = await request(app)
      .get('/api/financial/installment-purchases')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Company-Id', companyId.toString())
      .set('X-App-Key', 'zenit-cash');

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        description: 'Notebook no boleto',
        totalAmount: '100.00',
        installmentCount: 3,
        paidInstallmentCount: 0,
        pendingInstallmentCount: 3,
        remainingAmount: '100.00',
        status: 'OVERDUE'
      })
    ]);
  });
});
