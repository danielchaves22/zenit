import request from 'supertest';
import bcrypt from 'bcrypt';
import {
  AppKey,
  PrismaClient,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function buildMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

describe('Financial dashboard', () => {
  let primaryCompanyId: number;
  let secondaryCompanyId: number;
  let primaryUserId: number;
  let secondaryUserId: number;
  let primaryToken: string;
  let secondaryToken: string;

  const authHeaders = (token: string, companyId: number) => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const companyCodeBase = Number(`8${String(Date.now()).slice(-7)}`);

    const [primaryCompany, secondaryCompany] = await Promise.all([
      prisma.company.create({
        data: {
          name: 'Dashboard Company Primary',
          code: companyCodeBase
        }
      }),
      prisma.company.create({
        data: {
          name: 'Dashboard Company Secondary',
          code: companyCodeBase + 1
        }
      })
    ]);
    primaryCompanyId = primaryCompany.id;
    secondaryCompanyId = secondaryCompany.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const [primaryUser, secondaryUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `dashboard-primary-${Date.now()}@test.com`,
          password: passwordHash,
          name: 'Dashboard Primary User',
          role: 'ADMIN'
        }
      }),
      prisma.user.create({
        data: {
          email: `dashboard-secondary-${Date.now()}@test.com`,
          password: passwordHash,
          name: 'Dashboard Secondary User',
          role: 'ADMIN'
        }
      })
    ]);
    primaryUserId = primaryUser.id;
    secondaryUserId = secondaryUser.id;

    await prisma.userCompany.createMany({
      data: [
        {
          userId: primaryUserId,
          companyId: primaryCompanyId,
          isDefault: true,
          role: 'ADMIN',
          manageFinancialAccounts: true,
          manageFinancialCategories: true
        },
        {
          userId: primaryUserId,
          companyId: secondaryCompanyId,
          isDefault: false,
          role: 'ADMIN',
          manageFinancialAccounts: true,
          manageFinancialCategories: true
        },
        {
          userId: secondaryUserId,
          companyId: primaryCompanyId,
          isDefault: false,
          role: 'ADMIN',
          manageFinancialAccounts: true,
          manageFinancialCategories: true
        }
      ]
    });

    const ecosystemApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.companyAppEntitlement.createMany({
      data: [
        { companyId: primaryCompanyId, appId: ecosystemApp.id, enabled: true },
        { companyId: secondaryCompanyId, appId: ecosystemApp.id, enabled: true }
      ],
      skipDuplicates: true
    });

    await prisma.userAppGrant.createMany({
      data: [
        {
          userId: primaryUserId,
          companyId: primaryCompanyId,
          appId: ecosystemApp.id,
          granted: true
        },
        {
          userId: primaryUserId,
          companyId: secondaryCompanyId,
          appId: ecosystemApp.id,
          granted: true
        },
        {
          userId: secondaryUserId,
          companyId: primaryCompanyId,
          appId: ecosystemApp.id,
          granted: true
        }
      ],
      skipDuplicates: true
    });

    primaryToken = generateToken({ userId: primaryUserId });
    secondaryToken = generateToken({ userId: secondaryUserId });
  });

  beforeEach(async () => {
    await prisma.userVariableProjectionPreference.deleteMany({
      where: {
        OR: [
          { userId: primaryUserId, companyId: primaryCompanyId },
          { userId: primaryUserId, companyId: secondaryCompanyId },
          { userId: secondaryUserId, companyId: primaryCompanyId }
        ]
      }
    });
    await prisma.financialTransaction.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.creditCardInvoice.deleteMany({
      where: {
        account: {
          companyId: { in: [primaryCompanyId, secondaryCompanyId] }
        }
      }
    });
    await prisma.recurringTransaction.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialTag.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialCategory.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialAccount.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
  });

  afterAll(async () => {
    await prisma.userVariableProjectionPreference.deleteMany({
      where: {
        OR: [
          { userId: primaryUserId, companyId: primaryCompanyId },
          { userId: primaryUserId, companyId: secondaryCompanyId },
          { userId: secondaryUserId, companyId: primaryCompanyId }
        ]
      }
    });
    await prisma.financialTransaction.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.creditCardInvoice.deleteMany({
      where: {
        account: {
          companyId: { in: [primaryCompanyId, secondaryCompanyId] }
        }
      }
    });
    await prisma.recurringTransaction.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialTag.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialCategory.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.financialAccount.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.userAppGrant.deleteMany({
      where: {
        userId: { in: [primaryUserId, secondaryUserId] }
      }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: {
        companyId: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.userCompany.deleteMany({
      where: {
        userId: { in: [primaryUserId, secondaryUserId] }
      }
    });
    await prisma.company.deleteMany({
      where: {
        id: { in: [primaryCompanyId, secondaryCompanyId] }
      }
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [primaryUserId, secondaryUserId] }
      }
    });
    await prisma.$disconnect();
  });

  it('stores variable projection preferences per user and per company, enforcing the max of 10 categories', async () => {
    const categories = await prisma.financialCategory.createManyAndReturn({
      data: Array.from({ length: 11 }).map((_, index) => ({
        name: `Categoria Preferencia ${index + 1}`,
        type: 'EXPENSE',
        color: '#ef4444',
        companyId: primaryCompanyId
      })),
      select: { id: true }
    });

    const firstResponse = await request(app)
      .put('/api/financial/preferences/variable-projection')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .send({
        trackedExpenseCategoryIds: [categories[0].id, categories[1].id]
      });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.trackedExpenseCategoryIds).toEqual([
      categories[0].id,
      categories[1].id
    ]);

    const sameUserOtherCompany = await request(app)
      .get('/api/financial/preferences/variable-projection')
      .set(authHeaders(primaryToken, secondaryCompanyId));

    expect(sameUserOtherCompany.status).toBe(200);
    expect(sameUserOtherCompany.body.trackedExpenseCategoryIds).toEqual([]);

    const otherUserSameCompany = await request(app)
      .get('/api/financial/preferences/variable-projection')
      .set(authHeaders(secondaryToken, primaryCompanyId));

    expect(otherUserSameCompany.status).toBe(200);
    expect(otherUserSameCompany.body.trackedExpenseCategoryIds).toEqual([]);

    const tooManyResponse = await request(app)
      .put('/api/financial/preferences/variable-projection')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .send({
        trackedExpenseCategoryIds: categories.map((category) => category.id)
      });

    expect(tooManyResponse.status).toBe(400);
  });

  it('returns the monthly dashboard using current balance as the truth and discounts committed items from the variable projection', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();

    const checkingAccount = await prisma.financialAccount.create({
      data: {
        name: 'Conta Corrente Dashboard',
        type: 'CHECKING',
        balance: 950,
        companyId: primaryCompanyId
      }
    });

    const creditCardAccount = await prisma.financialAccount.create({
      data: {
        name: 'Cartao Dashboard',
        type: 'CREDIT_CARD',
        balance: 0,
        companyId: primaryCompanyId,
        statementClosingDay: 20,
        statementDueDay: 28
      }
    });

    const [trackedExpenseCategory, incomeCategory] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          name: 'Combustivel',
          type: 'EXPENSE',
          color: '#f97316',
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Receita Variavel',
          type: 'INCOME',
          color: '#22c55e',
          companyId: primaryCompanyId
        }
      })
    ]);

    for (let offset = 1; offset <= 6; offset += 1) {
      const historicalDate = buildDate(currentYear, currentMonthIndex - offset, 10);

      await prisma.financialTransaction.create({
        data: {
          description: `Historico ${offset}`,
          amount: 120,
          date: historicalDate,
          dueDate: historicalDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: checkingAccount.id,
          categoryId: trackedExpenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        }
      });
    }

    const realizedExpenseDate = buildDate(currentYear, currentMonthIndex, 5);
    const remainingIncomeDate = buildDate(currentYear, currentMonthIndex, 20);
    const creditCardDueDate = buildDate(currentYear, currentMonthIndex, 28);

    await prisma.financialTransaction.create({
      data: {
        description: 'Despesa realizada do mes',
        amount: 50,
        date: realizedExpenseDate,
        dueDate: realizedExpenseDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: checkingAccount.id,
        categoryId: trackedExpenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Receita restante do mes',
        amount: 500,
        date: remainingIncomeDate,
        dueDate: remainingIncomeDate,
        type: 'INCOME',
        status: 'PENDING',
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    const currentInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccount.id,
        referenceYear: currentYear,
        referenceMonth: currentMonthIndex + 1,
        closingDate: buildDate(currentYear, currentMonthIndex, 20),
        dueDate: creditCardDueDate,
        status: 'OPEN',
        totalAmount: 20
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra no cartao do mes',
        amount: 20,
        date: buildDate(currentYear, currentMonthIndex, 12),
        dueDate: creditCardDueDate,
        effectiveDate: buildDate(currentYear, currentMonthIndex, 12),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: creditCardAccount.id,
        categoryId: trackedExpenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId,
        creditCardInvoiceId: currentInvoice.id
      }
    });

    await prisma.recurringTransaction.create({
      data: {
        description: 'Fixa futura do mes',
        amount: 30,
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: 25,
        startDate: buildDate(currentYear, currentMonthIndex - 2, 25),
        nextDueDate: buildDate(currentYear, currentMonthIndex, 25),
        isActive: true,
        fromAccountId: checkingAccount.id,
        categoryId: trackedExpenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.userVariableProjectionPreference.create({
      data: {
        userId: primaryUserId,
        companyId: primaryCompanyId,
        trackedExpenseCategoryIds: [trackedExpenseCategory.id]
      }
    });

    const response = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: currentMonthKey });

    expect(response.status).toBe(200);
    expect(response.body.month).toBe(currentMonthKey);
    expect(response.body.carryOver.amount).toBe('950.00');
    expect(response.body.currentMonthBreakdown.income.realized).toBe('0.00');
    expect(response.body.currentMonthBreakdown.income.remaining).toBe('500.00');
    expect(response.body.currentMonthBreakdown.expense.realizedCommitted).toBe('50.00');
    expect(response.body.currentMonthBreakdown.expense.remainingCommitted).toBe('50.00');
    expect(response.body.currentMonthBreakdown.expense.remainingVariableProjected).toBe('20.00');
    expect(response.body.variableProjection.total).toBe('20.00');
    expect(response.body.projectedEndingBalance).toBe('1380.00');
    expect(response.body.variableProjection.categories).toEqual([
      {
        categoryId: trackedExpenseCategory.id,
        categoryName: 'Combustivel',
        color: '#f97316',
        month: currentMonthKey,
        historicalAverage: '120.00',
        committedInMonth: '100.00',
        remainingProjected: '20.00'
      }
    ]);
  });

  it('returns the financial history with 12 months and the selected category series', async () => {
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();
    const currentMonthKey = buildMonthKey(now);
    const previousMonthKey = buildMonthKey(buildDate(currentYear, currentMonthIndex - 1, 1));

    const checkingAccount = await prisma.financialAccount.create({
      data: {
        name: 'Conta Historico',
        type: 'CHECKING',
        balance: 1000,
        companyId: primaryCompanyId
      }
    });

    const creditCardAccount = await prisma.financialAccount.create({
      data: {
        name: 'Cartao Historico',
        type: 'CREDIT_CARD',
        balance: 0,
        companyId: primaryCompanyId,
        statementClosingDay: 20,
        statementDueDay: 28
      }
    });

    const [expenseCategory, incomeCategory] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          name: 'Saude',
          type: 'EXPENSE',
          color: '#ef4444',
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Servicos',
          type: 'INCOME',
          color: '#10b981',
          companyId: primaryCompanyId
        }
      })
    ]);

    await prisma.financialTransaction.create({
      data: {
        description: 'Despesa mes anterior',
        amount: 120,
        date: buildDate(currentYear, currentMonthIndex - 1, 9),
        dueDate: buildDate(currentYear, currentMonthIndex - 1, 9),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: checkingAccount.id,
        categoryId: expenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Receita mes anterior',
        amount: 300,
        date: buildDate(currentYear, currentMonthIndex - 1, 14),
        dueDate: buildDate(currentYear, currentMonthIndex - 1, 14),
        type: 'INCOME',
        status: 'COMPLETED',
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    const currentInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccount.id,
        referenceYear: currentYear,
        referenceMonth: currentMonthIndex + 1,
        closingDate: buildDate(currentYear, currentMonthIndex, 20),
        dueDate: buildDate(currentYear, currentMonthIndex, 28),
        status: 'OPEN',
        totalAmount: 40
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Despesa corrente',
        amount: 30,
        date: buildDate(currentYear, currentMonthIndex, 4),
        dueDate: buildDate(currentYear, currentMonthIndex, 4),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: checkingAccount.id,
        categoryId: expenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Receita corrente',
        amount: 450,
        date: buildDate(currentYear, currentMonthIndex, 10),
        dueDate: buildDate(currentYear, currentMonthIndex, 10),
        type: 'INCOME',
        status: 'PENDING',
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra no cartao corrente',
        amount: 40,
        date: buildDate(currentYear, currentMonthIndex, 12),
        dueDate: buildDate(currentYear, currentMonthIndex, 28),
        effectiveDate: buildDate(currentYear, currentMonthIndex, 12),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: creditCardAccount.id,
        categoryId: expenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId,
        creditCardInvoiceId: currentInvoice.id
      }
    });

    const response = await request(app)
      .get('/api/financial/dashboard/history')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({
        months: 12,
        categoryIds: [expenseCategory.id]
      });

    expect(response.status).toBe(200);
    expect(response.body.months).toBe(12);
    expect(response.body.monthlyTotals).toHaveLength(12);

    const currentMonth = response.body.monthlyTotals.find((item: any) => item.month === currentMonthKey);
    const previousMonth = response.body.monthlyTotals.find((item: any) => item.month === previousMonthKey);

    expect(currentMonth).toMatchObject({
      month: currentMonthKey,
      incomeTotal: '450.00',
      expenseTotal: '70.00',
      isPartialCurrentMonth: true
    });
    expect(previousMonth).toMatchObject({
      month: previousMonthKey,
      incomeTotal: '300.00',
      expenseTotal: '120.00',
      isPartialCurrentMonth: false
    });

    expect(response.body.categorySeries).toEqual([
      {
        categoryId: expenseCategory.id,
        name: 'Saude',
        color: '#ef4444',
        type: 'EXPENSE',
        points: expect.arrayContaining([
          { month: currentMonthKey, amount: '70.00' },
          { month: previousMonthKey, amount: '120.00' }
        ])
      }
    ]);
  });
});
