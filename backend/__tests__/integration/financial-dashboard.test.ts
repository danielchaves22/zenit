import request from 'supertest';
import bcrypt from 'bcrypt';
import {
  AppKey,
  FinancialProvisionKind,
  PrismaClient,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';
import FinancialDashboardService from '../../src/services/financial-dashboard.service';
import FinancialForecastService from '../../src/services/financial-forecast.service';
import { defaultForecastOptions } from '../../src/utils/financial-forecast';
import WorkspaceFinancialCalendarService from '../../src/services/workspace-financial-calendar.service';
import { buildOccurrenceKeyValue } from '../../src/services/fixed-transaction.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function buildMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number);
  return buildMonthKey(new Date(year, month - 1 + offset, 1, 12, 0, 0, 0));
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
  afterEach(() => jest.restoreAllMocks());

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
    await prisma.installmentPlan.deleteMany({
      where: { companyId: { in: [primaryCompanyId, secondaryCompanyId] } }
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
    await prisma.financialProvision.deleteMany({
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
    await prisma.installmentPlan.deleteMany({
      where: { companyId: { in: [primaryCompanyId, secondaryCompanyId] } }
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
    await prisma.financialProvision.deleteMany({
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

  it('uses one workspace month at a timezone boundary across dashboard views', async () => {
    const boundaryInstant = new Date('2026-01-01T02:30:00.000Z');
    await prisma.company.update({
      where: { id: primaryCompanyId },
      data: { timeZone: 'America/Sao_Paulo' }
    });

    try {
      const monthly = await FinancialDashboardService.getMonthlyDashboard({
        companyId: primaryCompanyId,
        userId: primaryUserId,
        month: '2025-12',
        at: boundaryInstant
      });
      expect(monthly.month).toBe('2025-12');

      await expect(
        FinancialDashboardService.getMonthlyDashboard({
          companyId: primaryCompanyId,
          userId: primaryUserId,
          month: '2025-11',
          at: boundaryInstant
        })
      ).rejects.toThrow('Não é permitido consultar meses anteriores ao atual');

      const history = await FinancialDashboardService.getHistoryDashboard({
        companyId: primaryCompanyId,
        months: 2,
        at: boundaryInstant
      });
      expect(history.monthlyTotals.map((item) => item.month)).toEqual(['2025-11', '2025-12']);
      expect(history.monthlyTotals.at(-1)?.isPartialCurrentMonth).toBe(true);

      const structural = await FinancialDashboardService.getStructuralDashboard({
        companyId: primaryCompanyId,
        at: boundaryInstant
      });
      expect(structural.referenceDate).toBe('2025-12-31T12:00:00.000Z');
    } finally {
      await prisma.company.update({
        where: { id: primaryCompanyId },
        data: { timeZone: null }
      });
    }
  });

  it('projects comparable history, carries overdue cash once, and respects account and workspace scope', async () => {
    const account = await prisma.financialAccount.create({ data: { name: 'Forecast bank', type: 'CHECKING', balance: 1000, companyId: primaryCompanyId } });
    const category = await prisma.financialCategory.create({ data: { name: 'Forecast food', type: 'EXPENSE', color: '#fff', companyId: primaryCompanyId } });
    const fixed = await prisma.recurringTransaction.create({ data: {
      description: 'Inactive historical fixed', amount: 900, type: 'EXPENSE', frequency: 'MONTHLY', startDate: new Date('2026-01-10T12:00:00Z'),
      nextDueDate: new Date('2026-09-10T12:00:00Z'),
      isActive: false, fromAccountId: account.id, categoryId: category.id, companyId: primaryCompanyId, createdBy: primaryUserId
    } });
    const common = { type: 'EXPENSE' as const, fromAccountId: account.id, categoryId: category.id, companyId: primaryCompanyId, createdBy: primaryUserId };
    await prisma.financialTransaction.createMany({ data: [
      { ...common, description: 'July variable', amount: 200, date: new Date('2026-07-10T12:00:00Z'), status: 'COMPLETED' },
      { ...common, description: 'August variable', amount: 100, date: new Date('2026-08-10T12:00:00Z'), status: 'COMPLETED' },
      { ...common, description: 'August fixed', amount: 900, recurringTransactionId: fixed.id, date: new Date('2026-08-11T12:00:00Z'), status: 'COMPLETED' },
      { ...common, description: 'August installment', amount: 300, installmentNumber: 1, totalInstallments: 3, date: new Date('2026-08-12T12:00:00Z'), status: 'COMPLETED' },
      { ...common, description: 'September variable', amount: 20, date: new Date('2026-09-10T12:00:00Z'), status: 'COMPLETED' },
      { ...common, description: 'September fixed', amount: 50, recurringTransactionId: fixed.id, date: new Date('2026-09-11T12:00:00Z'), status: 'PENDING' },
      { ...common, description: 'September installment', amount: 30, installmentNumber: 2, totalInstallments: 3, date: new Date('2026-09-12T12:00:00Z'), status: 'PENDING' },
      { ...common, description: 'Overdue expense', amount: 60, date: new Date('2026-08-15T12:00:00Z'), status: 'PENDING' },
      { ...common, description: 'Overdue income', type: 'INCOME', amount: 20, fromAccountId: null, toAccountId: account.id, date: new Date('2026-08-15T12:00:00Z'), status: 'PENDING' },
      { ...common, description: 'Remaining income', type: 'INCOME', amount: 200, fromAccountId: null, toAccountId: account.id, date: new Date('2026-09-28T12:00:00Z'), status: 'PENDING' }
    ] });
    const params = { companyId: primaryCompanyId, at: new Date('2026-09-23T15:00:00Z'), options: { ...defaultForecastOptions, historyMonths: 3 } };
    const before = await prisma.financialTransaction.findMany({ where: { companyId: primaryCompanyId }, orderBy: { id: 'asc' } });
    const september = await FinancialForecastService.getForecast(params);
    expect(september.history.months).toEqual(['2026-07', '2026-08']);
    expect(september.variables[0]).toMatchObject({ historicalAverage: '150.00', committedInMonth: '20.00', remainingProjected: '130.00' });
    expect(september).toMatchObject({ income: '0.00', expense: '230.00', result: '-230.00', endingBalance: '790.00' });
    expect(september.overdue).toMatchObject({ included: false, expense: '60.00', income: '0.00', cashEffect: '0.00' });
    const october = await FinancialForecastService.getForecast({ ...params, month: '2026-10', options: { ...params.options, includeOverdue: true } });
    expect(october.timeline.map((point) => point.endingBalance)).toEqual(['730.00', '580.00']);
    expect(october.timeline.map((point) => point.result)).toEqual(['-230.00', '-150.00']);
    const partial = await FinancialForecastService.getForecast({ ...params, options: { ...params.options, sources: { ...params.options.sources, other: false } } });
    expect(partial.variables[0].remainingProjected).toBe('130.00');
    expect(partial).toMatchObject({ income: '0.00', expense: '180.00', endingBalance: '820.00' });
    const noAccess = await FinancialForecastService.getForecast({ ...params, accessibleAccountIds: [] });
    expect(noAccess).toMatchObject({ currentBalance: '0.00', income: '0.00', expense: '0.00', transactions: [], variables: [] });
    const otherWorkspace = await request(app).post('/api/financial/dashboard/forecast').set(authHeaders(primaryToken, secondaryCompanyId)).send({});
    expect(otherWorkspace.status).toBe(200);
    expect(otherWorkspace.body.transactions).toEqual([]);
    const invalid = await request(app).post('/api/financial/dashboard/forecast').set(authHeaders(primaryToken, primaryCompanyId)).send({ overrides: { [`ACCOUNT:${category.id}`]: '-1' } });
    expect(invalid.status).toBe(400);
    expect(await prisma.financialTransaction.findMany({ where: { companyId: primaryCompanyId }, orderBy: { id: 'asc' } })).toEqual(before);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance.toFixed(2)).toBe('1000.00');
  });

  it('selects recurring income across months without changing the ledger or counting variable income', async () => {
    const account = await prisma.financialAccount.create({ data: {
      companyId: primaryCompanyId, name: 'Income selection', type: 'CHECKING', balance: 5000
    } });
    const incomeCategory = await prisma.financialCategory.create({ data: {
      companyId: primaryCompanyId, name: 'Recurring income', type: 'INCOME', color: '#22c55e'
    } });
    const expenseCategory = await prisma.financialCategory.create({ data: {
      companyId: primaryCompanyId, name: 'Fixed expense', type: 'EXPENSE', color: '#f97316'
    } });
    const common = { companyId: primaryCompanyId, createdBy: primaryUserId };
    const template = {
      ...common, type: 'INCOME' as const, frequency: 'MONTHLY' as const, dayOfMonth: 28,
      startDate: new Date('2026-08-01T12:00:00Z'), nextDueDate: new Date('2026-09-28T12:00:00Z'),
      categoryId: incomeCategory.id, toAccountId: account.id
    };
    const salary = await prisma.recurringTransaction.create({ data: { ...template, description: 'Salary', amount: 1000 } });
    const rent = await prisma.recurringTransaction.create({ data: { ...template, description: 'Rent received', amount: 500 } });
    await prisma.recurringTransaction.create({ data: {
      ...template, type: 'EXPENSE', description: 'Fixed bill', amount: 200,
      toAccountId: null, fromAccountId: account.id, categoryId: expenseCategory.id
    } });
    const septemberDueDate = new Date('2026-09-28T12:00:00Z');
    await prisma.financialTransaction.createMany({ data: [
      { ...common, description: 'Salary', type: 'INCOME', amount: 1000, status: 'COMPLETED',
        date: septemberDueDate, dueDate: septemberDueDate, effectiveDate: new Date('2026-09-15T12:00:00Z'),
        toAccountId: account.id, categoryId: incomeCategory.id, recurringTransactionId: salary.id,
        occurrenceKey: buildOccurrenceKeyValue(salary.id, septemberDueDate) },
      { ...common, description: 'Rent received', type: 'INCOME', amount: 500, status: 'PENDING',
        date: septemberDueDate, dueDate: septemberDueDate, toAccountId: account.id, categoryId: incomeCategory.id,
        recurringTransactionId: rent.id, occurrenceKey: buildOccurrenceKeyValue(rent.id, septemberDueDate) },
      { ...common, description: 'Past variable receipt', type: 'INCOME', amount: 8000, status: 'COMPLETED',
        date: new Date('2026-08-15T12:00:00Z'), toAccountId: account.id, categoryId: incomeCategory.id },
      { ...common, description: 'Future variable receipt', type: 'INCOME', amount: 9000, status: 'PENDING',
        date: new Date('2026-10-15T12:00:00Z'), toAccountId: account.id, categoryId: incomeCategory.id }
    ] });
    const params = { companyId: primaryCompanyId, at: new Date('2026-09-23T15:00:00Z'), month: '2026-10', options: defaultForecastOptions };
    const before = await prisma.financialTransaction.findMany({ where: { companyId: primaryCompanyId }, orderBy: { id: 'asc' } });
    const complete = await FinancialForecastService.getForecast(params);
    expect(complete.timeline.map((point) => [point.income, point.endingBalance])).toEqual([
      ['1500.00', '5300.00'], ['1500.00', '6600.00']
    ]);
    expect(complete.variables).toEqual([]);
    expect(complete.incomes).toEqual([
      { id: rent.id, description: 'Rent received', amount: '500.00', included: true },
      { id: salary.id, description: 'Salary', amount: '1000.00', included: true }
    ]);
    expect(complete.transactions.some((row) => row.description === 'Future variable receipt')).toBe(false);
    const withoutSalary = await FinancialForecastService.getForecast({
      ...params, options: { ...defaultForecastOptions, excludedIncomeIds: [salary.id] }
    });
    expect(withoutSalary.timeline.map((point) => [point.income, point.endingBalance])).toEqual([
      ['500.00', '5300.00'], ['500.00', '5600.00']
    ]);
    expect(withoutSalary.incomes.find((income) => income.id === salary.id)?.included).toBe(false);
    const withoutRent = await FinancialForecastService.getForecast({
      ...params, options: { ...defaultForecastOptions, excludedIncomeIds: [rent.id] }
    });
    expect(withoutRent.timeline.map((point) => [point.income, point.endingBalance])).toEqual([
      ['1000.00', '4800.00'], ['1000.00', '5600.00']
    ]);
    const incomeOff = await FinancialForecastService.getForecast({
      ...params, options: { ...defaultForecastOptions, sources: { ...defaultForecastOptions.sources, income: false } }
    });
    expect(incomeOff).toMatchObject({ income: '0.00', expense: '200.00', endingBalance: '4600.00' });
    expect(incomeOff.incomes.every((income) => !income.included)).toBe(true);
    const noAccess = await FinancialForecastService.getForecast({ ...params, accessibleAccountIds: [] });
    expect(noAccess.incomes).toEqual([]);
    const response = await request(app).post('/api/financial/dashboard/forecast')
      .set(authHeaders(primaryToken, primaryCompanyId)).send({ excludedIncomeIds: [salary.id] });
    expect(response.status).toBe(200);
    expect(response.body.options.excludedIncomeIds).toEqual([salary.id]);
    const invalid = await request(app).post('/api/financial/dashboard/forecast')
      .set(authHeaders(primaryToken, primaryCompanyId)).send({ excludedIncomeIds: [-1] });
    expect(invalid.status).toBe(400);
    expect(await prisma.financialTransaction.findMany({ where: { companyId: primaryCompanyId }, orderBy: { id: 'asc' } })).toEqual(before);
    expect((await prisma.recurringTransaction.findUniqueOrThrow({ where: { id: salary.id } })).isActive).toBe(true);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).balance.toFixed(2)).toBe('5000.00');
    // A selected source that exists only before the chosen month still controls accumulated cash.
    await prisma.recurringTransaction.update({ where: { id: rent.id }, data: { endDate: new Date('2026-09-30T12:00:00Z') } });
    const earlierIncome = await FinancialForecastService.getForecast(params);
    expect(earlierIncome.incomes.find((income) => income.id === rent.id)).toMatchObject({ amount: '0.00', included: true });
    const earlierIncomeOff = await FinancialForecastService.getForecast({
      ...params, options: { ...defaultForecastOptions, excludedIncomeIds: [rent.id] }
    });
    expect(Number(earlierIncome.endingBalance) - Number(earlierIncomeOff.endingBalance)).toBe(500);
  });

  it('keeps card estimates separate and never adds purchases to a closed invoice', async () => {
    const card = await prisma.financialAccount.create({ data: { name: 'Forecast card', type: 'CREDIT_CARD', balance: 0, statementClosingDay: 20, statementDueDay: 28, companyId: primaryCompanyId } });
    const category = await prisma.financialCategory.create({ data: { name: 'Card food', type: 'EXPENSE', color: '#fff', companyId: primaryCompanyId } });
    const invoices = await Promise.all([7, 8, 9, 10].map((month) => prisma.creditCardInvoice.create({ data: {
      accountId: card.id, referenceMonth: month, referenceYear: 2026,
      closingDate: new Date(Date.UTC(2026, month - 1, 20, 12)), dueDate: new Date(Date.UTC(2026, month - 1, 28, 12)),
      status: month < 9 ? 'PAID' : month === 9 ? 'CLOSED' : 'OPEN'
    } })));
    const common = { type: 'EXPENSE' as const, fromAccountId: card.id, categoryId: category.id, companyId: primaryCompanyId, createdBy: primaryUserId, status: 'COMPLETED' as const };
    await prisma.financialTransaction.createMany({ data: invoices.map((invoice, index) => ({
      ...common, description: 'Card variable', amount: index === 3 ? 40 : 100, date: invoice.closingDate, creditCardInvoiceId: invoice.id
    })) });
    const installment = await prisma.financialTransaction.create({ data: {
      ...common, description: 'Card installment', amount: 60, date: invoices[3].closingDate, creditCardInvoiceId: invoices[3].id,
      totalInstallments: 3, installmentNumber: 2, purchaseGroupId: 'forecast-installment'
    } });
    await prisma.financialTransaction.create({ data: {
      ...common, type: 'INCOME', fromAccountId: null, toAccountId: card.id, description: 'Installment refund', amount: 10, date: invoices[3].closingDate, creditCardInvoiceId: invoices[3].id,
      creditCardCreditKind: 'REFUND', refundOfTransactionId: installment.id
    } });
    const params = { companyId: primaryCompanyId, at: new Date('2026-09-23T15:00:00Z'), options: defaultForecastOptions };
    const september = await FinancialForecastService.getForecast(params);
    expect(september).toMatchObject({ expense: '100.00', endingBalance: '-100.00' });
    expect(september.variables[0]).toMatchObject({ historicalAverage: '100.00', included: false, cycleUnavailable: true });
    const october = await FinancialForecastService.getForecast({ ...params, month: '2026-10' });
    expect(october.variables[0]).toMatchObject({ historicalAverage: '100.00', committedInMonth: '40.00', remainingProjected: '60.00', included: true });
    expect(october).toMatchObject({ expense: '150.00', endingBalance: '-250.00' });
    const known = await FinancialForecastService.getForecast({ ...params, month: '2026-10', options: { ...defaultForecastOptions, cardMode: 'KNOWN_ONLY' } });
    expect(known).toMatchObject({ expense: '90.00', endingBalance: '-190.00' });
    // Remove the referencing credit before the original purchase (restrict FK).
    await prisma.financialTransaction.deleteMany({ where: { refundOfTransactionId: installment.id } });
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
        trackedExpenseCategoryIds: [categories[0].id, categories[1].id],
        smallSliceThresholdPercent: 5
      });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.trackedExpenseCategoryIds).toEqual([
      categories[0].id,
      categories[1].id
    ]);
    expect(firstResponse.body.smallSliceThresholdPercent).toBe(5);

    const sameUserOtherCompany = await request(app)
      .get('/api/financial/preferences/variable-projection')
      .set(authHeaders(primaryToken, secondaryCompanyId));

    expect(sameUserOtherCompany.status).toBe(200);
    expect(sameUserOtherCompany.body.trackedExpenseCategoryIds).toEqual([]);
    expect(sameUserOtherCompany.body.smallSliceThresholdPercent).toBe(3);

    const otherUserSameCompany = await request(app)
      .get('/api/financial/preferences/variable-projection')
      .set(authHeaders(secondaryToken, primaryCompanyId));

    expect(otherUserSameCompany.status).toBe(200);
    expect(otherUserSameCompany.body.trackedExpenseCategoryIds).toEqual([]);
    expect(otherUserSameCompany.body.smallSliceThresholdPercent).toBe(3);

    const tooManyResponse = await request(app)
      .put('/api/financial/preferences/variable-projection')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .send({
        trackedExpenseCategoryIds: categories.map((category) => category.id),
        smallSliceThresholdPercent: 3
      });

    expect(tooManyResponse.status).toBe(400);
  });

  it('returns the monthly dashboard using current balance as the truth and discounts committed items from the variable projection', async () => {
    const now = new Date();
    const realGetContext = WorkspaceFinancialCalendarService.getContext.bind(WorkspaceFinancialCalendarService);
    jest.spyOn(WorkspaceFinancialCalendarService, 'getContext').mockImplementation((companyId) =>
      realGetContext(companyId, new Date(now.getFullYear(), now.getMonth(), 15, 12)));
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

    await prisma.recurringTransaction.create({
      data: {
        description: 'Receita projetada do mes',
        amount: 80,
        type: TransactionType.INCOME,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: 22,
        startDate: buildDate(currentYear, currentMonthIndex - 2, 22),
        nextDueDate: buildDate(currentYear, currentMonthIndex, 22),
        isActive: true,
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
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
    expect(response.body.currentMonthBreakdown.income.remaining).toBe('580.00');
    expect(response.body.currentMonthBreakdown.expense.realizedCommitted).toBe('50.00');
    expect(response.body.currentMonthBreakdown.expense.remainingCommitted).toBe('50.00');
    expect(response.body.currentMonthBreakdown.expense.remainingVariableProjected).toBe('50.00');
    expect(response.body.variableProjection.total).toBe('50.00');
    expect(response.body.projectedEndingBalance).toBe('1430.00');
    expect(response.body.variableProjection.categories).toEqual([
      {
        categoryId: trackedExpenseCategory.id,
        categoryName: 'Combustivel',
        color: '#f97316',
        month: currentMonthKey,
        historicalAverage: '120.00',
        committedInMonth: '70.00',
        remainingProjected: '50.00'
      }
    ]);
    expect(response.body.categoryTotals).toEqual(
      expect.arrayContaining([
        {
          categoryId: trackedExpenseCategory.id,
          name: 'Combustivel',
          color: '#f97316',
          type: 'EXPENSE',
          amount: '150.00',
          realizedAmount: '50.00',
          pendingAmount: '20.00',
          projectedAmount: '80.00'
        },
        {
          categoryId: incomeCategory.id,
          name: 'Receita Variavel',
          color: '#22c55e',
          type: 'INCOME',
          amount: '580.00',
          realizedAmount: '0.00',
          pendingAmount: '500.00',
          projectedAmount: '80.00'
        }
      ])
    );

    const nextMonthKey = addMonthKey(currentMonthKey, 1);
    const nextMonthResponse = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: nextMonthKey });

    expect(nextMonthResponse.status).toBe(200);
    expect(nextMonthResponse.body.month).toBe(nextMonthKey);
    expect(nextMonthResponse.body.carryOver).toEqual({
      amount: '1430.00',
      source: 'PREVIOUS_PROJECTED'
    });
    expect(nextMonthResponse.body.monthlyTotals).toEqual({
      incomeTotal: '80.00',
      expenseTotal: '150.00',
      committedExpenseTotal: '30.00',
      variableProjectedExpenseTotal: '120.00',
      provisionContributionTotal: '0.00'
    });
    expect(nextMonthResponse.body.projectedEndingBalance).toBe('1360.00');
  });

  it('projects provision contributions without turning them into expenses or account movements', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const nextMonthKey = addMonthKey(currentMonthKey, 1);
    const targetMonthKey = addMonthKey(currentMonthKey, 3);
    const [currentYear, currentMonth] = currentMonthKey.split('-').map(Number);
    const [targetYear, targetMonth] = targetMonthKey.split('-').map(Number);

    await prisma.financialAccount.create({
      data: {
        name: 'Conta da provisao projetada',
        type: 'CHECKING',
        balance: 1000,
        companyId: primaryCompanyId
      }
    });
    const category = await prisma.financialCategory.create({
      data: {
        name: 'Despesa anual provisionada',
        type: 'EXPENSE',
        color: '#8b5cf6',
        companyId: primaryCompanyId
      }
    });
    const provision = await prisma.financialProvision.create({
      data: {
        companyId: primaryCompanyId,
        createdBy: primaryUserId,
        categoryId: category.id,
        name: 'IPVA futuro',
        kind: FinancialProvisionKind.ONE_TIME,
        expectedAmount: 900,
        reservedAmount: 0,
        startMonth: buildDate(currentYear, currentMonth - 1, 1),
        targetDate: buildDate(targetYear, targetMonth - 1, 15)
      }
    });

    const [currentResponse, nextResponse, targetResponse] = await Promise.all([
      request(app)
        .get('/api/financial/dashboard/monthly')
        .set(authHeaders(primaryToken, primaryCompanyId))
        .query({ month: currentMonthKey }),
      request(app)
        .get('/api/financial/dashboard/monthly')
        .set(authHeaders(primaryToken, primaryCompanyId))
        .query({ month: nextMonthKey }),
      request(app)
        .get('/api/financial/dashboard/monthly')
        .set(authHeaders(primaryToken, primaryCompanyId))
        .query({ month: targetMonthKey })
    ]);

    expect(currentResponse.status).toBe(200);
    expect(currentResponse.body.provisions).toEqual({
      total: '300.00',
      items: [
        {
          provisionId: provision.id,
          provisionName: 'IPVA futuro',
          categoryId: category.id,
          categoryName: 'Despesa anual provisionada',
          color: '#8b5cf6',
          month: currentMonthKey,
          targetMonth: targetMonthKey,
          amount: '300.00'
        }
      ]
    });
    expect(currentResponse.body.monthlyTotals.expenseTotal).toBe('0.00');
    expect(currentResponse.body.categoryTotals).toEqual([]);
    expect(currentResponse.body.projectedEndingBalance).toBe('1000.00');

    expect(nextResponse.status).toBe(200);
    expect(nextResponse.body.provisions.total).toBe('300.00');
    expect(nextResponse.body.monthlyTotals.expenseTotal).toBe('0.00');
    expect(nextResponse.body.projectedEndingBalance).toBe('1000.00');

    expect(targetResponse.status).toBe(200);
    expect(targetResponse.body.provisions).toEqual({ total: '0.00', items: [] });
    expect(targetResponse.body.monthlyTotals.expenseTotal).toBe('0.00');
    expect(targetResponse.body.projectedEndingBalance).toBe('1000.00');
  });

  it('uses settled cash history and card credits in the variable expense average', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();

    const [checkingAccount, creditCardAccount, expenseCategory] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          name: 'Conta da media liquidada',
          type: 'CHECKING',
          balance: 1000,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialAccount.create({
        data: {
          name: 'Cartao da media liquidada',
          type: 'CREDIT_CARD',
          balance: 0,
          creditLimit: 2000,
          statementClosingDay: 20,
          statementDueDay: 28,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Variavel liquidada',
          type: 'EXPENSE',
          color: '#f97316',
          companyId: primaryCompanyId
        }
      })
    ]);

    for (let offset = 1; offset <= 6; offset += 1) {
      const historicalDate = buildDate(currentYear, currentMonthIndex - offset, 10);
      await prisma.financialTransaction.create({
        data: {
          description: `Despesa liquidada ${offset}`,
          amount: 100,
          date: historicalDate,
          dueDate: historicalDate,
          effectiveDate: historicalDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        }
      });
    }

    const previousMonth = buildDate(currentYear, currentMonthIndex - 2, 1);
    const previousMonthDate = buildDate(currentYear, currentMonthIndex - 1, 15);
    const paidInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccount.id,
        referenceYear: previousMonth.getFullYear(),
        referenceMonth: previousMonth.getMonth() + 1,
        closingDate: buildDate(currentYear, currentMonthIndex - 2, 10),
        dueDate: buildDate(currentYear, currentMonthIndex - 2, 15),
        settledAt: previousMonthDate,
        status: 'PAID',
        totalAmount: 50
      }
    });
    const openMonth = buildDate(currentYear, currentMonthIndex - 3, 1);
    const openInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccount.id,
        referenceYear: openMonth.getFullYear(),
        referenceMonth: openMonth.getMonth() + 1,
        closingDate: buildDate(currentYear, currentMonthIndex - 3, 10),
        dueDate: buildDate(currentYear, currentMonthIndex - 3, 15),
        status: 'OPEN',
        totalAmount: 300
      }
    });
    const inactiveRecurring = await prisma.recurringTransaction.create({
      data: {
        description: 'Fixa historica fora da media variavel',
        amount: 1200,
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: 10,
        startDate: buildDate(currentYear, currentMonthIndex - 6, 10),
        endDate: previousMonthDate,
        nextDueDate: previousMonthDate,
        isActive: false,
        fromAccountId: checkingAccount.id,
        categoryId: expenseCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    await prisma.financialTransaction.createMany({
      data: [
        {
          description: 'Despesa antiga ainda pendente',
          amount: 600,
          date: previousMonthDate,
          dueDate: previousMonthDate,
          type: 'EXPENSE',
          status: 'PENDING',
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Compra em fatura paga',
          amount: 60,
          date: previousMonthDate,
          effectiveDate: previousMonthDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          creditCardInvoiceId: paidInvoice.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Credito em fatura paga',
          amount: 10,
          date: previousMonthDate,
          effectiveDate: previousMonthDate,
          type: 'INCOME',
          status: 'COMPLETED',
          toAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          creditCardInvoiceId: paidInvoice.id,
          creditCardCreditKind: 'ADJUSTMENT',
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Compra em fatura ainda aberta',
          amount: 300,
          date: buildDate(currentYear, currentMonthIndex - 3, 8),
          effectiveDate: buildDate(currentYear, currentMonthIndex - 3, 8),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          creditCardInvoiceId: openInvoice.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Fixa materializada fora da media variavel',
          amount: 1200,
          date: previousMonthDate,
          dueDate: previousMonthDate,
          effectiveDate: previousMonthDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          recurringTransactionId: inactiveRecurring.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        }
      ]
    });

    await prisma.userVariableProjectionPreference.create({
      data: {
        userId: primaryUserId,
        companyId: primaryCompanyId,
        trackedExpenseCategoryIds: [expenseCategory.id]
      }
    });

    const response = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: currentMonthKey });

    expect(response.status).toBe(200);
    expect(response.body.variableProjection.categories).toEqual([
      expect.objectContaining({
        categoryId: expenseCategory.id,
        historicalAverage: '108.33',
        committedInMonth: '0.00',
        remainingProjected: '108.33'
      })
    ]);

    const settlementHistory = await FinancialDashboardService.getHistoryDashboard({
      companyId: primaryCompanyId,
      months: 7,
      categoryIds: [expenseCategory.id],
      transactionCategoryIds: [expenseCategory.id],
      excludeRecurringTransactions: true,
      recognitionPerspective: 'SETTLEMENT'
    });
    expect(settlementHistory.recognitionPerspective).toBe('SETTLEMENT');
    expect(
      settlementHistory.monthlyTotals.find(
        (month) => month.month === buildMonthKey(previousMonthDate)
      )
    ).toMatchObject({
      expenseTotal: '150.00'
    });
  });

  it('keeps future pending transactions in the unsettled dashboard breakdown', async () => {
    const now = new Date();
    const futureMonthKey = addMonthKey(buildMonthKey(now), 1);
    const [futureYear, futureMonth] = futureMonthKey.split('-').map(Number);

    const [checkingAccount, incomeCategory] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          name: 'Conta da receita futura',
          type: 'CHECKING',
          balance: 1000,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Receita futura pendente',
          type: 'INCOME',
          color: '#22c55e',
          companyId: primaryCompanyId
        }
      })
    ]);

    const futureDate = buildDate(futureYear, futureMonth - 1, 10);

    await prisma.financialTransaction.create({
      data: {
        description: 'Receita ainda nao liquidada',
        amount: 250,
        date: futureDate,
        dueDate: futureDate,
        type: 'INCOME',
        status: 'PENDING',
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    const response = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: futureMonthKey });

    expect(response.status).toBe(200);
    expect(response.body.currentMonthBreakdown.income).toEqual({
      realized: '0.00',
      remaining: '250.00'
    });
    expect(response.body.categoryTotals).toEqual([
      expect.objectContaining({
        categoryId: incomeCategory.id,
        amount: '250.00',
        realizedAmount: '0.00',
        pendingAmount: '250.00',
        projectedAmount: '0.00'
      })
    ]);
    expect(response.body.projectedEndingBalance).toBe('1250.00');
  });

  it('projects only each installment amount in its explicit competence month', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const nextMonthKey = addMonthKey(currentMonthKey, 1);
    const [currentYear, currentMonth] = currentMonthKey.split('-').map(Number);
    const [nextYear, nextMonth] = nextMonthKey.split('-').map(Number);
    const currentDueDate = buildDate(currentYear, currentMonth - 1, 18);
    const nextDueDate = buildDate(nextYear, nextMonth - 1, 18);
    const purchaseDate = buildDate(currentYear, currentMonth - 1, 5);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [checkingAccount, creditCardAccount, expenseCategory] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          name: 'Conta das parcelas por competencia',
          type: 'CHECKING',
          balance: 1000,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialAccount.create({
        data: {
          name: 'Cartao das parcelas por competencia',
          type: 'CREDIT_CARD',
          balance: 0,
          creditLimit: 3000,
          statementClosingDay: 10,
          statementDueDay: 18,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Parcelas por competencia',
          type: 'EXPENSE',
          color: '#7c3aed',
          companyId: primaryCompanyId
        }
      })
    ]);

    const installmentPlanId = `dashboard-plan-${suffix}`;
    await prisma.installmentPlan.create({
      data: {
        id: installmentPlanId,
        description: 'Curso em duas parcelas',
        totalAmount: 180,
        installmentCount: 2,
        purchaseDate,
        firstDueDate: currentDueDate,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    const [currentInvoice, nextInvoice] = await Promise.all([
      prisma.creditCardInvoice.create({
        data: {
          accountId: creditCardAccount.id,
          referenceYear: currentYear,
          referenceMonth: currentMonth,
          closingDate: buildDate(currentYear, currentMonth - 1, 10),
          dueDate: currentDueDate,
          status: 'OPEN',
          totalAmount: 50
        }
      }),
      prisma.creditCardInvoice.create({
        data: {
          accountId: creditCardAccount.id,
          referenceYear: nextYear,
          referenceMonth: nextMonth,
          closingDate: buildDate(nextYear, nextMonth - 1, 10),
          dueDate: nextDueDate,
          status: 'OPEN',
          totalAmount: 50
        }
      })
    ]);

    await prisma.financialTransaction.createMany({
      data: [
        {
          description: 'Curso - parcela 1',
          amount: 90,
          date: currentDueDate,
          dueDate: currentDueDate,
          type: 'EXPENSE',
          status: 'PENDING',
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          installmentNumber: 1,
          totalInstallments: 2,
          installmentPlanId
        },
        {
          description: 'Curso - parcela 2',
          amount: 90,
          date: nextDueDate,
          dueDate: nextDueDate,
          type: 'EXPENSE',
          status: 'PENDING',
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          installmentNumber: 2,
          totalInstallments: 2,
          installmentPlanId
        },
        {
          description: 'Notebook - parcela 1',
          amount: 50,
          date: purchaseDate,
          dueDate: currentInvoice.dueDate,
          effectiveDate: purchaseDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          installmentNumber: 1,
          totalInstallments: 2,
          purchaseGroupId: `dashboard-card-${suffix}`,
          creditCardInvoiceId: currentInvoice.id
        },
        {
          description: 'Notebook - parcela 2',
          amount: 50,
          date: purchaseDate,
          dueDate: nextInvoice.dueDate,
          effectiveDate: purchaseDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          installmentNumber: 2,
          totalInstallments: 2,
          purchaseGroupId: `dashboard-card-${suffix}`,
          creditCardInvoiceId: nextInvoice.id
        }
      ]
    });

    const [currentProjection, nextProjection] = await Promise.all([
      FinancialDashboardService.getMonthlyProjection({
        companyId: primaryCompanyId,
        userId: primaryUserId,
        month: currentMonthKey
      }),
      FinancialDashboardService.getMonthlyProjection({
        companyId: primaryCompanyId,
        userId: primaryUserId,
        month: nextMonthKey
      })
    ]);

    const summarizeInstallments = (projection: typeof currentProjection) =>
      projection.knownRows
        .filter((row) => row.competence.installment)
        .map((row) => ({
          month: row.competence.month,
          kind: row.competence.installment?.kind,
          number: row.competence.installment?.number,
          amount: row.amount.toFixed(2)
        }));

    expect(summarizeInstallments(currentProjection)).toEqual(
      expect.arrayContaining([
        {
          month: currentMonthKey,
          kind: 'NON_CARD_INSTALLMENT',
          number: 1,
          amount: '90.00'
        },
        {
          month: currentMonthKey,
          kind: 'CREDIT_CARD_INSTALLMENT',
          number: 1,
          amount: '50.00'
        }
      ])
    );
    expect(summarizeInstallments(nextProjection)).toEqual(
      expect.arrayContaining([
        {
          month: nextMonthKey,
          kind: 'NON_CARD_INSTALLMENT',
          number: 2,
          amount: '90.00'
        },
        {
          month: nextMonthKey,
          kind: 'CREDIT_CARD_INSTALLMENT',
          number: 2,
          amount: '50.00'
        }
      ])
    );
    expect(currentProjection.totals.committedExpenseTotal.toFixed(2)).toBe('140.00');
    expect(nextProjection.totals.committedExpenseTotal.toFixed(2)).toBe('140.00');
  });

  it('settles completed card transactions only when the invoice is paid', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();

    const expenseCategory = await prisma.financialCategory.create({
      data: {
        name: 'Compras no cartao',
        type: 'EXPENSE',
        color: '#ef4444',
        companyId: primaryCompanyId
      }
    });

    const [closedCard, paidCard] = await Promise.all([
      prisma.financialAccount.create({
        data: {
          name: 'Cartao com fatura fechada',
          type: 'CREDIT_CARD',
          balance: -40,
          creditLimit: 1000,
          statementClosingDay: 20,
          statementDueDay: 28,
          companyId: primaryCompanyId
        }
      }),
      prisma.financialAccount.create({
        data: {
          name: 'Cartao com fatura paga',
          type: 'CREDIT_CARD',
          balance: -30,
          creditLimit: 1000,
          statementClosingDay: 20,
          statementDueDay: 28,
          companyId: primaryCompanyId
        }
      })
    ]);

    const dueDate = buildDate(currentYear, currentMonthIndex, 28);
    const [closedInvoice, paidInvoice] = await Promise.all([
      prisma.creditCardInvoice.create({
        data: {
          accountId: closedCard.id,
          referenceYear: currentYear,
          referenceMonth: currentMonthIndex + 1,
          closingDate: buildDate(currentYear, currentMonthIndex, 20),
          dueDate,
          status: 'CLOSED',
          totalAmount: 40
        }
      }),
      prisma.creditCardInvoice.create({
        data: {
          accountId: paidCard.id,
          referenceYear: currentYear,
          referenceMonth: currentMonthIndex + 1,
          closingDate: buildDate(currentYear, currentMonthIndex, 20),
          dueDate,
          status: 'PAID',
          totalAmount: 30
        }
      })
    ]);

    await prisma.financialTransaction.createMany({
      data: [
        {
          description: 'Compra em fatura fechada',
          amount: 40,
          date: buildDate(currentYear, currentMonthIndex, 5),
          dueDate,
          effectiveDate: buildDate(currentYear, currentMonthIndex, 5),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: closedCard.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          creditCardInvoiceId: closedInvoice.id
        },
        {
          description: 'Compra em fatura paga',
          amount: 30,
          date: buildDate(currentYear, currentMonthIndex, 6),
          dueDate,
          effectiveDate: buildDate(currentYear, currentMonthIndex, 6),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: paidCard.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId,
          creditCardInvoiceId: paidInvoice.id
        }
      ]
    });

    const response = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: currentMonthKey });

    expect(response.status).toBe(200);
    expect(response.body.currentMonthBreakdown.expense.realizedCommitted).toBe('30.00');
    expect(response.body.currentMonthBreakdown.expense.remainingCommitted).toBe('40.00');
    expect(response.body.categoryTotals).toEqual([
      expect.objectContaining({
        categoryId: expenseCategory.id,
        amount: '70.00',
        realizedAmount: '30.00',
        pendingAmount: '40.00',
        projectedAmount: '0.00'
      })
    ]);
  });

  it('ignores archived transactions and does not retro-project fixed occurrences in the current month', async () => {
    const now = new Date();
    const currentMonthKey = buildMonthKey(now);
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();
    const pastDay = Math.max(1, now.getDate() - 1);

    const checkingAccount = await prisma.financialAccount.create({
      data: {
        name: 'Conta Corrente Arquivada',
        type: 'CHECKING',
        balance: 1000,
        companyId: primaryCompanyId
      }
    });

    const incomeCategory = await prisma.financialCategory.create({
      data: {
        name: 'Receita Ignorada',
        type: 'INCOME',
        color: '#22c55e',
        companyId: primaryCompanyId
      }
    });

    const archivedIncomeDate = buildDate(currentYear, currentMonthIndex, Math.min(pastDay + 1, 28));

    await prisma.financialTransaction.create({
      data: {
        description: 'Receita materializada ignorada',
        amount: 320,
        date: archivedIncomeDate,
        dueDate: archivedIncomeDate,
        type: 'INCOME',
        status: 'PENDING',
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId,
        archivedAt: now,
        archivedBy: primaryUserId
      }
    });

    await prisma.recurringTransaction.create({
      data: {
        description: 'Receita fixa passada no mes',
        amount: 480,
        type: TransactionType.INCOME,
        frequency: RecurringFrequency.MONTHLY,
        dayOfMonth: pastDay,
        startDate: buildDate(currentYear, currentMonthIndex - 1, Math.min(pastDay, 28)),
        nextDueDate: buildDate(currentYear, currentMonthIndex, pastDay),
        isActive: true,
        toAccountId: checkingAccount.id,
        categoryId: incomeCategory.id,
        companyId: primaryCompanyId,
        createdBy: primaryUserId
      }
    });

    const response = await request(app)
      .get('/api/financial/dashboard/monthly')
      .set(authHeaders(primaryToken, primaryCompanyId))
      .query({ month: currentMonthKey });

    expect(response.status).toBe(200);
    expect(response.body.monthlyTotals.incomeTotal).toBe('0.00');
    expect(response.body.currentMonthBreakdown.income.realized).toBe('0.00');
    expect(response.body.currentMonthBreakdown.income.remaining).toBe('0.00');
    expect(response.body.projectedEndingBalance).toBe('1000.00');
  });

  it('returns the structural summary with active fixed items only and consolidated credit card values', async () => {
    const now = new Date();
    const currentMonthIndex = now.getMonth();
    const currentYear = now.getFullYear();

    const checkingAccount = await prisma.financialAccount.create({
      data: {
        name: 'Conta Estrutural',
        type: 'CHECKING',
        balance: 3000,
        companyId: primaryCompanyId
      }
    });

    const creditCardAccount = await prisma.financialAccount.create({
      data: {
        name: 'Cartao Estrutural',
        type: 'CREDIT_CARD',
        balance: -600,
        creditLimit: 5000,
        companyId: primaryCompanyId,
        statementClosingDay: 20,
        statementDueDay: 28
      }
    });

    const [incomeCategory, expenseCategory] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          name: 'Salario Fixo',
          type: 'INCOME',
          color: '#22c55e',
          companyId: primaryCompanyId
        }
      }),
      prisma.financialCategory.create({
        data: {
          name: 'Moradia',
          type: 'EXPENSE',
          color: '#ef4444',
          companyId: primaryCompanyId
        }
      })
    ]);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    const nextMonthStart = buildDate(currentYear, currentMonthIndex + 1, 5);

    await prisma.recurringTransaction.createMany({
      data: [
        {
          description: 'Receita fixa ativa',
          amount: 1200,
          type: TransactionType.INCOME,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 5,
          startDate: buildDate(currentYear, currentMonthIndex - 3, 5),
          nextDueDate: buildDate(currentYear, currentMonthIndex, 5),
          isActive: true,
          toAccountId: checkingAccount.id,
          categoryId: incomeCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Despesa fixa ativa',
          amount: 400,
          type: TransactionType.EXPENSE,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 10,
          startDate: buildDate(currentYear, currentMonthIndex - 4, 10),
          nextDueDate: buildDate(currentYear, currentMonthIndex, 10),
          isActive: true,
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Despesa fixa ativa no cartao',
          amount: 250,
          type: TransactionType.EXPENSE,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: null,
          startDate: buildDate(currentYear, currentMonthIndex - 2, 1),
          nextDueDate: buildDate(currentYear, currentMonthIndex, 20),
          isActive: true,
          fromAccountId: creditCardAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Receita futura nao iniciada',
          amount: 999,
          type: TransactionType.INCOME,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 5,
          startDate: nextMonthStart,
          nextDueDate: nextMonthStart,
          isActive: true,
          toAccountId: checkingAccount.id,
          categoryId: incomeCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Despesa encerrada',
          amount: 777,
          type: TransactionType.EXPENSE,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 12,
          startDate: buildDate(currentYear, currentMonthIndex - 6, 12),
          endDate: yesterday,
          nextDueDate: buildDate(currentYear, currentMonthIndex, 12),
          isActive: true,
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        },
        {
          description: 'Despesa inativa',
          amount: 333,
          type: TransactionType.EXPENSE,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 18,
          startDate: buildDate(currentYear, currentMonthIndex - 3, 18),
          nextDueDate: buildDate(currentYear, currentMonthIndex, 18),
          isActive: false,
          fromAccountId: checkingAccount.id,
          categoryId: expenseCategory.id,
          companyId: primaryCompanyId,
          createdBy: primaryUserId
        }
      ]
    });

    const response = await request(app)
      .get('/api/financial/dashboard/structural')
      .set(authHeaders(primaryToken, primaryCompanyId));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fixed: {
        incomeTotal: '1200.00',
        expenseTotal: '650.00',
        netTotal: '550.00'
      },
      creditCards: {
        totalLimit: '5000.00',
        usedLimit: '600.00',
        availableLimit: '4400.00'
      }
    });
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
    expect(response.body.recognitionPerspective).toBe('MATERIALIZED');
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
