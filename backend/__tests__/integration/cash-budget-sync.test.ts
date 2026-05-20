import request from 'supertest';
import bcrypt from 'bcrypt';
import {
  AppKey,
  BudgetEntryType,
  BudgetKind,
  BudgetStatus,
  FinancialAccountPurpose,
  PrismaClient
} from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';
const COMPANY_TIME_ZONE = 'America/Sao_Paulo';

jest.setTimeout(15000);

describe('Cash budget sync', () => {
  let companyId: number;
  let userId: number;
  let token: string;

  const now = new Date();
  const startIso = toCanonicalDayIso(now, 0);
  const endIso = toCanonicalDayIso(now, 4);
  const laterIso = new Date(Date.UTC(2026, 5, 19, 18, 0, 0, 0)).toISOString();
  const laterStillIso = new Date(Date.UTC(2026, 5, 20, 18, 0, 0, 0)).toISOString();

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const baseBudgetPayload = (overrides?: Record<string, unknown>) => ({
    clientKey: 'budget-alpha',
    code: 'Mercado',
    kind: BudgetKind.SPENDING,
    status: BudgetStatus.ACTIVE,
    initialBalanceCents: 10000,
    currentBalanceCents: 111,
    targetEndingBalanceCents: 2000,
    dailyBudgetInitialCents: 999,
    dailyBudgetCurrentCents: 222,
    dayExtraBalanceCents: 333,
    startDate: startIso,
    endDate: endIso,
    lastDailyBudgetDate: startIso,
    isPrimary: true,
    createdAt: startIso,
    updatedAt: laterIso,
    entries: [
      {
        clientKey: 'entry-extra-income',
        entryType: BudgetEntryType.INCOME,
        allocationMode: 'EXTRA',
        amountCents: 500,
        principalImpactAmountCents: 0,
        occurredAt: startIso,
        description: 'Troco',
        affectsBudgetBalance: true,
        createdAt: startIso,
        updatedAt: startIso
      },
      {
        clientKey: 'entry-expense',
        entryType: BudgetEntryType.EXPENSE,
        allocationMode: 'PRINCIPAL',
        amountCents: 2500,
        principalImpactAmountCents: 2000,
        occurredAt: startIso,
        description: 'Supermercado',
        affectsBudgetBalance: true,
        createdAt: startIso,
        updatedAt: startIso
      },
      {
        clientKey: 'entry-income',
        entryType: BudgetEntryType.INCOME,
        allocationMode: 'PRINCIPAL',
        amountCents: 1000,
        principalImpactAmountCents: 1000,
        occurredAt: startIso,
        description: 'Reembolso',
        affectsBudgetBalance: true,
        createdAt: startIso,
        updatedAt: startIso
      }
    ],
    ...overrides
  });

  beforeAll(async () => {
    const companyCode = Number(`6${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Budget Sync Test',
        code: companyCode,
        timeZone: COMPANY_TIME_ZONE
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `budget-sync-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Budget Sync Admin',
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

    token = generateToken({ userId });
  });

  beforeEach(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.budgetEntry.deleteMany({ where: { budget: { companyId } } });
    await prisma.budget.deleteMany({ where: { companyId } });
    await prisma.financialTag.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.budgetEntry.deleteMany({ where: { budget: { companyId } } });
    await prisma.budget.deleteMany({ where: { companyId } });
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

  it('returns timezone/businessDate, recalculates budgets canonically and only projects principal-impact entries', async () => {
    const syncResponse = await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [baseBudgetPayload()]
      });

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.timeZone).toBe(COMPANY_TIME_ZONE);
    expect(typeof syncResponse.body.businessDate).toBe('string');
    expect(syncResponse.body.conflicts).toEqual([]);
    expect(syncResponse.body.budgets).toHaveLength(1);

    const storedBudget = await prisma.budget.findFirst({
      where: { companyId, userId, clientKey: 'budget-alpha' },
      include: {
        entries: {
          orderBy: { clientKey: 'asc' }
        },
        financialAccount: true
      }
    });

    expect(storedBudget).not.toBeNull();
    expect(storedBudget?.financialAccount.purpose).toBe(FinancialAccountPurpose.BUDGET);
    expect(storedBudget?.financialAccount.isSystemManaged).toBe(true);
    expect(storedBudget?.entries).toHaveLength(3);
    expect(Number(storedBudget?.currentBalance)).toBe(85);
    expect(Number(storedBudget?.dailyBudgetInitial)).toBe(16);
    expect(Number(storedBudget?.dailyBudgetCurrent)).toBe(18);
    expect(Number(storedBudget?.dayExtraBalance)).toBe(5);

    const projectedTransactions = await prisma.financialTransaction.findMany({
      where: { companyId },
      orderBy: { description: 'asc' }
    });

    expect(projectedTransactions).toHaveLength(2);
    expect(projectedTransactions.map((item) => item.description)).toEqual([
      'Reembolso',
      'Supermercado'
    ]);
    expect(projectedTransactions.map((item) => Number(item.amount))).toEqual([10, 20]);

    const extraEntry = storedBudget?.entries.find((entry) => entry.clientKey === 'entry-extra-income');
    expect(extraEntry?.financialTransactionId).toBeNull();

    const listResponse = await request(app)
      .get('/api/cash/budgets')
      .set(authHeaders());

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.timeZone).toBe(COMPANY_TIME_ZONE);
    expect(typeof listResponse.body.businessDate).toBe('string');
    expect(listResponse.body.budgets).toHaveLength(1);
    expect(listResponse.body.budgets[0].entries).toHaveLength(3);
  });

  it('does not delete remote entries when they are omitted from a newer payload', async () => {
    await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [baseBudgetPayload()]
      });

    const syncResponse = await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [
          baseBudgetPayload({
            code: 'Mercado Atualizado',
            updatedAt: laterStillIso,
            entries: [
              {
                clientKey: 'entry-income',
                entryType: BudgetEntryType.INCOME,
                allocationMode: 'PRINCIPAL',
                amountCents: 1000,
                principalImpactAmountCents: 1000,
                occurredAt: startIso,
                description: 'Reembolso',
                affectsBudgetBalance: true,
                createdAt: startIso,
                updatedAt: laterStillIso
              }
            ]
          })
        ]
      });

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.conflicts).toEqual([]);
    expect(syncResponse.body.budgets[0].entries).toHaveLength(3);

    const storedBudget = await prisma.budget.findFirstOrThrow({
      where: { companyId, userId, clientKey: 'budget-alpha' },
      include: {
        entries: {
          orderBy: { clientKey: 'asc' }
        }
      }
    });

    expect(storedBudget.code).toBe('Mercado Atualizado');
    expect(storedBudget.entries).toHaveLength(3);
    expect(storedBudget.entries.map((entry) => entry.clientKey).sort()).toEqual([
      'entry-expense',
      'entry-extra-income',
      'entry-income'
    ]);
  });

  it('preserves newer server entries and returns entry conflicts on stale sync payloads', async () => {
    await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [
          baseBudgetPayload({
            entries: [
              {
                clientKey: 'entry-expense',
                entryType: BudgetEntryType.EXPENSE,
                allocationMode: 'PRINCIPAL',
                amountCents: 2500,
                principalImpactAmountCents: 2000,
                occurredAt: startIso,
                description: 'Supermercado',
                affectsBudgetBalance: true,
                createdAt: startIso,
                updatedAt: laterStillIso
              },
              {
                clientKey: 'entry-extra-income',
                entryType: BudgetEntryType.INCOME,
                allocationMode: 'EXTRA',
                amountCents: 500,
                principalImpactAmountCents: 0,
                occurredAt: startIso,
                description: 'Troco',
                affectsBudgetBalance: true,
                createdAt: startIso,
                updatedAt: startIso
              },
              {
                clientKey: 'entry-income',
                entryType: BudgetEntryType.INCOME,
                allocationMode: 'PRINCIPAL',
                amountCents: 1000,
                principalImpactAmountCents: 1000,
                occurredAt: startIso,
                description: 'Reembolso',
                affectsBudgetBalance: true,
                createdAt: startIso,
                updatedAt: startIso
              }
            ]
          })
        ]
      });

    const syncResponse = await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [
          baseBudgetPayload({
            code: 'Mercado Atualizado',
            updatedAt: laterIso,
            entries: [
              {
                clientKey: 'entry-expense',
                entryType: BudgetEntryType.EXPENSE,
                allocationMode: 'PRINCIPAL',
                amountCents: 9999,
                principalImpactAmountCents: 9999,
                occurredAt: startIso,
                description: 'Tentativa antiga',
                affectsBudgetBalance: true,
                createdAt: startIso,
                updatedAt: startIso
              }
            ]
          })
        ]
      });

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.conflicts).toEqual([
      {
        scope: 'entry',
        budgetClientKey: 'budget-alpha',
        entryClientKey: 'entry-expense'
      }
    ]);

    const storedBudget = await prisma.budget.findFirstOrThrow({
      where: { companyId, userId, clientKey: 'budget-alpha' }
    });
    const storedExpense = await prisma.budgetEntry.findFirstOrThrow({
      where: {
        budgetId: storedBudget.id,
        clientKey: 'entry-expense'
      }
    });

    expect(storedBudget.code).toBe('Mercado Atualizado');
    expect(storedExpense.description).toBe('Supermercado');
    expect(Number(storedExpense.amount)).toBe(25);
  });

  it('keeps budget accounts and transactions out of generic financial endpoints', async () => {
    await request(app)
      .put('/api/cash/budgets/sync')
      .set(authHeaders())
      .send({
        deviceId: 'device-alpha',
        budgets: [baseBudgetPayload()]
      });

    const budgetAccount = await prisma.financialAccount.findFirstOrThrow({
      where: {
        companyId,
        purpose: FinancialAccountPurpose.BUDGET
      }
    });

    const accountsResponse = await request(app)
      .get('/api/financial/accounts')
      .set(authHeaders());

    expect(accountsResponse.status).toBe(200);
    expect(
      accountsResponse.body.some((account: any) => account.id === budgetAccount.id)
    ).toBe(false);

    const transactionsResponse = await request(app)
      .get('/api/financial/transactions')
      .set(authHeaders())
      .query({
        startDate: startIso,
        endDate: endIso
      });

    expect(transactionsResponse.status).toBe(200);
    expect(transactionsResponse.body.data).toEqual([]);

    const summaryResponse = await request(app)
      .get('/api/financial/summary')
      .set(authHeaders())
      .query({
        startDate: startIso,
        endDate: endIso
      });

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.income).toBe(0);
    expect(summaryResponse.body.expense).toBe(0);
    expect(
      summaryResponse.body.accounts.some((account: any) => account.id === budgetAccount.id)
    ).toBe(false);
  });
});

function toCanonicalDayIso(baseDate: Date, dayOffset: number): string {
  return new Date(
    Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate() + dayOffset,
      12,
      0,
      0,
      0
    )
  ).toISOString();
}
