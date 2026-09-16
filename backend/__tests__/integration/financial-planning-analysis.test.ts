import request from 'supertest';
import {
  AccountType,
  AppKey,
  CreditCardInvoiceStatus,
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

function monthDate(offset: number, day = 15): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day, 12));
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
            minimumMonthlyAmount: null
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

    for (const offset of [-3, -2, -1]) {
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
          monthlyAmount: '500.00'
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
      methodologyVersion: 1,
      basisHash: preview.body.basisHash,
      dataQualityScore: 100,
      status: 'CONFIRMED',
      totals: {
        monthlyIncome: '10000.00',
        monthlyCommittedExpenses: '2700.00',
        monthlyVariableExpenses: '500.00',
        monthlyProvisionContribution: '400.00',
        monthlyAvailableBeforeGoal: '6400.00',
        monthlyBalanceAfterGoal: '5400.00'
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

  it('blocks the feature in a business workspace', async () => {
    const response = await request(app)
      .get('/api/financial/budgets/planning-analysis/preview?historyMonths=3')
      .set({
        Authorization: `Bearer ${token}`,
        'X-Company-Id': String(businessCompanyId),
        [APP_KEY_HEADER]: APP_KEY_VALUE
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERSONAL_WORKSPACE_REQUIRED');
  });

  it('requires a fresh profile after a new expense category is created', async () => {
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
  });
});
