import request from 'supertest';
import bcrypt from 'bcrypt';
import {
  AppKey,
  FinancialTransactionImportSourceType,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';
import {
  addMonthsClamped,
  resolveCreditCardInvoiceReference
} from '../../src/utils/credit-card';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import CreditCardInvoiceService from '../../src/services/credit-card-invoice.service';
import FixedTransactionService, {
  buildOccurrenceKeyValue
} from '../../src/services/fixed-transaction.service';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Credit card invoices', () => {
  let companyId: number;
  let userId: number;
  let token: string;
  let regularUserId: number;
  let regularUserToken: string;
  let expenseCategoryId: number;
  let payerAccountId: number;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const regularUserAuthHeaders = () => ({
    Authorization: `Bearer ${regularUserToken}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const createCreditCardAccount = async (overrides?: {
    creditLimit?: number;
    statementClosingDay?: number;
    statementDueDay?: number;
  }) => {
    const response = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: `Cartao Teste ${Date.now()}`,
        type: 'CREDIT_CARD',
        initialBalance: 0,
        bankName: 'Banco Teste',
        creditLimit: overrides?.creditLimit ?? 1000,
        statementClosingDay: overrides?.statementClosingDay ?? 10,
        statementDueDay: overrides?.statementDueDay ?? 15
      });

    expect(response.status).toBe(201);
    return response.body;
  };

  const createLegacyCreditCardPurchase = async (cardId: number, data?: {
    amount?: number;
    categoryId?: number;
    description?: string;
    notes?: string;
    purchaseDate?: Date;
    dueDate?: Date;
  }) => {
    const purchaseDate = data?.purchaseDate || new Date();

    return prisma.financialTransaction.create({
      data: {
        description: data?.description || `Compra Legada ${Date.now()}`,
        amount: data?.amount ?? 75,
        date: purchaseDate,
        dueDate: data?.dueDate || purchaseDate,
        effectiveDate: purchaseDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        notes: data?.notes || '',
        fromAccountId: cardId,
        categoryId: data?.categoryId ?? expenseCategoryId,
        companyId,
        createdBy: userId
      }
    });
  };

  const buildMonthDate = (monthOffset: number, day: number) => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, day, 12, 0, 0, 0));
  };

  const buildDateAtHour = (baseDate: Date, hour: number) => {
    const value = new Date(baseDate);
    value.setHours(hour, 0, 0, 0);
    return value;
  };

  const buildCurrentCardCycleConfig = () => {
    const purchaseDate = new Date();
    purchaseDate.setHours(12, 0, 0, 0);
    const lastDayOfCurrentMonth = new Date(
      purchaseDate.getFullYear(),
      purchaseDate.getMonth() + 1,
      0
    ).getDate();
    const closingDay = Math.min(purchaseDate.getDate() + 1, lastDayOfCurrentMonth);
    const dueDay = closingDay < lastDayOfCurrentMonth ? closingDay + 1 : 5;
    const currentInvoiceReference = resolveCreditCardInvoiceReference(
      purchaseDate,
      closingDay,
      dueDay
    );

    return {
      purchaseDate,
      closingDay,
      dueDay,
      currentInvoiceReference
    };
  };

  const createFixedCardTemplate = async (
    cardId: number,
    occurrenceDate: Date,
    overrides?: {
      description?: string;
      amount?: number;
      isActive?: boolean;
      startDate?: Date;
      endDate?: Date | null;
    }
  ) => {
    const startDate = overrides?.startDate ?? new Date(
      occurrenceDate.getFullYear(),
      occurrenceDate.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    return prisma.recurringTransaction.create({
      data: {
        description: overrides?.description ?? `Fixa Cartao ${Date.now()}`,
        amount: overrides?.amount ?? 50,
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        dayOfMonth: null,
        startDate,
        endDate: overrides?.endDate,
        nextDueDate: occurrenceDate,
        isActive: overrides?.isActive ?? true,
        fromAccountId: cardId,
        categoryId: expenseCategoryId,
        companyId,
        createdBy: userId
      }
    });
  };

  beforeAll(async () => {
    const companyCode = Number(`7${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Credit Card Invoice Test',
        code: companyCode
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `credit-card-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Credit Card Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    const regularUser = await prisma.user.create({
      data: {
        email: `credit-card-user-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Credit Card User',
        role: 'USER'
      }
    });
    regularUserId = regularUser.id;

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
    await prisma.userCompany.create({
      data: {
        userId: regularUserId,
        companyId,
        isDefault: false,
        role: 'USER',
        manageFinancialAccounts: true,
        manageFinancialCategories: false
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
    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId: regularUserId,
          companyId,
          appId: ecosystemApp.id
        }
      },
      update: { granted: true },
      create: { userId: regularUserId, companyId, appId: ecosystemApp.id, granted: true }
    });

    token = generateToken({ userId });
    regularUserToken = generateToken({ userId: regularUserId });
  });

  beforeEach(async () => {
    await prisma.userFinancialAccountAccess.deleteMany({ where: { companyId } });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
    await prisma.financialTag.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });

    const payerAccount = await prisma.financialAccount.create({
      data: {
        name: `Conta Pagadora ${Date.now()}`,
        type: 'CHECKING',
        balance: 5000,
        allowNegativeBalance: true,
        companyId
      }
    });
    payerAccountId = payerAccount.id;

    const category = await prisma.financialCategory.create({
      data: {
        name: `Cartao Categoria ${Date.now()}`,
        type: 'EXPENSE',
        color: '#ff6600',
        companyId
      }
    });
    expenseCategoryId = category.id;
  });

  afterAll(async () => {
    await prisma.userFinancialAccountAccess.deleteMany({ where: { companyId } });
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
    await prisma.recurringTransaction.deleteMany({ where: { companyId } });
    await prisma.financialTag.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userAppGrant.deleteMany({ where: { companyId } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, regularUserId] } } });
    await prisma.$disconnect();
  });

  it('creates credit card accounts with limit and statement cycle', async () => {
    const card = await createCreditCardAccount();

    expect(card.type).toBe('CREDIT_CARD');
    expect(card.allowNegativeBalance).toBe(true);
    expect(card.creditLimit).toBe('1000');
    expect(card.statementClosingDay).toBe(10);
    expect(card.statementDueDay).toBe(15);
  });

  it('allows the same account name across different account types', async () => {
    const sharedName = `Conta Duplicada por Tipo ${Date.now()}`;

    const checkingResponse = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: sharedName,
        type: 'CHECKING',
        initialBalance: 0
      });

    expect(checkingResponse.status).toBe(201);

    const cardResponse = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: sharedName,
        type: 'CREDIT_CARD',
        initialBalance: 0,
        bankName: 'Banco Teste',
        creditLimit: 1000,
        statementClosingDay: 10,
        statementDueDay: 15
      });

    expect(cardResponse.status).toBe(201);
    expect(cardResponse.body.name).toBe(sharedName);
    expect(cardResponse.body.type).toBe('CREDIT_CARD');
  });

  it('keeps blocking duplicate names within the same account type', async () => {
    const sharedName = `Conta Duplicada Mesmo Tipo ${Date.now()}`;

    const firstResponse = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: sharedName,
        type: 'CHECKING',
        initialBalance: 0
      });

    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: sharedName,
        type: 'CHECKING',
        initialBalance: 0
      });

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body.error).toContain(sharedName);
  });

  it('creates installment purchases, groups them into invoices, pays and reopens the invoice on payment deletion', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-05-05T12:00:00.000Z');
    const afterClosingDate = new Date('2099-05-20T12:00:00.000Z');

    const installmentPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Notebook Parcelado',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 3
      });

    expect(installmentPurchase.status).toBe(201);
    expect(Array.isArray(installmentPurchase.body)).toBe(true);
    expect(installmentPurchase.body).toHaveLength(3);

    const [firstInstallment, secondInstallment, thirdInstallment] = installmentPurchase.body;

    expect(firstInstallment.purchaseGroupId).toBeTruthy();
    expect(firstInstallment.purchaseGroupId).toBe(secondInstallment.purchaseGroupId);
    expect(secondInstallment.purchaseGroupId).toBe(thirdInstallment.purchaseGroupId);
    expect(firstInstallment.installmentNumber).toBe(1);
    expect(secondInstallment.installmentNumber).toBe(2);
    expect(thirdInstallment.installmentNumber).toBe(3);
    expect(firstInstallment.totalInstallments).toBe(3);
    expect(firstInstallment.date).toContain('2099-05-05');
    expect(secondInstallment.date).toContain('2099-05-05');
    expect(thirdInstallment.date).toContain('2099-05-05');
    expect(firstInstallment.effectiveDate).toContain('2099-05-05');
    expect(secondInstallment.effectiveDate).toContain('2099-05-05');
    expect(thirdInstallment.effectiveDate).toContain('2099-05-05');
    expect(firstInstallment.dueDate).toContain('2099-05-15');
    expect(secondInstallment.dueDate).toContain('2099-06-15');
    expect(thirdInstallment.dueDate).toContain('2099-07-15');

    const afterClosingPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Depois do Fechamento',
        amount: 50,
        date: afterClosingDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(afterClosingPurchase.status).toBe(201);
    expect(afterClosingPurchase.body.dueDate).toContain('2099-06-15');

    const cardsResponse = await request(app)
      .get('/api/financial/credit-cards')
      .set(authHeaders());

    expect(cardsResponse.status).toBe(200);
    expect(cardsResponse.body).toHaveLength(1);
    expect(cardsResponse.body[0].usedLimit).toBe(350);
    expect(cardsResponse.body[0].availableLimit).toBe(650);
    expect(cardsResponse.body[0].nextInvoice.referenceMonth).toBe(5);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(invoicesResponse.status).toBe(200);
    expect(invoicesResponse.body).toHaveLength(3);

    const mayInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 5);
    const juneInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 6);
    const julyInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 7);

    expect(mayInvoice.totalAmount).toBe('100');
    expect(juneInvoice.totalAmount).toBe('150');
    expect(julyInvoice.totalAmount).toBe('100');

    const maySummary = await request(app)
      .get('/api/financial/summary')
      .set(authHeaders())
      .query({
        startDate: '2099-05-01T00:00:00.000Z',
        endDate: '2099-05-31T23:59:59.999Z'
      });

    expect(maySummary.status).toBe(200);
    expect(maySummary.body.expense).toBe(350);
    expect(Array.isArray(maySummary.body.accounts)).toBe(true);
    expect(maySummary.body.accounts.some((account: any) => account.type === 'CREDIT_CARD')).toBe(false);
    expect(maySummary.body.accounts.some((account: any) => account.id === payerAccountId)).toBe(true);

    const juneSummary = await request(app)
      .get('/api/financial/summary')
      .set(authHeaders())
      .query({
        startDate: '2099-06-01T00:00:00.000Z',
        endDate: '2099-06-30T23:59:59.999Z'
      });

    expect(juneSummary.status).toBe(200);
    expect(juneSummary.body.expense).toBe(0);

    const invoiceDetail = await request(app)
      .get(`/api/financial/credit-card-invoices/${mayInvoice.id}`)
      .set(authHeaders());

    expect(invoiceDetail.status).toBe(200);
    expect(invoiceDetail.body.transactions).toHaveLength(1);
    expect(invoiceDetail.body.displayStatus).toBe('OPEN');

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.status).toBe('PAID');
    expect(paymentResponse.body.paymentTransaction).toBeTruthy();

    const paidInvoiceId = paymentResponse.body.paymentTransaction.id;

    const payerAccountAfterPayment = await prisma.financialAccount.findUnique({
      where: { id: payerAccountId }
    });
    const cardAccountAfterPayment = await prisma.financialAccount.findUnique({
      where: { id: card.id }
    });

    expect(Number(payerAccountAfterPayment?.balance)).toBe(4900);
    expect(Number(cardAccountAfterPayment?.balance)).toBe(-250);

    const maySummaryAfterPayment = await request(app)
      .get('/api/financial/summary')
      .set(authHeaders())
      .query({
        startDate: '2099-05-01T00:00:00.000Z',
        endDate: '2099-05-31T23:59:59.999Z'
      });

    expect(maySummaryAfterPayment.status).toBe(200);
    expect(maySummaryAfterPayment.body.expense).toBe(350);
    expect(
      maySummaryAfterPayment.body.accounts.some((account: any) => account.type === 'CREDIT_CARD')
    ).toBe(false);

    const deletePaymentResponse = await request(app)
      .delete(`/api/financial/transactions/${paidInvoiceId}`)
      .set(authHeaders());

    expect(deletePaymentResponse.status).toBe(204);

    const reopenedInvoice = await request(app)
      .get(`/api/financial/credit-card-invoices/${mayInvoice.id}`)
      .set(authHeaders());

    expect(reopenedInvoice.status).toBe(200);
    expect(reopenedInvoice.body.status).toBe('OPEN');
    expect(reopenedInvoice.body.paymentTransaction).toBeNull();

    const payerAccountAfterDelete = await prisma.financialAccount.findUnique({
      where: { id: payerAccountId }
    });
    const cardAccountAfterDelete = await prisma.financialAccount.findUnique({
      where: { id: card.id }
    });

    expect(Number(payerAccountAfterDelete?.balance)).toBe(5000);
    expect(Number(cardAccountAfterDelete?.balance)).toBe(-350);
  });

  it('can omit paid invoices from the card invoice list', async () => {
    const card = await createCreditCardAccount();

    const mayPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra paga filtravel',
        amount: 100,
        date: '2099-05-05T12:00:00.000Z',
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });
    const junePurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra aberta filtravel',
        amount: 80,
        date: '2099-06-05T12:00:00.000Z',
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(mayPurchase.status).toBe(201);
    expect(junePurchase.status).toBe(201);

    const initialInvoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(initialInvoicesResponse.status).toBe(200);

    const mayInvoice = initialInvoicesResponse.body.find(
      (invoice: any) => invoice.referenceYear === 2099 && invoice.referenceMonth === 5
    );
    const juneInvoice = initialInvoicesResponse.body.find(
      (invoice: any) => invoice.referenceYear === 2099 && invoice.referenceMonth === 6
    );

    expect(mayInvoice).toBeTruthy();
    expect(juneInvoice).toBeTruthy();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.status).toBe('PAID');

    const fullInvoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(fullInvoicesResponse.status).toBe(200);
    expect(fullInvoicesResponse.body.some((invoice: any) => invoice.id === mayInvoice.id)).toBe(true);

    const unpaidInvoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .query({ includePaid: 'false' })
      .set(authHeaders());

    expect(unpaidInvoicesResponse.status).toBe(200);
    expect(unpaidInvoicesResponse.body.some((invoice: any) => invoice.id === mayInvoice.id)).toBe(false);
    expect(unpaidInvoicesResponse.body.some((invoice: any) => invoice.id === juneInvoice.id)).toBe(true);
    expect(unpaidInvoicesResponse.body.every((invoice: any) => invoice.status !== 'PAID')).toBe(true);
  });

  it('does not treat regular transfers as income or expense in the restricted financial summary', async () => {
    const hiddenAccount = await prisma.financialAccount.create({
      data: {
        name: `Conta Oculta ${Date.now()}`,
        type: 'SAVINGS',
        balance: 0,
        allowNegativeBalance: true,
        companyId
      }
    });
    const incomeCategory = await prisma.financialCategory.create({
      data: {
        name: `Categoria Receita ${Date.now()}`,
        type: 'INCOME',
        color: '#22c55e',
        companyId
      }
    });
    const activityDate = new Date('2099-05-10T12:00:00.000Z');

    await prisma.userFinancialAccountAccess.create({
      data: {
        userId: regularUserId,
        financialAccountId: payerAccountId,
        companyId,
        grantedBy: userId
      }
    });

    await prisma.financialTransaction.createMany({
      data: [
        {
          description: 'Receita permitida',
          amount: 300,
          date: activityDate,
          dueDate: activityDate,
          effectiveDate: activityDate,
          type: 'INCOME',
          status: 'COMPLETED',
          toAccountId: payerAccountId,
          categoryId: incomeCategory.id,
          companyId,
          createdBy: userId
        },
        {
          description: 'Despesa permitida',
          amount: 120,
          date: activityDate,
          dueDate: activityDate,
          effectiveDate: activityDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: payerAccountId,
          categoryId: expenseCategoryId,
          companyId,
          createdBy: userId
        },
        {
          description: 'Transferencia interna',
          amount: 70,
          date: activityDate,
          dueDate: activityDate,
          effectiveDate: activityDate,
          type: 'TRANSFER',
          status: 'COMPLETED',
          fromAccountId: payerAccountId,
          toAccountId: hiddenAccount.id,
          companyId,
          createdBy: userId
        }
      ]
    });

    const summaryResponse = await request(app)
      .get('/api/financial/summary')
      .set(regularUserAuthHeaders())
      .query({
        startDate: '2099-05-01T00:00:00.000Z',
        endDate: '2099-05-31T23:59:59.999Z'
      });

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.income).toBe(300);
    expect(summaryResponse.body.expense).toBe(120);
    expect(summaryResponse.body.balance).toBe(180);
    expect(summaryResponse.body.accounts).toHaveLength(1);
    expect(summaryResponse.body.accounts[0].id).toBe(payerAccountId);
  });

  it('reopens a paid invoice through the explicit endpoint', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-05-05T12:00:00.000Z');

    const purchaseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra para reabrir fatura',
        amount: 120,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(purchaseResponse.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(invoicesResponse.status).toBe(200);

    const mayInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 5);
    expect(mayInvoice).toBeTruthy();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.status).toBe('PAID');
    expect(paymentResponse.body.paymentTransaction).toBeTruthy();

    const reopenResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/reopen`)
      .set(authHeaders());

    expect(reopenResponse.status).toBe(200);
    expect(reopenResponse.body.status).toBe('OPEN');
    expect(reopenResponse.body.paymentTransaction).toBeNull();
    expect(reopenResponse.body.settlementType).toBeNull();
    expect(reopenResponse.body.settledAt).toBeNull();

    const payerAccountAfterReopen = await prisma.financialAccount.findUnique({
      where: { id: payerAccountId }
    });
    const cardAccountAfterReopen = await prisma.financialAccount.findUnique({
      where: { id: card.id }
    });

    expect(Number(payerAccountAfterReopen?.balance)).toBe(5000);
    expect(Number(cardAccountAfterReopen?.balance)).toBe(-120);
  });

  it('blocks manual retroactive card purchases into closed invoices', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = buildMonthDate(-1, 5);

    const installmentPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Retroativa Parcelada',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 3
      });

    expect(installmentPurchase.status).toBe(400);
    expect(installmentPurchase.body.error).toBe(
      'A data informada direciona esta compra para uma fatura ja fechada. Escolha a fatura aberta atual ou altere a data da compra.'
    );
  });

  it('allows confirmed manual retroactive card purchases into closed unpaid invoices', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = buildMonthDate(-1, 5);
    const invoiceReference = resolveCreditCardInvoiceReference(purchaseDate, 10, 15);

    const installmentPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Retroativa Confirmada',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 3,
        creditCardInvoiceReference: {
          referenceYear: invoiceReference.referenceYear,
          referenceMonth: invoiceReference.referenceMonth,
          closingDate: invoiceReference.closingDate.toISOString(),
          dueDate: invoiceReference.dueDate.toISOString()
        }
      });

    expect(installmentPurchase.status).toBe(201);

    const transactions = await prisma.financialTransaction.findMany({
      where: {
        companyId,
        purchaseGroupId: installmentPurchase.body[0].purchaseGroupId
      },
      include: {
        creditCardInvoice: true
      },
      orderBy: {
        installmentNumber: 'asc'
      }
    });

    expect(transactions).toHaveLength(3);
    expect(transactions[0].creditCardInvoice?.referenceYear).toBe(invoiceReference.referenceYear);
    expect(transactions[0].creditCardInvoice?.referenceMonth).toBe(invoiceReference.referenceMonth);
    expect(transactions[0].creditCardInvoice?.status).toBe('CLOSED');
    expect(transactions[0].isExternalCreditCardSettlement).toBe(false);
  });

  it('blocks manual purchases into an already paid invoice', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-05-05T12:00:00.000Z');

    const firstPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Base Fatura Paga',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(firstPurchase.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    const mayInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 5);
    expect(mayInvoice).toBeTruthy();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.status).toBe('PAID');

    const retroactivePurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Retroativa em Fatura Paga',
        amount: 40,
        date: '2099-05-06T12:00:00.000Z',
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(retroactivePurchase.status).toBe(400);
    expect(retroactivePurchase.body.error).toBe(
      'A fatura selecionada ja esta paga. Escolha uma fatura aberta ou altere a data da compra.'
    );
  });

  it('does not reopen a paid invoice when it contains external historical settlements', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-05-05T12:00:00.000Z');

    const firstPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Base Fatura Mista',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(firstPurchase.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    const mayInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 5);
    expect(mayInvoice).toBeTruthy();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);

    const retroactivePurchase = await FinancialTransactionService.createTransaction({
      description: 'Compra Historica Externa',
      amount: 40,
      date: new Date('2099-05-06T12:00:00.000Z'),
      type: TransactionType.EXPENSE,
      status: TransactionStatus.COMPLETED,
      fromAccountId: card.id,
      categoryId: expenseCategoryId,
      companyId,
      createdBy: userId,
      importSourceType: FinancialTransactionImportSourceType.NUBANK_CSV,
      importSourceDescription: 'Teste importado'
    });

    expect(Array.isArray(retroactivePurchase)).toBe(false);
    expect((retroactivePurchase as any).isExternalCreditCardSettlement).toBe(true);

    const reopenResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/reopen`)
      .set(authHeaders());

    expect(reopenResponse.status).toBe(400);
    expect(reopenResponse.body.error).toBe(
      'Faturas com liquidacoes fora do sistema nao podem ser reabertas'
    );
  });

  it('allows deleting a single external settlement from a paid invoice', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-05-05T12:00:00.000Z');

    const firstPurchase = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Base Exclusao Externa',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(firstPurchase.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    const mayInvoice = invoicesResponse.body.find((invoice: any) => invoice.referenceMonth === 5);
    expect(mayInvoice).toBeTruthy();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${mayInvoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: '2099-05-14T12:00:00.000Z'
      });

    expect(paymentResponse.status).toBe(200);

    const externalPurchase = await FinancialTransactionService.createTransaction({
      description: 'Compra Externa Para Excluir',
      amount: 40,
      date: new Date('2099-05-06T12:00:00.000Z'),
      type: TransactionType.EXPENSE,
      status: TransactionStatus.COMPLETED,
      fromAccountId: card.id,
      categoryId: expenseCategoryId,
      companyId,
      createdBy: userId,
      importSourceType: FinancialTransactionImportSourceType.NUBANK_CSV,
      importSourceDescription: 'Teste importado'
    });
    const externalPurchaseId = (externalPurchase as any).id;

    expect((externalPurchase as any).isExternalCreditCardSettlement).toBe(true);

    const deleteResponse = await request(app)
      .delete(`/api/financial/transactions/${externalPurchaseId}`)
      .query({ scope: 'single' })
      .set(authHeaders());

    expect(deleteResponse.status).toBe(204);

    const deletedTransaction = await prisma.financialTransaction.findUnique({
      where: { id: externalPurchaseId }
    });
    expect(deletedTransaction).toBeNull();

    const invoiceDetail = await request(app)
      .get(`/api/financial/credit-card-invoices/${mayInvoice.id}`)
      .set(authHeaders());

    expect(invoiceDetail.status).toBe(200);
    expect(invoiceDetail.body.status).toBe('PAID');
    expect(invoiceDetail.body.settlementType).toBe('TRANSFER');
    expect(invoiceDetail.body.totalAmount).toBe('100');
    expect(invoiceDetail.body.externalSettledAmount).toBe('0');
  });

  it('anchors imported installments to the invoice reference selected during reconciliation', async () => {
    const card = await createCreditCardAccount();
    const purchaseDate = new Date('2099-06-10T12:00:00.000Z');
    const anchoredInvoiceReference = resolveCreditCardInvoiceReference(
      new Date('2099-08-10T12:00:00.000Z'),
      10,
      15
    );

    const created = await FinancialTransactionService.createTransaction({
      description: 'Compra ancorada pela conciliacao',
      amount: 120,
      date: purchaseDate,
      type: TransactionType.EXPENSE,
      status: TransactionStatus.COMPLETED,
      fromAccountId: card.id,
      categoryId: expenseCategoryId,
      companyId,
      createdBy: userId,
      installmentCount: 3,
      creditCardInvoiceReference: {
        ...anchoredInvoiceReference,
        accountId: card.id
      },
      creditCardInvoiceAnchorInstallmentNumber: 2
    });

    expect(Array.isArray(created)).toBe(true);

    const persistedTransactions = await prisma.financialTransaction.findMany({
      where: {
        purchaseGroupId: (created as any[])[0].purchaseGroupId
      },
      include: {
        creditCardInvoice: true
      },
      orderBy: {
        installmentNumber: 'asc'
      }
    });

    expect(persistedTransactions).toHaveLength(3);
    expect(persistedTransactions.map((transaction) => transaction.installmentNumber)).toEqual([1, 2, 3]);
    expect(
      persistedTransactions.map((transaction) => [
        transaction.creditCardInvoice?.referenceYear,
        transaction.creditCardInvoice?.referenceMonth
      ])
    ).toEqual([
      [2099, 7],
      [2099, 8],
      [2099, 9]
    ]);
    expect(
      persistedTransactions.every(
        (transaction) => transaction.date.toISOString() === purchaseDate.toISOString()
      )
    ).toBe(true);
  });

  it('combines real invoice items with projected fixed card expenses in the current invoice detail', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const closingDay = Math.min(today.getDate() + 1, lastDayOfCurrentMonth);
    const dueDay = closingDay < lastDayOfCurrentMonth ? closingDay + 1 : 5;

    const card = await prisma.financialAccount.create({
      data: {
        name: `Cartao Hibrido ${Date.now()}`,
        type: 'CREDIT_CARD',
        balance: 0,
        allowNegativeBalance: true,
        creditLimit: 1000,
        statementClosingDay: closingDay,
        statementDueDay: dueDay,
        companyId
      }
    });

    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Streaming no cartao',
        amount: 75.5,
        type: 'EXPENSE',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    expect(fixedResponse.body.dayOfMonth).toBeNull();

    const purchaseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra atual no cartao',
        amount: 24.5,
        date: today.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(purchaseResponse.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(invoicesResponse.status).toBe(200);

    const currentInvoice = invoicesResponse.body.find(
      (invoice: any) =>
        invoice.referenceYear === today.getFullYear() &&
        invoice.referenceMonth === today.getMonth() + 1
    );

    expect(currentInvoice).toBeTruthy();
    expect(currentInvoice.isProjected).toBe(false);
    expect(currentInvoice.hasProjectedTransactions).toBe(true);
    expect(Number(currentInvoice.itemsSubtotal)).toBeCloseTo(24.5, 5);
    expect(Number(currentInvoice.fixedSubtotal)).toBeCloseTo(75.5, 5);
    expect(Number(currentInvoice.totalAmount)).toBeCloseTo(100, 5);
    expect(currentInvoice.itemCount).toBe(1);
    expect(currentInvoice.fixedItemCount).toBe(1);

    const cardsResponse = await request(app)
      .get('/api/financial/credit-cards')
      .set(authHeaders());

    expect(cardsResponse.status).toBe(200);
    expect(cardsResponse.body).toHaveLength(1);
    expect(Number(cardsResponse.body[0].nextInvoice.itemsSubtotal)).toBeCloseTo(24.5, 5);
    expect(Number(cardsResponse.body[0].nextInvoice.fixedSubtotal)).toBeCloseTo(75.5, 5);
    expect(Number(cardsResponse.body[0].nextInvoice.totalAmount)).toBeCloseTo(100, 5);
    expect(cardsResponse.body[0].nextInvoice.hasProjectedTransactions).toBe(true);

    const invoiceDetail = await request(app)
      .get(`/api/financial/credit-card-invoices/${currentInvoice.id}`)
      .set(authHeaders());

    expect(invoiceDetail.status).toBe(200);
    expect(invoiceDetail.body.isProjected).toBe(false);
    expect(invoiceDetail.body.hasProjectedTransactions).toBe(true);
    expect(Number(invoiceDetail.body.itemsSubtotal)).toBeCloseTo(24.5, 5);
    expect(Number(invoiceDetail.body.fixedSubtotal)).toBeCloseTo(75.5, 5);
    expect(Number(invoiceDetail.body.totalAmount)).toBeCloseTo(100, 5);
    expect(
      invoiceDetail.body.transactions.some((transaction: any) => transaction.id === purchaseResponse.body.id)
    ).toBe(true);
    expect(
      invoiceDetail.body.transactions.some(
        (transaction: any) =>
          transaction.isProjected &&
          transaction.isFixedProjection &&
          transaction.fixedTemplateId === fixedResponse.body.id
      )
    ).toBe(true);
  });

  it('lists credit card purchases grouped by purchase and supports multi-card filters', async () => {
    const { purchaseDate, closingDay, dueDay, currentInvoiceReference } =
      buildCurrentCardCycleConfig();
    const firstCard = await createCreditCardAccount({
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const secondCard = await createCreditCardAccount({
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const installmentPurchaseDate = buildDateAtHour(purchaseDate, 12);
    const singlePurchaseDate = buildDateAtHour(purchaseDate, 13);
    const legacyPurchaseDate = buildDateAtHour(purchaseDate, 14);

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Notebook Parcelado',
        amount: 100,
        date: installmentPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: firstCard.id,
        categoryId: expenseCategoryId,
        installmentCount: 3
      });

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Avista Cartao',
        amount: 50,
        date: singlePurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: secondCard.id,
        categoryId: expenseCategoryId
      });

    await createLegacyCreditCardPurchase(secondCard.id, {
      description: 'Compra Legada',
      amount: 75,
      purchaseDate: legacyPurchaseDate,
      dueDate: currentInvoiceReference.dueDate
    });

    const response = await request(app)
      .get('/api/financial/credit-card-purchases')
      .query({
        accountIds: [firstCard.id, secondCard.id],
        page: 1,
        pageSize: 20
      })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    expect(response.body.pages).toBe(1);

    const installmentPurchase = response.body.data.find(
      (item: any) => item.description === 'Notebook Parcelado'
    );
    expect(installmentPurchase).toBeTruthy();
    expect(installmentPurchase.purchaseGroupId).toBeTruthy();
    expect(Number(installmentPurchase.totalAmount)).toBe(300);
    expect(installmentPurchase.installmentCount).toBe(3);
    expect(installmentPurchase.installments).toHaveLength(3);
    expect(
      installmentPurchase.installments.map((installment: any) => installment.installmentNumber)
    ).toEqual([1, 2, 3]);

    const singlePurchase = response.body.data.find(
      (item: any) => item.description === 'Compra Avista Cartao'
    );
    expect(singlePurchase).toBeTruthy();
    expect(Number(singlePurchase.totalAmount)).toBe(50);
    expect(singlePurchase.installmentCount).toBe(1);
    expect(singlePurchase.purchaseGroupId).toBeTruthy();

    const legacyPurchase = response.body.data.find(
      (item: any) => item.description === 'Compra Legada'
    );
    expect(legacyPurchase).toBeTruthy();
    expect(legacyPurchase.purchaseGroupId).toBeNull();
    expect(legacyPurchase.groupKey).toBe(`single:${legacyPurchase.representativeTransactionId}`);
    expect(Number(legacyPurchase.totalAmount)).toBe(75);
    expect(legacyPurchase.installments).toHaveLength(1);
  });

  it('lists only purchases that are active in the current credit card invoice window', async () => {
    const { purchaseDate, closingDay, dueDay } = buildCurrentCardCycleConfig();
    const card = await createCreditCardAccount({
      creditLimit: 3000,
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const futureOnlyPurchaseDate = buildDateAtHour(purchaseDate, 13);

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Ainda Ativa',
        amount: 100,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 3
      });

    const farFutureInstallmentDate = addMonthsClamped(purchaseDate, 4);
    const farFutureInvoiceReference = resolveCreditCardInvoiceReference(
      farFutureInstallmentDate,
      closingDay,
      dueDay
    );
    const farFutureInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: farFutureInvoiceReference.referenceYear,
        referenceMonth: farFutureInvoiceReference.referenceMonth,
        closingDate: farFutureInvoiceReference.closingDate,
        dueDate: farFutureInvoiceReference.dueDate,
        status: 'OPEN',
        totalAmount: 60
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra Somente Futura',
        amount: 60,
        date: futureOnlyPurchaseDate,
        dueDate: farFutureInvoiceReference.dueDate,
        effectiveDate: futureOnlyPurchaseDate,
        scheduledDate: farFutureInstallmentDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        companyId,
        createdBy: userId,
        purchaseGroupId: `future-only-${Date.now()}`,
        installmentNumber: 3,
        totalInstallments: 3,
        creditCardInvoiceId: farFutureInvoice.id
      }
    });

    const response = await request(app)
      .get('/api/financial/credit-card-purchases')
      .query({
        accountIds: [card.id],
        page: 1,
        pageSize: 20
      })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].description).toBe('Compra Ainda Ativa');
    expect(response.body.data[0].installments).toHaveLength(3);
  });

  it('keeps only purchases with remaining unpaid installments when the current invoice is already paid', async () => {
    const { purchaseDate, closingDay, dueDay, currentInvoiceReference } =
      buildCurrentCardCycleConfig();
    const card = await createCreditCardAccount({
      creditLimit: 3000,
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const settledPurchaseDate = buildDateAtHour(purchaseDate, 13);

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Segue Ativa',
        amount: 140,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 2
      });

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Quitada No Ciclo',
        amount: 55,
        date: settledPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    const currentInvoice = await prisma.creditCardInvoice.findUnique({
      where: {
        unique_credit_card_invoice_reference: {
          accountId: card.id,
          referenceYear: currentInvoiceReference.referenceYear,
          referenceMonth: currentInvoiceReference.referenceMonth
        }
      }
    });

    expect(currentInvoice).toBeTruthy();

    await prisma.creditCardInvoice.update({
      where: {
        id: currentInvoice!.id
      },
      data: {
        status: 'PAID',
        settlementType: 'EXTERNAL',
        settledAt: currentInvoiceReference.dueDate
      }
    });

    const response = await request(app)
      .get('/api/financial/credit-card-purchases')
      .query({
        accountIds: [card.id],
        page: 1,
        pageSize: 20
      })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].description).toBe('Compra Segue Ativa');
    expect(response.body.data[0].installmentCount).toBe(2);
    expect(
      response.body.data.some((item: any) => item.description === 'Compra Quitada No Ciclo')
    ).toBe(false);
  });

  it('filters credit card purchases by category ids', async () => {
    const { purchaseDate, closingDay, dueDay, currentInvoiceReference } =
      buildCurrentCardCycleConfig();
    const card = await createCreditCardAccount({
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const travelCategory = await prisma.financialCategory.create({
      data: {
        name: `Categoria Viagem ${Date.now()}`,
        type: 'EXPENSE',
        color: '#3366ff',
        companyId
      }
    });
    const defaultCategoryPurchaseDate = buildDateAtHour(purchaseDate, 12);
    const travelCategoryPurchaseDate = buildDateAtHour(purchaseDate, 13);
    const legacyTravelPurchaseDate = buildDateAtHour(purchaseDate, 14);

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Categoria Padrao',
        amount: 120,
        date: defaultCategoryPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        installmentCount: 2
      });

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Categoria Viagem',
        amount: 80,
        date: travelCategoryPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: travelCategory.id
      });

    await createLegacyCreditCardPurchase(card.id, {
      description: 'Compra Legada Viagem',
      amount: 65,
      categoryId: travelCategory.id,
      purchaseDate: legacyTravelPurchaseDate,
      dueDate: currentInvoiceReference.dueDate
    });

    const response = await request(app)
      .get('/api/financial/credit-card-purchases')
      .query({
        accountIds: [card.id],
        categoryIds: [travelCategory.id],
        page: 1,
        pageSize: 20
      })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((item: any) => item.description)).toEqual([
      'Compra Legada Viagem',
      'Compra Categoria Viagem'
    ]);
    expect(
      response.body.data.every((item: any) => item.category?.id === travelCategory.id)
    ).toBe(true);
  });

  it('returns only purchases from accessible credit cards for regular users', async () => {
    const { purchaseDate, closingDay, dueDay } = buildCurrentCardCycleConfig();
    const allowedCard = await createCreditCardAccount({
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const restrictedCard = await createCreditCardAccount({
      statementClosingDay: closingDay,
      statementDueDay: dueDay
    });
    const allowedPurchaseDate = buildDateAtHour(purchaseDate, 12);
    const restrictedPurchaseDate = buildDateAtHour(purchaseDate, 13);

    await prisma.userFinancialAccountAccess.create({
      data: {
        userId: regularUserId,
        financialAccountId: allowedCard.id,
        companyId,
        grantedBy: userId
      }
    });

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Permitida',
        amount: 120,
        date: allowedPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: allowedCard.id,
        categoryId: expenseCategoryId
      });

    await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Compra Restrita',
        amount: 90,
        date: restrictedPurchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: restrictedCard.id,
        categoryId: expenseCategoryId
      });

    const response = await request(app)
      .get('/api/financial/credit-card-purchases')
      .set(regularUserAuthHeaders());

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].description).toBe('Compra Permitida');
    expect(response.body.data[0].card.id).toBe(allowedCard.id);
  });

  it('lists synthetic projected invoices for the next 10 competencies and returns projected detail', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const closingDay = Math.min(today.getDate() + 1, lastDayOfCurrentMonth);
    const dueDay = closingDay < lastDayOfCurrentMonth ? closingDay + 1 : 5;

    const card = await prisma.financialAccount.create({
      data: {
        name: `Cartao Projetado ${Date.now()}`,
        type: 'CREDIT_CARD',
        balance: 0,
        allowNegativeBalance: true,
        creditLimit: 2000,
        statementClosingDay: closingDay,
        statementDueDay: dueDay,
        companyId
      }
    });

    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Assinatura recorrente projetada',
        amount: 89.9,
        type: 'EXPENSE',
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());

    expect(invoicesResponse.status).toBe(200);
    expect(invoicesResponse.body.filter((invoice: any) => invoice.isProjected)).toHaveLength(10);

    const projectionKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const currentInvoice = invoicesResponse.body.find(
      (invoice: any) => invoice.projectionKey === projectionKey
    );

    expect(currentInvoice).toBeTruthy();
    expect(currentInvoice.id).toBeNull();
    expect(currentInvoice.isProjected).toBe(true);
    expect(Number(currentInvoice.itemsSubtotal)).toBe(0);
    expect(Number(currentInvoice.fixedSubtotal)).toBeCloseTo(89.9, 5);
    expect(Number(currentInvoice.totalAmount)).toBeCloseTo(89.9, 5);
    expect(currentInvoice.itemCount).toBe(0);
    expect(currentInvoice.fixedItemCount).toBe(1);

    const projectedDetail = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices/projected/${projectionKey}`)
      .set(authHeaders());

    expect(projectedDetail.status).toBe(200);
    expect(projectedDetail.body.isProjected).toBe(true);
    expect(projectedDetail.body.paymentTransaction).toBeNull();
    expect(Number(projectedDetail.body.itemsSubtotal)).toBe(0);
    expect(Number(projectedDetail.body.fixedSubtotal)).toBeCloseTo(89.9, 5);
    expect(projectedDetail.body.itemCount).toBe(0);
    expect(projectedDetail.body.fixedItemCount).toBe(1);
    expect(projectedDetail.body.transactions).toHaveLength(1);
    expect(projectedDetail.body.transactions[0].isProjected).toBe(true);
    expect(projectedDetail.body.transactions[0].isFixedProjection).toBe(true);
    expect(projectedDetail.body.transactions[0].fixedTemplateId).toBe(fixedResponse.body.id);
  });

  it('reports closed unpaid invoices blocked by non-materialized fixed card expenses', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const closingDay = Math.max(1, Math.min(today.getDate() - 1, lastDayOfCurrentMonth - 1));
    const dueDay = Math.min(lastDayOfCurrentMonth, Math.max(closingDay + 1, today.getDate() + 1));
    const closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay, 12, 0, 0, 0);
    const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay, 12, 0, 0, 0);

    const card = await prisma.financialAccount.create({
      data: {
        name: `Cartao Fechado Projetado ${Date.now()}`,
        type: 'CREDIT_CARD',
        balance: 0,
        allowNegativeBalance: true,
        creditLimit: 2000,
        statementClosingDay: closingDay,
        statementDueDay: dueDay,
        companyId
      }
    });

    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Assinatura pendente fechada',
        amount: 75.5,
        type: 'EXPENSE',
        startDate: new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0).toISOString(),
        fromAccountId: card.id,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);

    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: today.getFullYear(),
        referenceMonth: today.getMonth() + 1,
        closingDate,
        dueDate,
        status: 'CLOSED',
        totalAmount: 0
      }
    });

    const response = await request(app)
      .get('/api/admin/operations/overview')
      .set(authHeaders());

    expect(response.status).toBe(200);
    const blocks = response.body.issues.creditCardInvoiceProjectionBlocks;
    const block = blocks.find((item: any) => item.invoiceId === invoice.id);

    expect(block).toBeTruthy();
    expect(block.accountId).toBe(card.id);
    expect(block.pendingFixedCount).toBe(1);
    expect(Number(block.pendingFixedSubtotal)).toBeCloseTo(75.5, 5);
    expect(block.pendingOccurrences).toHaveLength(1);
    expect(block.pendingOccurrences[0].templateId).toBe(fixedResponse.body.id);
    expect(block.pendingOccurrences[0].description).toBe('Assinatura pendente fechada');
  });

  it('materializes a fixed card occurrence into a real closed invoice without a manual override', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const fixed = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa automatica em fatura fechada'
    });

    const result = await FixedTransactionService.materializeOccurrence({
      templateId: fixed.id,
      occurrenceDate,
      companyId,
      userId
    });

    expect(result.created).toBe(true);
    expect(result.transaction.occurrenceKey).toBe(
      buildOccurrenceKeyValue(fixed.id, occurrenceDate)
    );
    expect(result.transaction.creditCardInvoice?.status).toBe('CLOSED');
    expect(result.transaction.creditCardInvoice?.referenceYear).toBe(occurrenceDate.getFullYear());
    expect(result.transaction.creditCardInvoice?.referenceMonth).toBe(occurrenceDate.getMonth() + 1);
  });

  it('previews and idempotently repairs a closed competence without a persisted invoice', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const referenceYear = occurrenceDate.getFullYear();
    const referenceMonth = occurrenceDate.getMonth() + 1;
    const fixed = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa pendente para reparo',
      amount: 73.45
    });
    const endpoint = `/api/financial/credit-cards/${card.id}/invoices/${referenceYear}/${referenceMonth}/fixed-materialization`;

    const preview = await request(app)
      .get(endpoint)
      .set(authHeaders());

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      accountId: card.id,
      invoiceId: null,
      referenceYear,
      referenceMonth,
      status: 'CLOSED',
      canMaterialize: true,
      reason: 'READY',
      expectedCount: 1,
      materializedCount: 0,
      ignoredCount: 0,
      missingCount: 1
    });
    expect(preview.body.missingOccurrences[0].occurrenceKey).toBe(
      buildOccurrenceKeyValue(fixed.id, occurrenceDate)
    );

    const repaired = await request(app)
      .post(endpoint)
      .set(authHeaders());

    expect(repaired.status).toBe(200);
    expect(repaired.body).toMatchObject({
      status: 'CLOSED',
      canMaterialize: false,
      reason: 'NOTHING_TO_MATERIALIZE',
      expectedCount: 1,
      materializedCount: 1,
      missingCount: 0,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      errors: []
    });
    expect(repaired.body.invoiceId).toEqual(expect.any(Number));
    expect(repaired.body.materializedOccurrences[0]).toMatchObject({
      templateId: fixed.id,
      transactionStatus: 'COMPLETED',
      matchedBy: 'OCCURRENCE_KEY',
      isIgnored: false
    });

    const repeated = await request(app)
      .post(endpoint)
      .set(authHeaders());

    expect(repeated.status).toBe(200);
    expect(repeated.body).toMatchObject({
      missingCount: 0,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 0
    });

    const stored = await prisma.financialTransaction.findMany({
      where: {
        companyId,
        occurrenceKey: buildOccurrenceKeyValue(fixed.id, occurrenceDate)
      }
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].createdBy).toBe(userId);
  });

  it('counts ignored and unequivocal legacy occurrences as already materialized', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const referenceYear = occurrenceDate.getFullYear();
    const referenceMonth = occurrenceDate.getMonth() + 1;
    const reference = resolveCreditCardInvoiceReference(occurrenceDate, 10, 15);
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear,
        referenceMonth,
        closingDate: reference.closingDate,
        dueDate: reference.dueDate,
        status: 'CLOSED',
        totalAmount: 0
      }
    });
    const ignoredTemplate = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa ignorada historica',
      isActive: false,
      endDate: new Date(
        occurrenceDate.getFullYear(),
        occurrenceDate.getMonth(),
        occurrenceDate.getDate() + 1,
        23,
        59,
        59,
        999
      )
    });
    const legacyTemplate = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa legada sem chave'
    });

    await prisma.financialTransaction.create({
      data: {
        description: ignoredTemplate.description,
        amount: ignoredTemplate.amount,
        date: occurrenceDate,
        dueDate: reference.dueDate,
        effectiveDate: occurrenceDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId,
        recurringTransactionId: ignoredTemplate.id,
        occurrenceKey: buildOccurrenceKeyValue(ignoredTemplate.id, occurrenceDate),
        archivedAt: new Date(),
        archivedBy: userId
      }
    });
    await prisma.financialTransaction.create({
      data: {
        description: legacyTemplate.description,
        amount: legacyTemplate.amount,
        date: occurrenceDate,
        dueDate: reference.dueDate,
        effectiveDate: occurrenceDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId,
        recurringTransactionId: legacyTemplate.id,
        occurrenceKey: null
      }
    });

    const endpoint = `/api/financial/credit-cards/${card.id}/invoices/${referenceYear}/${referenceMonth}/fixed-materialization`;
    const preview = await request(app)
      .get(endpoint)
      .set(authHeaders());

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      status: 'CLOSED',
      canMaterialize: false,
      reason: 'NOTHING_TO_MATERIALIZE',
      expectedCount: 2,
      materializedCount: 2,
      ignoredCount: 1,
      missingCount: 0
    });
    expect(preview.body.materializedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: ignoredTemplate.id,
        isIgnored: true,
        matchedBy: 'OCCURRENCE_KEY'
      }),
      expect.objectContaining({
        templateId: legacyTemplate.id,
        isIgnored: false,
        matchedBy: 'LEGACY_RECURRING_COMPETENCE'
      })
    ]));

    const repeated = await request(app)
      .post(endpoint)
      .set(authHeaders());
    expect(repeated.status).toBe(200);
    expect(repeated.body).toMatchObject({
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 0,
      materializedCount: 2,
      missingCount: 0
    });
  });

  it('reports misplaced exact keys and ambiguous legacy rows without duplicating a mixed repair', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const reference = resolveCreditCardInvoiceReference(occurrenceDate, 10, 15);
    const wrongOccurrenceDate = buildMonthDate(-2, 10);
    const wrongReference = resolveCreditCardInvoiceReference(wrongOccurrenceDate, 10, 15);
    const targetInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: reference.referenceYear,
        referenceMonth: reference.referenceMonth,
        closingDate: reference.closingDate,
        dueDate: reference.dueDate,
        status: 'CLOSED',
        totalAmount: 0
      }
    });
    const wrongInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: wrongReference.referenceYear,
        referenceMonth: wrongReference.referenceMonth,
        closingDate: wrongReference.closingDate,
        dueDate: wrongReference.dueDate,
        status: 'CLOSED',
        totalAmount: 0
      }
    });
    const looseExact = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa com chave solta',
      amount: 10
    });
    const wrongExact = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa na competencia errada',
      amount: 20
    });
    const ambiguousLegacy = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa legada ambigua',
      amount: 30
    });
    const missing = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa realmente ausente',
      amount: 40
    });
    const createStoredOccurrence = (data: {
      templateId: number;
      description: string;
      amount: number;
      occurrenceKey: string | null;
      invoiceId?: number;
    }) => prisma.financialTransaction.create({
      data: {
        description: data.description,
        amount: data.amount,
        date: occurrenceDate,
        dueDate: reference.dueDate,
        effectiveDate: occurrenceDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: data.invoiceId,
        companyId,
        createdBy: userId,
        recurringTransactionId: data.templateId,
        occurrenceKey: data.occurrenceKey
      }
    });

    const looseTransaction = await createStoredOccurrence({
      templateId: looseExact.id,
      description: looseExact.description,
      amount: 10,
      occurrenceKey: buildOccurrenceKeyValue(looseExact.id, occurrenceDate)
    });
    const wrongTransaction = await createStoredOccurrence({
      templateId: wrongExact.id,
      description: wrongExact.description,
      amount: 20,
      occurrenceKey: buildOccurrenceKeyValue(wrongExact.id, occurrenceDate),
      invoiceId: wrongInvoice.id
    });
    const ambiguousTransactions = await Promise.all([
      createStoredOccurrence({
        templateId: ambiguousLegacy.id,
        description: `${ambiguousLegacy.description} 1`,
        amount: 30,
        occurrenceKey: null,
        invoiceId: targetInvoice.id
      }),
      createStoredOccurrence({
        templateId: ambiguousLegacy.id,
        description: `${ambiguousLegacy.description} 2`,
        amount: 30,
        occurrenceKey: null,
        invoiceId: targetInvoice.id
      })
    ]);
    const endpoint = `/api/financial/credit-cards/${card.id}/invoices/${reference.referenceYear}/${reference.referenceMonth}/fixed-materialization`;

    const preview = await request(app).get(endpoint).set(authHeaders());
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      expectedCount: 4,
      materializedCount: 3,
      missingCount: 1,
      inconsistencyCount: 3,
      canMaterialize: true
    });
    expect(preview.body.missingOccurrences[0].templateId).toBe(missing.id);
    expect(preview.body.inconsistentOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: looseExact.id,
        issue: 'OCCURRENCE_KEY_WITHOUT_INVOICE',
        transactionIds: [looseTransaction.id]
      }),
      expect.objectContaining({
        templateId: wrongExact.id,
        issue: 'OCCURRENCE_KEY_WRONG_INVOICE',
        transactionIds: [wrongTransaction.id]
      }),
      expect.objectContaining({
        templateId: ambiguousLegacy.id,
        issue: 'AMBIGUOUS_LEGACY_OCCURRENCES',
        transactionIds: ambiguousTransactions
          .map((transaction) => transaction.id)
          .sort((left, right) => left - right)
      })
    ]));

    const looseRetry = await FixedTransactionService.materializeOccurrence({
      templateId: looseExact.id,
      occurrenceDate,
      companyId,
      userId
    });
    const ambiguousRetry = await FixedTransactionService.materializeOccurrence({
      templateId: ambiguousLegacy.id,
      occurrenceDate,
      companyId,
      userId
    });
    expect(looseRetry.created).toBe(false);
    expect(ambiguousRetry.created).toBe(false);

    const repaired = await request(app).post(endpoint).set(authHeaders());
    expect(repaired.status).toBe(200);
    expect(repaired.body).toMatchObject({
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      expectedCount: 4,
      materializedCount: 4,
      missingCount: 0,
      inconsistencyCount: 3
    });
    expect(
      await prisma.financialTransaction.count({
        where: {
          companyId,
          recurringTransactionId: { in: [looseExact.id, wrongExact.id, ambiguousLegacy.id] }
        }
      })
    ).toBe(4);
    expect(
      await prisma.financialTransaction.count({
        where: {
          companyId,
          occurrenceKey: buildOccurrenceKeyValue(missing.id, occurrenceDate)
        }
      })
    ).toBe(1);

    const storedTargetInvoice = await prisma.creditCardInvoice.findUnique({
      where: { id: targetInvoice.id }
    });
    const storedCard = await prisma.financialAccount.findUnique({
      where: { id: card.id }
    });
    expect(Number(storedTargetInvoice?.totalAmount)).toBeCloseTo(100, 5);
    expect(Number(storedCard?.balance)).toBeCloseTo(-40, 5);
  });

  it('excludes an inactive template without an explicit end date from historical expectations', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa inativa sem historico delimitado',
      isActive: false,
      endDate: null
    });
    const endpoint = `/api/financial/credit-cards/${card.id}/invoices/${occurrenceDate.getFullYear()}/${occurrenceDate.getMonth() + 1}/fixed-materialization`;

    const preview = await request(app).get(endpoint).set(authHeaders());
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      expectedCount: 0,
      materializedCount: 0,
      missingCount: 0,
      excludedUnboundedInactiveTemplateCount: 1,
      canMaterialize: false,
      reason: 'NOTHING_TO_MATERIALIZE'
    });
    expect(preview.body.warnings).toHaveLength(1);
    expect(preview.body.warnings[0]).toMatch(/nao ha historico suficiente/i);
  });

  it('suppresses a legacy fixed occurrence from invoice projections and allows payment at the persisted total', async () => {
    const cycle = buildCurrentCardCycleConfig();
    const card = await createCreditCardAccount({
      statementClosingDay: cycle.closingDay,
      statementDueDay: cycle.dueDay
    });
    const occurrenceDate = cycle.currentInvoiceReference.closingDate;
    const fixed = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa legada ja lancada',
      amount: 42.75
    });
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: cycle.currentInvoiceReference.referenceYear,
        referenceMonth: cycle.currentInvoiceReference.referenceMonth,
        closingDate: cycle.currentInvoiceReference.closingDate,
        dueDate: cycle.currentInvoiceReference.dueDate,
        status: 'OPEN',
        totalAmount: 42.75
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: fixed.description,
        amount: fixed.amount,
        date: occurrenceDate,
        dueDate: cycle.currentInvoiceReference.dueDate,
        effectiveDate: occurrenceDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId,
        recurringTransactionId: fixed.id,
        occurrenceKey: null
      }
    });

    const invoicesResponse = await request(app)
      .get(`/api/financial/credit-cards/${card.id}/invoices`)
      .set(authHeaders());
    expect(invoicesResponse.status).toBe(200);
    const listedInvoice = invoicesResponse.body.find((item: any) => item.id === invoice.id);
    expect(listedInvoice).toMatchObject({
      id: invoice.id,
      itemCount: 1,
      fixedItemCount: 0,
      hasProjectedTransactions: false
    });
    expect(Number(listedInvoice.itemsSubtotal)).toBeCloseTo(42.75, 5);
    expect(Number(listedInvoice.fixedSubtotal)).toBe(0);
    expect(Number(listedInvoice.totalAmount)).toBeCloseTo(42.75, 5);

    const detailResponse = await request(app)
      .get(`/api/financial/credit-card-invoices/${invoice.id}`)
      .set(authHeaders());
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.transactions).toHaveLength(1);
    expect(detailResponse.body.fixedItemCount).toBe(0);
    expect(detailResponse.body.hasProjectedTransactions).toBe(false);
    expect(Number(detailResponse.body.totalAmount)).toBeCloseTo(42.75, 5);

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${invoice.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: payerAccountId,
        paymentDate: new Date().toISOString()
      });
    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.status).toBe('PAID');
    expect(Number(paymentResponse.body.paymentTransaction.amount)).toBeCloseTo(42.75, 5);
  });

  it('calculates and commits invoice payment only after concurrent card writes release the account lock', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const reference = resolveCreditCardInvoiceReference(occurrenceDate, 10, 15);
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: reference.referenceYear,
        referenceMonth: reference.referenceMonth,
        closingDate: reference.closingDate,
        dueDate: reference.dueDate,
        status: 'CLOSED',
        totalAmount: 100
      }
    });
    const fixed = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa concorrente ao pagamento',
      amount: 50
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra base antes do pagamento',
        amount: 100,
        date: occurrenceDate,
        dueDate: reference.dueDate,
        effectiveDate: occurrenceDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: card.id,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId
      }
    });

    let signalCardLocked!: () => void;
    let releaseCardLock!: () => void;
    const cardLocked = new Promise<void>((resolve) => {
      signalCardLocked = resolve;
    });
    const releaseLock = new Promise<void>((resolve) => {
      releaseCardLock = resolve;
    });
    const concurrentCardWrite = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "FinancialAccount"
        WHERE id = ${card.id}
        FOR UPDATE
      `;
      signalCardLocked();
      await releaseLock;
      await tx.financialTransaction.create({
        data: {
          description: fixed.description,
          amount: fixed.amount,
          date: occurrenceDate,
          dueDate: reference.dueDate,
          effectiveDate: occurrenceDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: card.id,
          categoryId: expenseCategoryId,
          creditCardInvoiceId: invoice.id,
          companyId,
          createdBy: userId,
          recurringTransactionId: fixed.id,
          occurrenceKey: buildOccurrenceKeyValue(fixed.id, occurrenceDate)
        }
      });
      await tx.creditCardInvoice.update({
        where: { id: invoice.id },
        data: { totalAmount: 150 }
      });
    }, {
      timeout: 10000
    });

    await cardLocked;
    let paymentSettled = false;
    const payment = CreditCardInvoiceService.payInvoice({
      invoiceId: invoice.id,
      fromAccountId: payerAccountId,
      paymentDate: new Date(),
      companyId,
      userId
    }).finally(() => {
      paymentSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(paymentSettled).toBe(false);
    releaseCardLock();
    await concurrentCardWrite;

    const paidInvoice = await payment;
    expect(paidInvoice?.status).toBe('PAID');
    expect(Number(paidInvoice?.totalAmount)).toBeCloseTo(150, 5);
    expect(Number(paidInvoice?.paymentTransaction?.amount)).toBeCloseTo(150, 5);
    expect(
      await prisma.financialTransaction.count({
        where: {
          companyId,
          creditCardInvoiceId: invoice.id,
          type: 'EXPENSE'
        }
      })
    ).toBe(2);
  });

  it('reports an inactive card as ineligible and refuses historical repair', async () => {
    const card = await createCreditCardAccount();
    const occurrenceDate = buildMonthDate(-1, 10);
    const fixed = await createFixedCardTemplate(card.id, occurrenceDate, {
      description: 'Fixa de cartao inativo'
    });
    await prisma.financialAccount.update({
      where: { id: card.id },
      data: { isActive: false }
    });
    const endpoint = `/api/financial/credit-cards/${card.id}/invoices/${occurrenceDate.getFullYear()}/${occurrenceDate.getMonth() + 1}/fixed-materialization`;

    const preview = await request(app)
      .get(endpoint)
      .set(authHeaders());
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      status: 'CLOSED',
      canMaterialize: false,
      reason: 'ACCOUNT_INACTIVE',
      expectedCount: 1,
      missingCount: 1
    });

    const repair = await request(app)
      .post(endpoint)
      .set(authHeaders());
    expect(repair.status).toBe(400);
    expect(repair.body.error).toMatch(/cartao de credito esta inativo/i);
    expect(
      await prisma.financialTransaction.count({
        where: {
          companyId,
          occurrenceKey: buildOccurrenceKeyValue(fixed.id, occurrenceDate)
        }
      })
    ).toBe(0);
  });

  it('refuses repair when the exact competence is open or paid', async () => {
    const card = await createCreditCardAccount();
    const historicalDate = buildMonthDate(-2, 10);
    await createFixedCardTemplate(card.id, historicalDate, {
      description: 'Fixa protegida por status'
    });

    const openDate = buildMonthDate(1, 10);
    const openYear = openDate.getFullYear();
    const openMonth = openDate.getMonth() + 1;
    const openEndpoint = `/api/financial/credit-cards/${card.id}/invoices/${openYear}/${openMonth}/fixed-materialization`;
    const openPreview = await request(app)
      .get(openEndpoint)
      .set(authHeaders());
    expect(openPreview.status).toBe(200);
    expect(openPreview.body).toMatchObject({
      status: 'OPEN',
      canMaterialize: false,
      reason: 'INVOICE_OPEN',
      missingCount: 1
    });

    const openRepair = await request(app)
      .post(openEndpoint)
      .set(authHeaders());
    expect(openRepair.status).toBe(400);
    expect(openRepair.body.error).toMatch(/fatura ainda esta aberta/i);

    const paidDate = buildMonthDate(-1, 10);
    const paidReference = resolveCreditCardInvoiceReference(paidDate, 10, 15);
    await prisma.creditCardInvoice.create({
      data: {
        accountId: card.id,
        referenceYear: paidDate.getFullYear(),
        referenceMonth: paidDate.getMonth() + 1,
        closingDate: paidReference.closingDate,
        dueDate: paidReference.dueDate,
        status: 'PAID',
        settlementType: 'EXTERNAL',
        settledAt: paidReference.dueDate,
        totalAmount: 0
      }
    });
    const paidEndpoint = `/api/financial/credit-cards/${card.id}/invoices/${paidDate.getFullYear()}/${paidDate.getMonth() + 1}/fixed-materialization`;
    const paidPreview = await request(app)
      .get(paidEndpoint)
      .set(authHeaders());
    expect(paidPreview.status).toBe(200);
    expect(paidPreview.body).toMatchObject({
      status: 'PAID',
      canMaterialize: false,
      reason: 'INVOICE_PAID',
      missingCount: 1
    });

    const paidRepair = await request(app)
      .post(paidEndpoint)
      .set(authHeaders());
    expect(paidRepair.status).toBe(400);
    expect(paidRepair.body.error).toMatch(/fatura ja esta paga/i);

    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
  });
});
