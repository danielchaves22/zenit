import request from 'supertest';
import {
  AccountType,
  AppKey,
  CreditCardCreditKind,
  CreditCardInvoiceStatus,
  PrismaClient,
  RecurringFrequency,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import app from '../../src/app';
import FinancialDashboardService from '../../src/services/financial-dashboard.service';
import FinancialPlanningAnalysisService from '../../src/services/financial-planning-analysis.service';
import FinancialProvisionService from '../../src/services/financial-provision.service';
import MonthlyCategoryBudgetService from '../../src/services/monthly-category-budget.service';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

function monthDate(offset: number, day = 15): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day, 12));
}

function monthKey(offset: number): string {
  const date = monthDate(offset, 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('Financial planning analysis preparation', () => {
  let userId: number;
  let token: string;
  let personalWorkspaceId: number;
  let businessCompanyId: number;
  let checkingAccountId: number;
  let creditCardAccountId: number;
  let expenseCategoryId: number;
  let variableCategoryId: number;
  let incomeCategoryId: number;
  let recurringIncomeId: number;

  const personalHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': String(personalWorkspaceId),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        email: `planning-analysis-${suffix}@test.com`,
        password: 'test-hash',
        name: 'Planning Analysis Owner',
        role: 'USER'
      }
    });
    userId = user.id;
    token = generateToken({ userId });

    const bootstrap = await request(app)
      .get('/api/me/financial-profile')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE);
    expect(bootstrap.status).toBe(200);
    personalWorkspaceId = bootstrap.body.personalWorkspace.id;

    const defaultExpense = await prisma.financialCategory.findFirstOrThrow({
      where: {
        companyId: personalWorkspaceId,
        type: TransactionType.EXPENSE,
        isDefault: true
      }
    });
    expenseCategoryId = defaultExpense.id;
    const defaultChecking = await prisma.financialAccount.findFirstOrThrow({
      where: { companyId: personalWorkspaceId, isDefault: true }
    });
    checkingAccountId = defaultChecking.id;

    const [variableCategory, incomeCategory, creditCard] = await Promise.all([
      prisma.financialCategory.create({
        data: {
          companyId: personalWorkspaceId,
          name: 'Lazer do diagnóstico',
          type: TransactionType.EXPENSE,
          color: '#8b5cf6'
        }
      }),
      prisma.financialCategory.create({
        data: {
          companyId: personalWorkspaceId,
          name: 'Salário do diagnóstico',
          type: TransactionType.INCOME,
          color: '#10b981'
        }
      }),
      prisma.financialAccount.create({
        data: {
          companyId: personalWorkspaceId,
          name: 'Cartão do diagnóstico',
          type: AccountType.CREDIT_CARD,
          balance: 0,
          creditLimit: 10000,
          statementClosingDay: 10,
          statementDueDay: 17
        }
      })
    ]);
    variableCategoryId = variableCategory.id;
    incomeCategoryId = incomeCategory.id;
    creditCardAccountId = creditCard.id;

    const profileCategoriesResponse = await request(app)
      .get('/api/me/financial-profile')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE);
    const profileSave = await request(app)
      .put('/api/me/financial-profile')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        planningContext: 'INDIVIDUAL',
        adultsCount: 1,
        dependentsCount: 0,
        financialDataCoverage: 'FULL',
        emergencyReserveTargetMonths: 6,
        planningStyle: 'BALANCED',
        adjustmentPace: 'GRADUAL',
        categoryPrioritiesReviewed: true,
        categoryPreferences: profileCategoriesResponse.body.categories.map(
          (category: { id: number }) => ({
            categoryId: category.id,
            flexibility: category.id === expenseCategoryId ? 'PROTECTED' : 'FLEXIBLE',
            minimumMonthlyAmount: category.id === variableCategoryId ? '300.00' : null
          })
        )
      });
    expect(profileSave.body.state).toBe('READY');

    const [recurringIncome, recurringExpense] = await Promise.all([
      prisma.recurringTransaction.create({
        data: {
          companyId: personalWorkspaceId,
          createdBy: userId,
          description: 'Salário principal',
          amount: 10000,
          type: TransactionType.INCOME,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 5,
          startDate: monthDate(-12, 1),
          nextDueDate: monthDate(0, 5),
          isActive: true,
          toAccountId: checkingAccountId,
          categoryId: incomeCategoryId
        }
      }),
      prisma.recurringTransaction.create({
        data: {
          companyId: personalWorkspaceId,
          createdBy: userId,
          description: 'Aluguel',
          amount: 2000,
          type: TransactionType.EXPENSE,
          frequency: RecurringFrequency.MONTHLY,
          dayOfMonth: 10,
          startDate: monthDate(-12, 1),
          nextDueDate: monthDate(0, 10),
          isActive: true,
          fromAccountId: checkingAccountId,
          categoryId: expenseCategoryId
        }
      })
    ]);
    recurringIncomeId = recurringIncome.id;

    const installmentPlan = await prisma.installmentPlan.create({
      data: {
        id: `planning-installment-${suffix}`,
        description: 'Curso parcelado',
        totalAmount: 1200,
        installmentCount: 3,
        purchaseDate: monthDate(-1),
        firstDueDate: monthDate(0, 20),
        companyId: personalWorkspaceId,
        createdBy: userId
      }
    });
    await prisma.financialTransaction.createMany({
      data: [0, 1].map((offset, index) => ({
        companyId: personalWorkspaceId,
        createdBy: userId,
        description: `Curso parcelado ${index + 1}/2`,
        amount: 400,
        date: monthDate(offset, 20),
        dueDate: monthDate(offset, 20),
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PENDING,
        fromAccountId: checkingAccountId,
        categoryId: expenseCategoryId,
        installmentNumber: index + 1,
        totalInstallments: 2,
        installmentPlanId: installmentPlan.id
      }))
    });

    const invoices = await Promise.all(
      [0, 1].map((offset) => {
        const reference = monthDate(offset, 1);
        return prisma.creditCardInvoice.create({
          data: {
            accountId: creditCardAccountId,
            referenceYear: reference.getUTCFullYear(),
            referenceMonth: reference.getUTCMonth() + 1,
            closingDate: monthDate(offset, 10),
            dueDate: monthDate(offset, 17),
            status: CreditCardInvoiceStatus.OPEN,
            totalAmount: 300
          }
        });
      })
    );
    await prisma.financialTransaction.createMany({
      data: invoices.map((invoice, index) => ({
        companyId: personalWorkspaceId,
        createdBy: userId,
        description: 'Notebook parcelado',
        amount: 300,
        date: monthDate(index, 5),
        dueDate: invoice.dueDate,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId,
        installmentNumber: index + 1,
        totalInstallments: 2,
        purchaseGroupId: `card-group-${suffix}`,
        creditCardInvoiceId: invoice.id
      }))
    });

    await prisma.financialProvision.create({
      data: {
        companyId: personalWorkspaceId,
        createdBy: userId,
        categoryId: expenseCategoryId,
        name: 'Seguro anual',
        kind: 'ANNUAL',
        status: 'ACTIVE',
        expectedAmount: 1200,
        reservedAmount: 0,
        startMonth: monthDate(0, 1),
        targetDate: monthDate(3, 15)
      }
    });

    for (const offset of [-6, -5, -4, -3, -2, -1]) {
      await prisma.financialTransaction.createMany({
        data: [
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: 'Lazer variável',
            amount: 500,
            date: monthDate(offset),
            effectiveDate: monthDate(offset),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: checkingAccountId,
            categoryId: variableCategoryId
          },
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: 'Aluguel materializado',
            amount: 2000,
            date: monthDate(offset, 10),
            effectiveDate: monthDate(offset, 10),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: checkingAccountId,
            categoryId: expenseCategoryId,
            recurringTransactionId: recurringExpense.id
          },
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: 'Parcela histórica',
            amount: 200,
            date: monthDate(offset, 20),
            effectiveDate: monthDate(offset, 20),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: checkingAccountId,
            categoryId: expenseCategoryId,
            purchaseGroupId: `historical-group-${offset}`,
            installmentNumber: 1,
            totalInstallments: 2
          }
        ]
      });

      const reference = monthDate(offset, 1);
      const settledAt = monthDate(offset, 17);
      const paidInvoice = await prisma.creditCardInvoice.create({
        data: {
          accountId: creditCardAccountId,
          referenceYear: reference.getUTCFullYear(),
          referenceMonth: reference.getUTCMonth() + 1,
          closingDate: monthDate(offset, 10),
          dueDate: settledAt,
          settledAt,
          status: CreditCardInvoiceStatus.PAID,
          totalAmount: 80
        }
      });
      await prisma.financialTransaction.createMany({
        data: [
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: 'Compra variável no cartão',
            amount: 100,
            date: monthDate(offset, 8),
            effectiveDate: monthDate(offset, 8),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: creditCardAccountId,
            categoryId: variableCategoryId,
            creditCardInvoiceId: paidInvoice.id
          },
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: 'Crédito da compra variável',
            amount: 20,
            date: monthDate(offset, 9),
            effectiveDate: monthDate(offset, 9),
            type: TransactionType.INCOME,
            status: TransactionStatus.COMPLETED,
            toAccountId: creditCardAccountId,
            categoryId: variableCategoryId,
            creditCardInvoiceId: paidInvoice.id,
            creditCardCreditKind: CreditCardCreditKind.ADJUSTMENT
          }
        ]
      });
    }

    const business = await prisma.company.create({
      data: {
        name: 'Empresa fora do diagnóstico pessoal',
        code: Number(String(Date.now()).slice(-7)) + 7000000
      }
    });
    businessCompanyId = business.id;
    await prisma.userCompany.create({
      data: { userId, companyId: business.id, role: 'USER', isDefault: false }
    });
    const cashApp = await prisma.ecosystemApp.findUniqueOrThrow({
      where: { appKey: AppKey.ZENIT_CASH }
    });
    await prisma.companyAppEntitlement.create({
      data: { companyId: business.id, appId: cashApp.id, enabled: true }
    });
    await prisma.userAppGrant.create({
      data: { userId, companyId: business.id, appId: cashApp.id, granted: true }
    });
  });

  afterAll(async () => {
    await prisma.financialPlanningSnapshot.deleteMany({ where: { ownerUserId: userId } });
    await prisma.personalFinancialProfile.deleteMany({ where: { ownerUserId: userId } });
    await prisma.financialProvisionEntry.deleteMany({
      where: { provision: { companyId: personalWorkspaceId } }
    });
    await prisma.financialProvision.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.financialTransaction.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.creditCardInvoice.deleteMany({
      where: { account: { companyId: personalWorkspaceId } }
    });
    await prisma.installmentPlan.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.userAppGrant.deleteMany({
      where: { companyId: { in: [personalWorkspaceId, businessCompanyId] } }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: { companyId: { in: [personalWorkspaceId, businessCompanyId] } }
    });
    await prisma.userCompany.deleteMany({
      where: { companyId: { in: [personalWorkspaceId, businessCompanyId] } }
    });
    await prisma.financialAccount.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.financialCategory.deleteMany({ where: { companyId: personalWorkspaceId } });
    await prisma.company.deleteMany({
      where: { id: { in: [personalWorkspaceId, businessCompanyId] } }
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('uses the workspace month for the historical window and provision contribution', async () => {
    const boundaryInstant = new Date('2026-01-01T02:30:00.000Z');
    const suffix = `calendar-boundary-${Date.now()}`;
    const originalWorkspace = await prisma.company.findUniqueOrThrow({
      where: { id: personalWorkspaceId },
      select: { timeZone: true }
    });
    let provisionId: number | null = null;

    try {
      await prisma.company.update({
        where: { id: personalWorkspaceId },
        data: { timeZone: 'America/Sao_Paulo' }
      });
      await prisma.financialTransaction.createMany({
        data: [
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: `${suffix}-november`,
            amount: 111,
            date: new Date('2025-11-15T12:00:00.000Z'),
            effectiveDate: new Date('2025-11-15T12:00:00.000Z'),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: checkingAccountId,
            categoryId: variableCategoryId
          },
          {
            companyId: personalWorkspaceId,
            createdBy: userId,
            description: `${suffix}-december`,
            amount: 222,
            date: new Date('2025-12-15T12:00:00.000Z'),
            effectiveDate: new Date('2025-12-15T12:00:00.000Z'),
            type: TransactionType.EXPENSE,
            status: TransactionStatus.COMPLETED,
            fromAccountId: checkingAccountId,
            categoryId: variableCategoryId
          }
        ]
      });
      const provision = await prisma.financialProvision.create({
        data: {
          companyId: personalWorkspaceId,
          createdBy: userId,
          categoryId: expenseCategoryId,
          name: `${suffix}-provision`,
          kind: 'ONE_TIME',
          status: 'ACTIVE',
          expectedAmount: 900,
          reservedAmount: 0,
          startMonth: new Date('2025-12-01T12:00:00.000Z'),
          targetDate: new Date('2026-03-20T12:00:00.000Z')
        }
      });
      provisionId = provision.id;

      const saoPaulo = await FinancialPlanningAnalysisService.preview({
        userId,
        companyId: personalWorkspaceId,
        historyMonths: 2,
        at: boundaryInstant
      });
      expect(saoPaulo).toMatchObject({
        methodologyVersion: 4,
        period: {
          historyMonths: 2,
          startDate: '2025-10-01',
          endDate: '2025-11-30'
        }
      });
      expect(
        saoPaulo.sources.find((source) => source.label === `${suffix}-provision`)
      ).toMatchObject({ monthlyAmount: '300.00' });
      const saoPauloProvisionList = await FinancialProvisionService.list(
        personalWorkspaceId,
        boundaryInstant
      );
      const saoPauloProvision = saoPauloProvisionList.items.find(
        (item) => item.id === provision.id
      );
      expect(saoPauloProvision?.monthlyContributionAmount).toBe('300.00');
      expect(
        saoPaulo.sources.find((source) => source.label === `${suffix}-provision`)?.monthlyAmount
      ).toBe(saoPauloProvision?.monthlyContributionAmount);
      expect(
        saoPaulo.sources.find(
          (source) => source.key === `HISTORICAL_CATEGORY:${variableCategoryId}`
        )
      ).toMatchObject({ monthlyAmount: '111.00' });

      await prisma.company.update({
        where: { id: personalWorkspaceId },
        data: { timeZone: 'UTC' }
      });
      const utc = await FinancialPlanningAnalysisService.preview({
        userId,
        companyId: personalWorkspaceId,
        historyMonths: 2,
        at: boundaryInstant
      });
      expect(utc.period).toEqual({
        historyMonths: 2,
        startDate: '2025-11-01',
        endDate: '2025-12-31'
      });
      expect(
        utc.sources.find((source) => source.label === `${suffix}-provision`)
      ).toMatchObject({ monthlyAmount: '450.00' });
      const utcProvisionList = await FinancialProvisionService.list(
        personalWorkspaceId,
        boundaryInstant
      );
      const utcProvision = utcProvisionList.items.find((item) => item.id === provision.id);
      expect(utcProvision?.monthlyContributionAmount).toBe('450.00');
      expect(
        utc.sources.find((source) => source.label === `${suffix}-provision`)?.monthlyAmount
      ).toBe(utcProvision?.monthlyContributionAmount);
      expect(
        utc.sources.find(
          (source) => source.key === `HISTORICAL_CATEGORY:${variableCategoryId}`
        )
      ).toMatchObject({ monthlyAmount: '166.50' });
    } finally {
      await prisma.financialTransaction.deleteMany({
        where: { companyId: personalWorkspaceId, description: { startsWith: suffix } }
      });
      if (provisionId) {
        await prisma.financialProvision.deleteMany({ where: { id: provisionId } });
      }
      await prisma.company.update({
        where: { id: personalWorkspaceId },
        data: { timeZone: originalWorkspace.timeZone }
      });
    }
  });

  it('keeps dashboard, monthly planning and diagnosis aligned in a composite scenario', async () => {
    const projectedMonth = monthKey(1);
    const referenceMonth = monthDate(1, 1);
    const futureProvision = await prisma.financialProvision.create({
      data: {
        companyId: personalWorkspaceId,
        createdBy: userId,
        categoryId: expenseCategoryId,
        name: 'Provisão ainda não iniciada',
        kind: 'ONE_TIME',
        status: 'ACTIVE',
        expectedAmount: 200,
        reservedAmount: 0,
        startMonth: monthDate(2, 1),
        targetDate: monthDate(4, 15)
      }
    });

    try {
      await prisma.userVariableProjectionPreference.upsert({
        where: {
          unique_user_variable_projection_preference: {
            userId,
            companyId: personalWorkspaceId
          }
        },
        update: { trackedExpenseCategoryIds: [variableCategoryId] },
        create: {
          userId,
          companyId: personalWorkspaceId,
          trackedExpenseCategoryIds: [variableCategoryId]
        }
      });
      await prisma.monthlyCategoryBudget.createMany({
        data: [
          {
            companyId: personalWorkspaceId,
            categoryId: expenseCategoryId,
            referenceMonth,
            limitAmount: 3000,
            includeChildren: true
          },
          {
            companyId: personalWorkspaceId,
            categoryId: variableCategoryId,
            referenceMonth,
            limitAmount: 700,
            includeChildren: true
          }
        ]
      });

      const [dashboard, planning, diagnosis] = await Promise.all([
        FinancialDashboardService.getMonthlyProjection({
          companyId: personalWorkspaceId,
          userId,
          month: projectedMonth
        }),
        MonthlyCategoryBudgetService.getPlan({
          companyId: personalWorkspaceId,
          userId,
          month: projectedMonth
        }),
        FinancialPlanningAnalysisService.preview({
          companyId: personalWorkspaceId,
          userId,
          historyMonths: 6
        })
      ]);

      const diagnosisSourceAmount = (kind: string) =>
        diagnosis.sources
          .filter((source) => source.kind === kind)
          .reduce((total, source) => total + Number(source.monthlyAmount), 0)
          .toFixed(2);
      const plannedFixedCategory = planning.items.find(
        (item) => item.category.id === expenseCategoryId
      );
      const plannedVariableCategory = planning.items.find(
        (item) => item.category.id === variableCategoryId
      );
      const dashboardFixedCategory = dashboard.categoryTotals.find(
        (item) => item.categoryId === expenseCategoryId
      );

      expect(diagnosis.methodologyVersion).toBe(4);
      expect(dashboard.totals.incomeTotal.toFixed(2)).toBe('10000.00');
      expect(diagnosisSourceAmount('FIXED_INCOME')).toBe('10000.00');

      expect(dashboard.totals.committedExpenseTotal.toFixed(2)).toBe('2700.00');
      expect(planning.summary.committedAmount).toBe('2700.00');
      expect(diagnosisSourceAmount('FIXED_EXPENSE')).toBe('2000.00');
      expect(diagnosisSourceAmount('INSTALLMENT')).toBe('700.00');
      expect(plannedFixedCategory?.committedAmount).toBe('2700.00');

      expect(dashboard.totals.variableProjectedExpenseTotal.toFixed(2)).toBe('580.00');
      expect(plannedVariableCategory?.historicalAverageAmount).toBe('580.00');
      expect(diagnosisSourceAmount('VARIABLE_EXPENSE')).toBe('580.00');

      expect(dashboard.totals.expenseTotal.toFixed(2)).toBe('3280.00');
      expect(planning.summary.forecastAmount).toBe('3280.00');
      expect(
        (Number(diagnosisSourceAmount('FIXED_EXPENSE')) +
          Number(diagnosisSourceAmount('INSTALLMENT')) +
          Number(diagnosisSourceAmount('VARIABLE_EXPENSE'))).toFixed(2)
      ).toBe('3280.00');

      expect(dashboard.totals.provisionContributionTotal.toFixed(2)).toBe('400.00');
      expect(diagnosisSourceAmount('PROVISION')).toBe('400.00');
      expect(dashboardFixedCategory?.amount.toFixed(2)).toBe('2700.00');
      expect(
        diagnosis.sources.some((source) => source.key === `PROVISION:${futureProvision.id}`)
      ).toBe(false);
      expect(
        dashboard.provisionContributionItems.some(
          (item) => item.provisionId === futureProvision.id
        )
      ).toBe(false);
    } finally {
      await prisma.monthlyCategoryBudget.deleteMany({
        where: { companyId: personalWorkspaceId, referenceMonth }
      });
      await prisma.userVariableProjectionPreference.deleteMany({
        where: { userId, companyId: personalWorkspaceId }
      });
      await prisma.financialProvision.delete({ where: { id: futureProvision.id } });
    }
  });

  it('builds a transparent preview without double-counting fixed and installment history', async () => {
    const response = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());

    expect(response.status).toBe(200);
    expect(response.body.dataQuality).toMatchObject({
      score: 100,
      rating: 'HIGH',
      monthsWithData: 3
    });
    const sources = response.body.sources as Array<{
      key: string;
      kind: string;
      label: string;
      monthlyAmount: string;
    }>;
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `RECURRING_TRANSACTION:${recurringIncomeId}`,
          kind: 'FIXED_INCOME',
          monthlyAmount: '10000.00'
        }),
        expect.objectContaining({
          kind: 'FIXED_EXPENSE',
          label: 'Aluguel',
          monthlyAmount: '2000.00'
        }),
        expect.objectContaining({
          kind: 'INSTALLMENT',
          label: 'Curso parcelado',
          monthlyAmount: '400.00'
        }),
        expect.objectContaining({
          kind: 'INSTALLMENT',
          label: 'Notebook parcelado',
          monthlyAmount: '300.00'
        }),
        expect.objectContaining({
          kind: 'PROVISION',
          label: 'Seguro anual',
          monthlyAmount: '400.00'
        }),
        expect.objectContaining({
          kind: 'VARIABLE_EXPENSE',
          label: 'Lazer do diagnóstico',
          monthlyAmount: '580.00',
          metadata: expect.objectContaining({
            flexibility: 'FLEXIBLE',
            minimumMonthlyAmount: '300.00'
          })
        })
      ])
    );
    expect(sources.filter((source) => source.kind === 'VARIABLE_EXPENSE')).toHaveLength(1);
  });

  it('confirms an immutable snapshot with the objective and selected totals', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());

    const response = await request(app)
      .post('/api/financial/budgets/planning-analysis/snapshots')
      .set(personalHeaders())
      .send({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings: '1000.00',
        historyMonths: 3,
        selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
        basisHash: preview.body.basisHash
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      objectiveKind: 'MONTHLY_SAVINGS',
      targetMonthlySavings: '1000.00',
      profileVersion: 1,
      methodologyVersion: 4,
      basisHash: preview.body.basisHash,
      dataQualityScore: 100,
      status: 'CONFIRMED',
      totals: {
        monthlyIncome: '10000.00',
        monthlyCommittedExpenses: '2700.00',
        monthlyVariableExpenses: '580.00',
        monthlyProvisionContribution: '400.00',
        monthlyAvailableBeforeGoal: '6320.00',
        monthlyBalanceAfterGoal: '5320.00'
      }
    });
    const stored = await prisma.financialPlanningSnapshot.findUnique({
      where: { id: response.body.id }
    });
    expect(stored?.ownerUserId).toBe(userId);
    expect(stored?.personalWorkspaceId).toBe(personalWorkspaceId);
    expect(stored?.basisHash).toBe(preview.body.basisHash);
    expect(stored?.confirmationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(stored?.sourceSnapshot)).toBe(true);
  });

  it('calculates explainable scenarios from a confirmed portrait without changing the budget', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());
    const confirmed = await request(app)
      .post('/api/financial/budgets/planning-analysis/snapshots')
      .set(personalHeaders())
      .send({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings: '6500.00',
        historyMonths: 3,
        selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
        basisHash: preview.body.basisHash
      });

    expect(confirmed.status).toBe(201);
    const scenarios = await request(app)
      .get(`/api/financial/budgets/planning-analysis/snapshots/${confirmed.body.id}/scenarios`)
      .set(personalHeaders());

    expect(scenarios.status).toBe(200);
    expect(scenarios.body).toMatchObject({
      snapshot: {
        id: confirmed.body.id,
        basisHash: confirmed.body.basisHash
      },
      recommendationMethodologyVersion: 1,
      status: 'ADJUSTMENT_REQUIRED',
      targetMonthlySavings: '6500.00',
      currentMonthlyAvailableBeforeGoal: '6320.00',
      currentMonthlyBalanceAfterGoal: '-180.00',
      requiredReduction: '180.00'
    });
    expect(scenarios.body.scenarios).toEqual([
      expect.objectContaining({
        id: 'PRESERVE_PRIORITIES',
        feasibility: 'FEASIBLE',
        proposedReduction: '180.00',
        remainingGap: '0.00',
        adjustments: [
          expect.objectContaining({
            sourceKey: `HISTORICAL_CATEGORY:${variableCategoryId}`,
            categoryName: 'Lazer do diagnóstico',
            currentAmount: '580.00',
            minimumMonthlyAmount: '300.00',
            proposedReduction: '180.00',
            suggestedMonthlyLimit: '400.00'
          })
        ]
      }),
      expect.objectContaining({
        id: 'BALANCED',
        feasibility: 'FEASIBLE',
        proposedReduction: '180.00',
        remainingGap: '0.00'
      })
    ]);
    expect(
      await prisma.monthlyCategoryBudget.count({
        where: { companyId: personalWorkspaceId }
      })
    ).toBe(0);
  });

  it('rejects scenarios when the confirmed portrait no longer matches the current basis', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());
    const confirmed = await request(app)
      .post('/api/financial/budgets/planning-analysis/snapshots')
      .set(personalHeaders())
      .send({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings: '6600.00',
        historyMonths: 3,
        selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
        basisHash: preview.body.basisHash
      });
    await prisma.recurringTransaction.update({
      where: { id: recurringIncomeId },
      data: { amount: 10100 }
    });

    try {
      const scenarios = await request(app)
        .get(`/api/financial/budgets/planning-analysis/snapshots/${confirmed.body.id}/scenarios`)
        .set(personalHeaders());

      expect(scenarios.status).toBe(409);
      expect(scenarios.body.code).toBe('FINANCIAL_PLANNING_SNAPSHOT_STALE_FOR_SCENARIOS');
    } finally {
      await prisma.recurringTransaction.update({
        where: { id: recurringIncomeId },
        data: { amount: 10000 }
      });
    }
  });

  it('requires at least one selected fixed income', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());
    const withoutIncome = preview.body.defaultSelectedSourceKeys.filter(
      (key: string) => !key.startsWith('RECURRING_TRANSACTION:')
    );

    const response = await request(app)
      .post('/api/financial/budgets/planning-analysis/snapshots')
      .set(personalHeaders())
      .send({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings: '1000.00',
        historyMonths: 3,
        selectedSourceKeys: withoutIncome,
        basisHash: preview.body.basisHash
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INCOME_SOURCE_REQUIRED');
  });

  it('rejects confirmation when the financial basis changed after preview', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());

    await prisma.recurringTransaction.update({
      where: { id: recurringIncomeId },
      data: { amount: 10500 }
    });

    try {
      const response = await request(app)
        .post('/api/financial/budgets/planning-analysis/snapshots')
        .set(personalHeaders())
        .send({
          objectiveKind: 'MONTHLY_SAVINGS',
          targetMonthlySavings: '1000.00',
          historyMonths: 3,
          selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
          basisHash: preview.body.basisHash
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('FINANCIAL_PLANNING_PREVIEW_STALE');
    } finally {
      await prisma.recurringTransaction.update({
        where: { id: recurringIncomeId },
        data: { amount: 10000 }
      });
    }
  });

  it('returns the same snapshot when an equivalent confirmation is repeated', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());
    const input = {
      objectiveKind: 'MONTHLY_SAVINGS',
      targetMonthlySavings: '1250.00',
      historyMonths: 3,
      selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
      basisHash: preview.body.basisHash
    };

    const [first, concurrent] = await Promise.all([
      request(app)
        .post('/api/financial/budgets/planning-analysis/snapshots')
        .set(personalHeaders())
        .send(input),
      request(app)
        .post('/api/financial/budgets/planning-analysis/snapshots')
        .set(personalHeaders())
        .send(input)
    ]);
    const repeated = await request(app)
      .post('/api/financial/budgets/planning-analysis/snapshots')
      .set(personalHeaders())
      .send({
        ...input,
        selectedSourceKeys: [...input.selectedSourceKeys].reverse()
      });

    expect([first.status, concurrent.status].sort()).toEqual([200, 201]);
    expect(concurrent.body.id).toBe(first.body.id);
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(first.body.id);
    expect(
      await prisma.financialPlanningSnapshot.count({
        where: {
          ownerUserId: userId,
          confirmationHash: { not: null },
          targetMonthlySavings: 1250
        }
      })
    ).toBe(1);
  });

  it('lists immutable snapshots with cursor pagination and loads full audit details on demand', async () => {
    const preview = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());
    const createdIds: number[] = [];
    for (const targetMonthlySavings of ['1400.00', '1500.00', '1600.00']) {
      const created = await request(app)
        .post('/api/financial/budgets/planning-analysis/snapshots')
        .set(personalHeaders())
        .send({
          objectiveKind: 'MONTHLY_SAVINGS',
          targetMonthlySavings,
          historyMonths: 3,
          selectedSourceKeys: preview.body.defaultSelectedSourceKeys,
          basisHash: preview.body.basisHash
        });
      expect(created.status).toBe(201);
      createdIds.push(created.body.id);
    }

    const firstPage = await request(app)
      .get('/api/financial/budgets/planning-analysis/snapshots?limit=2')
      .set(personalHeaders());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items.map((item: { id: number }) => item.id)).toEqual([
      createdIds[2],
      createdIds[1]
    ]);
    expect(firstPage.body.nextCursor).toBe(createdIds[1]);
    expect(firstPage.body.items[0]).toMatchObject({
      targetMonthlySavings: '1600.00',
      selectedSourceCount: preview.body.defaultSelectedSourceKeys.length,
      status: 'CONFIRMED'
    });
    expect(firstPage.body.items[0]).not.toHaveProperty('sources');
    expect(firstPage.body.items[0]).not.toHaveProperty('dataQuality');

    const secondPage = await request(app)
      .get(
        `/api/financial/budgets/planning-analysis/snapshots?limit=2&cursor=${firstPage.body.nextCursor}`
      )
      .set(personalHeaders());

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items[0].id).toBe(createdIds[0]);
    expect(
      secondPage.body.items.every((item: { id: number }) => item.id < firstPage.body.nextCursor)
    ).toBe(true);

    const detail = await request(app)
      .get(`/api/financial/budgets/planning-analysis/snapshots/${createdIds[2]}`)
      .set(personalHeaders());

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: createdIds[2],
      targetMonthlySavings: '1600.00',
      basisHash: preview.body.basisHash
    });
    expect(detail.body.sources).toEqual(expect.any(Array));
    expect(detail.body.dataQuality).toMatchObject({ score: 100, rating: 'HIGH' });

    const missing = await request(app)
      .get('/api/financial/budgets/planning-analysis/snapshots/2147483647')
      .set(personalHeaders());
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('FINANCIAL_PLANNING_SNAPSHOT_NOT_FOUND');
  });

  it('blocks the feature in a business workspace', async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Company-Id': String(businessCompanyId),
      [APP_KEY_HEADER]: APP_KEY_VALUE
    };
    const response = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(headers);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERSONAL_WORKSPACE_REQUIRED');

    const history = await request(app)
      .get('/api/financial/budgets/planning-analysis/snapshots')
      .set(headers);
    expect(history.status).toBe(403);
    expect(history.body.code).toBe('PERSONAL_WORKSPACE_REQUIRED');
  });

  it('requires a fresh profile for new analyses while preserving snapshot history access', async () => {
    await prisma.financialCategory.create({
      data: {
        companyId: personalWorkspaceId,
        name: `Categoria posterior ${Date.now()}`,
        type: TransactionType.EXPENSE,
        color: '#f97316'
      }
    });

    const response = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set(personalHeaders());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('FINANCIAL_PROFILE_OUTDATED');

    const history = await request(app)
      .get('/api/financial/budgets/planning-analysis/snapshots?limit=1')
      .set(personalHeaders());
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
  });
});
