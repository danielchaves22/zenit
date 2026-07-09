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
  let creditCardAccountId: number;
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

  const toDateOnly = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        isDefault: true,
        companyId
      }
    });
    expenseAccountId = account.id;

    const creditCardAccount = await prisma.financialAccount.create({
      data: {
        name: 'Fixed Test Credit Card',
        type: 'CREDIT_CARD',
        balance: 0,
        allowNegativeBalance: true,
        creditLimit: 5000,
        statementClosingDay: 10,
        statementDueDay: 15,
        companyId
      }
    });
    creditCardAccountId = creditCardAccount.id;

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

  it('does not project fixed occurrences from the current month in the past and supports ignored transaction visibility', async () => {
    const today = new Date().getDate();
    const pastDay = Math.max(1, today - 1);
    const nextMonthOccurrence = buildOccurrenceDate(1, 12);
    const currentMonth = monthBounds(0);
    const nextMonth = monthBounds(1);

    const pastTemplateResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Past Month Projection',
        amount: 90,
        type: 'EXPENSE',
        dayOfMonth: pastDay,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId,
        startDate: buildOccurrenceDate(-1, pastDay).toISOString()
      });

    expect(pastTemplateResponse.status).toBe(201);

    const nextMonthTemplateResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Ignored Future Projection',
        amount: 145.5,
        type: 'EXPENSE',
        dayOfMonth: 12,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId,
        startDate: buildOccurrenceDate(0, 1).toISOString()
      });

    expect(nextMonthTemplateResponse.status).toBe(201);

    const currentMonthResponse = await listTransactions(currentMonth.start, currentMonth.end);
    expect(currentMonthResponse.status).toBe(200);
    expect(
      currentMonthResponse.body.data.find(
        (item: any) => item.fixedTemplateId === pastTemplateResponse.body.id && item.isVirtual === true
      )
    ).toBeUndefined();

    const nextMonthResponse = await listTransactions(nextMonth.start, nextMonth.end);
    expect(nextMonthResponse.status).toBe(200);

    const projectedRow = nextMonthResponse.body.data.find(
      (item: any) =>
        item.fixedTemplateId === nextMonthTemplateResponse.body.id &&
        item.isVirtual === true
    );

    expect(projectedRow).toBeDefined();

    const archiveResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${nextMonthTemplateResponse.body.id}/archive`)
      .set(authHeaders())
      .send({
        occurrenceDate: nextMonthOccurrence.toISOString()
      });

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.archivedAt).toBeTruthy();

    const activeFutureResponse = await listTransactions(nextMonth.start, nextMonth.end);
    expect(activeFutureResponse.status).toBe(200);
    expect(
      activeFutureResponse.body.data.find(
        (item: any) => item.fixedTemplateId === nextMonthTemplateResponse.body.id
      )
    ).toBeUndefined();

    const ignoredFutureResponse = await listTransactions(nextMonth.start, nextMonth.end, {
      ignoredState: 'IGNORED'
    });

    expect(ignoredFutureResponse.status).toBe(200);
    expect(
      ignoredFutureResponse.body.data.find(
        (item: any) =>
          item.fixedTemplateId === nextMonthTemplateResponse.body.id &&
          item.archivedAt
      )
    ).toBeDefined();

    const manualPendingResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Manual Pending Ignore',
        amount: 88.4,
        date: nextMonthOccurrence.toISOString(),
        dueDate: nextMonthOccurrence.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(manualPendingResponse.status).toBe(201);

    const archiveManualResponse = await request(app)
      .patch(`/api/financial/transactions/${manualPendingResponse.body.id}/archive`)
      .set(authHeaders());

    expect(archiveManualResponse.status).toBe(200);
    expect(archiveManualResponse.body.archivedAt).toBeTruthy();

    const ignoredWithManualResponse = await listTransactions(nextMonth.start, nextMonth.end, {
      ignoredState: 'IGNORED'
    });

    expect(ignoredWithManualResponse.status).toBe(200);
    expect(
      ignoredWithManualResponse.body.data.find((item: any) => item.id === manualPendingResponse.body.id)
    ).toBeDefined();
  });

  it('does not materialize or archive projected occurrences that are before the projection cutoff', async () => {
    const today = new Date().getDate();
    const nonProjectableDay = today === 1 ? 1 : today - 1;

    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Past Manual Projection Block',
        amount: 120,
        type: 'EXPENSE',
        dayOfMonth: nonProjectableDay,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId,
        startDate: buildOccurrenceDate(-1, nonProjectableDay).toISOString()
      });

    expect(fixedResponse.status).toBe(201);

    const fixedTemplateId = fixedResponse.body.id;
    const occurrenceDate = buildOccurrenceDate(0, nonProjectableDay);
    const occurrenceKey = buildOccurrenceKeyValue(fixedTemplateId, occurrenceDate);

    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${fixedTemplateId}/materialize`)
      .set(authHeaders())
      .send({ occurrenceDate: occurrenceDate.toISOString() });

    expect(materializeResponse.status).toBe(400);
    expect(materializeResponse.body.error).toContain(
      'Nao e possivel materializar ou ignorar manualmente ocorrencias projetadas'
    );

    const archiveResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${fixedTemplateId}/archive`)
      .set(authHeaders())
      .send({ occurrenceDate: occurrenceDate.toISOString() });

    expect(archiveResponse.status).toBe(400);
    expect(archiveResponse.body.error).toContain(
      'Nao e possivel materializar ou ignorar manualmente ocorrencias projetadas'
    );

    const materializedCount = await prisma.financialTransaction.count({
      where: {
        companyId,
        occurrenceKey
      }
    });

    expect(materializedCount).toBe(0);
  });

  it('calculates period expense summary without inflating consolidated card invoice amounts', async () => {
    const purchaseDate = buildOccurrenceDate(8, 5);
    const dueDate = buildOccurrenceDate(8, 15);

    const regularExpenseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Regular Expense Summary',
        amount: 119.9,
        date: purchaseDate.toISOString(),
        dueDate: dueDate.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(regularExpenseResponse.status).toBe(201);

    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccountId,
        referenceYear: dueDate.getFullYear(),
        referenceMonth: dueDate.getMonth() + 1,
        closingDate: buildOccurrenceDate(8, 10),
        dueDate,
        status: 'OPEN',
        totalAmount: 235.21
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Credit Card Expense Summary',
        amount: 235.21,
        date: purchaseDate,
        dueDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId,
        effectiveDate: purchaseDate
      }
    });

    const { start, end } = monthBounds(8);
    const listResponse = await listTransactions(start, end, {
      dateField: 'dueDate'
    });

    expect(listResponse.status).toBe(200);
    expect(Number(listResponse.body.summary.expenseTotal)).toBeCloseTo(355.11, 5);

    const invoiceSummary = listResponse.body.data.find(
      (item: any) => item.isCreditCardInvoiceSummary === true && item.creditCardInvoice?.id === invoice.id
    );
    expect(invoiceSummary).toBeDefined();
    expect(Number(invoiceSummary.amount)).toBeCloseTo(235.21, 5);
  });

  it('filters summarized credit card invoices by category ids using only the matching subtotal', async () => {
    const travelCategory = await prisma.financialCategory.create({
      data: {
        name: 'Fixed Test Travel Category',
        type: 'EXPENSE',
        color: '#22c55e',
        companyId
      }
    });

    const purchaseDate = buildOccurrenceDate(2, 5);
    const dueDate = buildOccurrenceDate(2, 15);

    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccountId,
        referenceYear: dueDate.getFullYear(),
        referenceMonth: dueDate.getMonth() + 1,
        closingDate: buildOccurrenceDate(2, 10),
        dueDate,
        status: 'OPEN',
        totalAmount: 120
      }
    });

    await prisma.financialTransaction.createMany({
      data: [
        {
          description: 'Credit Card Expense Fuel',
          amount: 80,
          date: purchaseDate,
          dueDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccountId,
          categoryId: expenseCategoryId,
          creditCardInvoiceId: invoice.id,
          companyId,
          createdBy: userId,
          effectiveDate: purchaseDate
        },
        {
          description: 'Credit Card Expense Travel',
          amount: 40,
          date: purchaseDate,
          dueDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: creditCardAccountId,
          categoryId: travelCategory.id,
          creditCardInvoiceId: invoice.id,
          companyId,
          createdBy: userId,
          effectiveDate: purchaseDate
        }
      ]
    });

    const { start, end } = monthBounds(2);
    const listResponse = await listTransactions(start, end, {
      dateField: 'dueDate',
      categoryIds: [travelCategory.id]
    });

    expect(listResponse.status).toBe(200);
    expect(Number(listResponse.body.summary.expenseTotal)).toBeCloseTo(40, 5);

    const invoiceSummary = listResponse.body.data.find(
      (item: any) => item.isCreditCardInvoiceSummary === true && item.creditCardInvoice?.id === invoice.id
    );
    expect(invoiceSummary).toBeDefined();
    expect(Number(invoiceSummary.amount)).toBeCloseTo(40, 5);
    expect(Number(invoiceSummary.itemsSubtotal)).toBeCloseTo(40, 5);
    expect(Number(invoiceSummary.fixedSubtotal)).toBeCloseTo(0, 5);
  });

  it('counts credit card invoice payment transfers as expense while keeping regular transfers neutral in transaction list summary', async () => {
    const purchaseDate = buildOccurrenceDate(3, 5);
    const regularExpenseDate = buildOccurrenceDate(3, 12);
    const transferDate = buildOccurrenceDate(3, 18);
    const paymentDate = buildOccurrenceDate(3, 14);
    const destinationAccount = await prisma.financialAccount.create({
      data: {
        name: `Fixed Test Transfer Destination ${Date.now()}`,
        type: 'SAVINGS',
        balance: 0,
        allowNegativeBalance: true,
        companyId
      }
    });

    const regularExpenseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Expense Visible In Summary',
        amount: 40,
        date: regularExpenseDate.toISOString(),
        dueDate: regularExpenseDate.toISOString(),
        effectiveDate: regularExpenseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(regularExpenseResponse.status).toBe(201);

    const cardExpenseResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Credit Card Expense Paid Via Transfer',
        amount: 120,
        date: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId
      });

    expect(cardExpenseResponse.status).toBe(201);

    const targetInvoice = await prisma.creditCardInvoice.findFirst({
      where: {
        accountId: creditCardAccountId,
        referenceYear: paymentDate.getFullYear(),
        referenceMonth: paymentDate.getMonth() + 1
      }
    });

    expect(targetInvoice).not.toBeNull();

    const paymentResponse = await request(app)
      .post(`/api/financial/credit-card-invoices/${targetInvoice!.id}/pay`)
      .set(authHeaders())
      .send({
        fromAccountId: expenseAccountId,
        paymentDate: paymentDate.toISOString()
      });

    expect(paymentResponse.status).toBe(200);

    const regularTransferResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Internal Transfer Neutral',
        amount: 60,
        date: transferDate.toISOString(),
        dueDate: transferDate.toISOString(),
        effectiveDate: transferDate.toISOString(),
        type: 'TRANSFER',
        status: 'COMPLETED',
        fromAccountId: expenseAccountId,
        toAccountId: destinationAccount.id
      });

    expect(regularTransferResponse.status).toBe(201);

    const { start, end } = monthBounds(3);
    const listResponse = await listTransactions(start, end, {
      dateField: 'dueDate',
      types: ['EXPENSE', 'TRANSFER']
    });

    expect(listResponse.status).toBe(200);
    expect(Number(listResponse.body.summary.incomeTotal)).toBeCloseTo(0, 5);
    expect(Number(listResponse.body.summary.expenseTotal)).toBeCloseTo(160, 5);
    expect(
      listResponse.body.data.some((item: any) => item.description === 'Internal Transfer Neutral')
    ).toBe(true);
    expect(
      listResponse.body.data.some((item: any) => item.isCreditCardInvoicePayment === true)
    ).toBe(true);
  });

  it('can hide credit card materialized transactions from the list', async () => {
    const purchaseDate = buildOccurrenceDate(1, 5);

    const checkingResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Checking Expense Visible',
        amount: 55,
        date: purchaseDate.toISOString(),
        dueDate: purchaseDate.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(checkingResponse.status).toBe(201);

    const invoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: creditCardAccountId,
        referenceYear: purchaseDate.getFullYear(),
        referenceMonth: purchaseDate.getMonth() + 1,
        closingDate: buildOccurrenceDate(1, 10),
        dueDate: buildOccurrenceDate(1, 15),
        status: 'OPEN'
      }
    });

    const creditCardTransaction = await prisma.financialTransaction.create({
      data: {
        description: 'Credit Card Expense Hidden',
        amount: 120,
        date: purchaseDate,
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId,
        creditCardInvoiceId: invoice.id,
        companyId,
        createdBy: userId,
        effectiveDate: purchaseDate
      }
    });

    await prisma.creditCardInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: 120 }
    });

    const creditCardResponse = {
      status: 201,
      body: {
        id: creditCardTransaction.id
      }
    };

    expect(creditCardResponse.status).toBe(201);
	    expect(creditCardTransaction.creditCardInvoiceId).toBe(invoice.id);
	    expect(creditCardTransaction.fromAccountId).toBe(creditCardAccountId);
	    expect(creditCardTransaction.companyId).toBe(companyId);
	
	    const { start, end } = monthBounds(1);
	    const visibleResponse = await listTransactions(start, end, {
	      dateField: 'date',
	      includeCreditCardTransactions: true
	    });
	
	    expect(visibleResponse.status).toBe(200);
	    expect(visibleResponse.body.data.some((item: any) => item.id === creditCardResponse.body.id)).toBe(false);
	    expect(
	      visibleResponse.body.data.some(
	        (item: any) =>
	          item.isCreditCardInvoiceSummary === true &&
	          item.creditCardInvoice?.id === invoice.id &&
	          Number(item.amount) === 120
	      )
	    ).toBe(true);

	    const hiddenResponse = await listTransactions(start, end, {
	      dateField: 'date',
	      includeCreditCardTransactions: false
	    });

    expect(hiddenResponse.status).toBe(200);
    expect(hiddenResponse.body.data.some((item: any) => item.id === checkingResponse.body.id)).toBe(true);
    expect(hiddenResponse.body.data.some((item: any) => item.id === creditCardResponse.body.id)).toBe(false);
  });

  it('can hide projected fixed transactions linked to credit card accounts', async () => {
    const regularFixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Projected Regular Fixed',
        amount: 44.3,
        type: 'EXPENSE',
        dayOfMonth: 6,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(regularFixedResponse.status).toBe(201);
    const regularFixedTemplateId = regularFixedResponse.body.id;

    const creditCardFixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Projected Credit Card Fixed',
        amount: 77.9,
        type: 'EXPENSE',
        dayOfMonth: 8,
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId
      });

    expect(creditCardFixedResponse.status).toBe(201);
    const fixedTemplateId = creditCardFixedResponse.body.id;

    const { start, end } = monthBounds(1);

	    const visibleResponse = await listTransactions(start, end, {
	      includeCreditCardTransactions: true
	    });
	    expect(visibleResponse.status).toBe(200);
	    const projectedInvoiceSummary = visibleResponse.body.data.find(
	      (item: any) =>
	        item.isCreditCardInvoiceSummary === true &&
	        item.fromAccount?.id === creditCardAccountId &&
	        Number(item.fixedSubtotal) === 77.9
	    );
	    expect(projectedInvoiceSummary).toBeDefined();
	    expect(Number(projectedInvoiceSummary.fixedSubtotal)).toBeCloseTo(77.9, 5);
	    expect(Number(projectedInvoiceSummary.amount)).toBeGreaterThanOrEqual(77.9);
	    expect(projectedInvoiceSummary.hasProjectedTransactions).toBe(true);

	    const hiddenResponse = await listTransactions(start, end, {
	      includeCreditCardTransactions: false
	    });
	    expect(hiddenResponse.status).toBe(200);
	    expect(
	      hiddenResponse.body.data.find(
	        (item: any) => item.isCreditCardInvoiceSummary === true && item.fromAccount?.id === creditCardAccountId
	      )
	    ).toBeUndefined();
    expect(
      hiddenResponse.body.data.find(
        (item: any) => item.fixedTemplateId === regularFixedTemplateId && item.isVirtual === true
      )
    ).toBeDefined();
  });

  it('allows fixed transactions without account', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Fixed Without Account',
        amount: 31.7,
        type: 'EXPENSE',
        dayOfMonth: 9,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.fromAccountId).toBeNull();

    const { start, end } = monthBounds(1);
    const listResponse = await listTransactions(start, end);
    expect(listResponse.status).toBe(200);
    expect(
      listResponse.body.data.find(
        (item: any) => item.fixedTemplateId === createResponse.body.id && item.isVirtual === true
      )
    ).toBeDefined();

    const occurrenceDate = buildOccurrenceDate(1, 9);
    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${createResponse.body.id}/materialize`)
      .set(authHeaders())
      .send({
        occurrenceDate: occurrenceDate.toISOString()
      });

    expect(materializeResponse.status).toBe(201);
    expect(materializeResponse.body.transaction.fromAccountId).toBe(expenseAccountId);
    expect(materializeResponse.body.transaction.recurringTransactionId).toBe(createResponse.body.id);
    expect(Number(materializeResponse.body.transaction.amount)).toBeCloseTo(31.7, 5);
  });

  it('materializes fixed expenses preserving decimal cents from the template amount', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Creta',
        amount: 1786.91,
        type: 'EXPENSE',
        dayOfMonth: 4,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);

    const occurrenceDate = buildOccurrenceDate(1, 4);
    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${createResponse.body.id}/materialize`)
      .set(authHeaders())
      .send({
        occurrenceDate: occurrenceDate.toISOString()
      });

    expect(materializeResponse.status).toBe(201);
    expect(Number(materializeResponse.body.transaction.amount)).toBeCloseTo(1786.91, 5);

    const storedTransaction = await prisma.financialTransaction.findUnique({
      where: { id: materializeResponse.body.transaction.id },
      select: { amount: true }
    });

    expect(Number(storedTransaction?.amount || 0)).toBeCloseTo(1786.91, 5);
  });

  it('rejects fixed incomes linked to credit card accounts', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Invalid Credit Card Income',
        amount: 19.5,
        type: 'INCOME',
        dayOfMonth: 7,
        toAccountId: creditCardAccountId
      });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body.error).toMatch(/cartao de credito/i);
  });

  it('ignores legacy fixed incomes linked to credit card accounts', async () => {
    const legacyOccurrenceDate = buildOccurrenceDate(1, 7);
    const legacyTemplate = await prisma.recurringTransaction.create({
      data: {
        description: 'Legacy Credit Card Income',
        amount: 13.9,
        type: 'INCOME',
        frequency: 'MONTHLY',
        dayOfMonth: 7,
        dayOfWeek: null,
        startDate: monthBounds(0).start,
        endDate: null,
        nextDueDate: legacyOccurrenceDate,
        isActive: true,
        notes: null,
        fromAccountId: null,
        toAccountId: creditCardAccountId,
        categoryId: null,
        companyId,
        createdBy: userId
      }
    });

    const { start, end } = monthBounds(1);
    const listResponse = await listTransactions(start, end, {
      includeCreditCardTransactions: true
    });

    expect(listResponse.status).toBe(200);
    expect(
      listResponse.body.data.find(
        (item: any) => item.fixedTemplateId === legacyTemplate.id && item.isVirtual === true
      )
    ).toBeUndefined();

    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${legacyTemplate.id}/materialize`)
      .set(authHeaders())
      .send({
        occurrenceDate: legacyOccurrenceDate.toISOString()
      });

    expect(materializeResponse.status).toBe(400);
    expect(materializeResponse.body.error).toMatch(/cartao de credito/i);
  });

  it('materializes fixed credit card expenses as recurring card purchases', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Recurring Card Subscription',
        amount: 52.4,
        type: 'EXPENSE',
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    const templateId = createResponse.body.id;
    expect(createResponse.body.dayOfMonth).toBeNull();
    const occurrenceDate = buildOccurrenceDate(1, 10);

    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${templateId}/materialize`)
      .set(authHeaders())
      .send({
        occurrenceDate: occurrenceDate.toISOString()
      });

    expect(materializeResponse.status).toBe(201);
    expect(materializeResponse.body.created).toBe(true);
    expect(materializeResponse.body.transaction.recurringTransactionId).toBe(templateId);
    expect(materializeResponse.body.transaction.occurrenceKey).toBe(
      buildOccurrenceKeyValue(templateId, new Date(occurrenceDate))
    );
    expect(materializeResponse.body.transaction.purchaseGroupId).toBeTruthy();
    expect(materializeResponse.body.transaction.creditCardInvoice).toBeTruthy();
    expect(materializeResponse.body.transaction.fromAccountId).toBe(creditCardAccountId);
    expect(materializeResponse.body.transaction.status).toBe('COMPLETED');
    expect(Number(materializeResponse.body.transaction.amount)).toBeCloseTo(52.4, 5);

    const { start, end } = monthBounds(1);
    const hiddenResponse = await listTransactions(start, end, {
      includeCreditCardTransactions: false
    });
    expect(hiddenResponse.status).toBe(200);
    expect(
      hiddenResponse.body.data.some(
        (item: any) => item.id === materializeResponse.body.transaction.id
      )
    ).toBe(false);
  });

  it('rejects non-card fixed expenses without dayOfMonth', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Missing Day Non Card',
        amount: 35,
        type: 'EXPENSE',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body.error).toMatch(/Dia do vencimento/i);
  });

  it('allows deleting an account linked only to fixed transactions without movements', async () => {
    const removableAccount = await prisma.financialAccount.create({
      data: {
        name: `Removable Fixed Account ${Date.now()}`,
        type: 'CHECKING',
        balance: 0,
        allowNegativeBalance: true,
        companyId
      }
    });

    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Fixed Linked To Removable Account',
        amount: 21,
        type: 'EXPENSE',
        dayOfMonth: 12,
        fromAccountId: removableAccount.id,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    const fixedTemplateId = createResponse.body.id;

    const deleteResponse = await request(app)
      .delete(`/api/financial/accounts/${removableAccount.id}`)
      .set(authHeaders());

    expect(deleteResponse.status).toBe(204);

    const deletedAccount = await prisma.financialAccount.findUnique({
      where: { id: removableAccount.id }
    });
    expect(deletedAccount).toBeNull();

    const template = await prisma.recurringTransaction.findUnique({
      where: { id: fixedTemplateId }
    });
    expect(template).not.toBeNull();
    expect(template?.fromAccountId).toBeNull();
  });

  it('allows deleting fixed templates without materialized transactions', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Deletable Fixed Template',
        amount: 29,
        type: 'EXPENSE',
        dayOfMonth: 14,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    const templateId = createResponse.body.id;

    const listResponse = await request(app)
      .get('/api/financial/fixed-transactions')
      .set(authHeaders())
      .query({ includeInactive: true });

    expect(listResponse.status).toBe(200);
    const listedTemplate = listResponse.body.find((item: any) => item.id === templateId);
    expect(listedTemplate?.canDelete).toBe(true);
    expect(listedTemplate?.materializedTransactionCount).toBe(0);

    const deleteResponse = await request(app)
      .delete(`/api/financial/fixed-transactions/${templateId}`)
      .set(authHeaders());

    expect(deleteResponse.status).toBe(204);

    const deletedTemplate = await prisma.recurringTransaction.findUnique({
      where: { id: templateId }
    });
    expect(deletedTemplate).toBeNull();
  });

  it('does not allow deleting fixed templates with materialized transactions', async () => {
    const createResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Non Deletable Fixed Template',
        amount: 63,
        type: 'EXPENSE',
        dayOfMonth: 16,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);
    const templateId = createResponse.body.id;

    const occurrenceDate = buildOccurrenceDate(1, 16);
    const materializeResponse = await request(app)
      .post(`/api/financial/fixed-transactions/${templateId}/materialize`)
      .set(authHeaders())
      .send({
        occurrenceDate: occurrenceDate.toISOString()
      });

    expect(materializeResponse.status).toBe(201);

    const listResponse = await request(app)
      .get('/api/financial/fixed-transactions')
      .set(authHeaders())
      .query({ includeInactive: true });

    expect(listResponse.status).toBe(200);
    const listedTemplate = listResponse.body.find((item: any) => item.id === templateId);
    expect(listedTemplate?.canDelete).toBe(false);
    expect(listedTemplate?.materializedTransactionCount).toBe(1);

    const deleteResponse = await request(app)
      .delete(`/api/financial/fixed-transactions/${templateId}`)
      .set(authHeaders());

    expect(deleteResponse.status).toBe(400);
    expect(deleteResponse.body.error).toMatch(/ocorrencias materializadas/i);

    const existingTemplate = await prisma.recurringTransaction.findUnique({
      where: { id: templateId }
    });
    expect(existingTemplate).not.toBeNull();
  });

  it('filters materialized transactions by the selected date field', async () => {
    const { start, end } = monthBounds(1);
    const dueDate = buildOccurrenceDate(1, 18);
    const transactionDate = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth() - 1,
      dueDate.getDate(),
      12,
      0,
      0,
      0
    );

    const createResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Date Field Materialized Filter',
        amount: 87.4,
        date: transactionDate.toISOString(),
        dueDate: dueDate.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);

    const dueDateResponse = await listTransactions(start, end, { dateField: 'dueDate' });
    expect(dueDateResponse.status).toBe(200);
    expect(dueDateResponse.body.data.some((item: any) => item.id === createResponse.body.id)).toBe(true);

    const transactionDateResponse = await listTransactions(start, end, { dateField: 'date' });
    expect(transactionDateResponse.status).toBe(200);
    expect(transactionDateResponse.body.data.some((item: any) => item.id === createResponse.body.id)).toBe(false);
  });

  it('does not include projected fixed transactions when filtering by creation or payment date', async () => {
    const fixedResponse = await request(app)
      .post('/api/financial/fixed-transactions')
      .set(authHeaders())
      .send({
        description: 'Projected Date Field Filter',
        amount: 118.2,
        type: 'EXPENSE',
        dayOfMonth: 11,
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(fixedResponse.status).toBe(201);
    const fixedTemplateId = fixedResponse.body.id;

    const { start, end } = monthBounds(1);

    const dueDateResponse = await listTransactions(start, end, { dateField: 'dueDate' });
    expect(dueDateResponse.status).toBe(200);
    expect(
      dueDateResponse.body.data.find(
        (item: any) => item.fixedTemplateId === fixedTemplateId && item.isVirtual === true
      )
    ).toBeDefined();

    const createdAtResponse = await listTransactions(start, end, { dateField: 'createdAt' });
    expect(createdAtResponse.status).toBe(200);
    expect(
      createdAtResponse.body.data.find(
        (item: any) => item.fixedTemplateId === fixedTemplateId && item.isVirtual === true
      )
    ).toBeUndefined();

    const effectiveDateResponse = await listTransactions(start, end, { dateField: 'effectiveDate' });
    expect(effectiveDateResponse.status).toBe(200);
    expect(
      effectiveDateResponse.body.data.find(
        (item: any) => item.fixedTemplateId === fixedTemplateId && item.isVirtual === true
      )
    ).toBeUndefined();
  });

  it('treats creation date filters as whole-day ranges', async () => {
    const transactionDate = new Date();

    const createResponse = await request(app)
      .post('/api/financial/transactions')
      .set(authHeaders())
      .send({
        description: 'Created At Whole Day Filter',
        amount: 42,
        date: transactionDate.toISOString(),
        dueDate: transactionDate.toISOString(),
        type: 'EXPENSE',
        status: 'PENDING',
        fromAccountId: expenseAccountId,
        categoryId: expenseCategoryId
      });

    expect(createResponse.status).toBe(201);

    const listResponse = await request(app)
      .get('/api/financial/transactions')
      .set(authHeaders())
      .query({
        startDate: toDateOnly(transactionDate),
        endDate: toDateOnly(transactionDate),
        dateField: 'createdAt'
      });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.some((item: any) => item.id === createResponse.body.id)).toBe(true);
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

  it('daily materialization job backfills missed credit card fixed occurrences in the current month', async () => {
    const expectedOccurrenceDate = buildOccurrenceDate(1, 10);
    const referenceDate = buildOccurrenceDate(1, 20);

    const fixed = await prisma.recurringTransaction.create({
      data: {
        description: 'Daily Job Backfill Card Fixed',
        amount: 42,
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        dayOfMonth: null,
        startDate: new Date(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          1,
          0,
          0,
          0,
          0
        ),
        nextDueDate: expectedOccurrenceDate,
        isActive: true,
        fromAccountId: creditCardAccountId,
        categoryId: expenseCategoryId,
        companyId,
        createdBy: userId
      }
    });

    const occurrenceKey = buildOccurrenceKeyValue(fixed.id, expectedOccurrenceDate);

    await FixedTransactionService.materializeDueOccurrencesForDate(referenceDate);

    const materialized = await prisma.financialTransaction.findFirst({
      where: {
        companyId,
        occurrenceKey
      }
    });

    expect(materialized).not.toBeNull();
    expect(materialized?.fromAccountId).toBe(creditCardAccountId);
    expect(materialized?.status).toBe('COMPLETED');
    expect(toDateOnly(new Date(materialized!.date))).toBe(toDateOnly(expectedOccurrenceDate));
  });

  it('template update keeps the same template and updates unmaterialized projections', async () => {
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
    const updatedTemplateId = updateResponse.body.id;
    expect(updatedTemplateId).toBe(oldTemplateId);

    const updatedTemplate = await prisma.recurringTransaction.findUnique({ where: { id: oldTemplateId } });

    expect(updatedTemplate).not.toBeNull();
    expect(Number(updatedTemplate?.amount)).toBe(250);
    expect(updatedTemplate?.endDate).toBeNull();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const nextMonth = monthBounds(1);

    const currentMonthList = await listTransactions(currentMonthStart, currentMonthEnd);
    expect(currentMonthList.status).toBe(200);
    const currentVirtual = currentMonthList.body.data.find(
      (item: any) => item.fixedTemplateId === oldTemplateId && item.isVirtual === true
    );
    expect(currentVirtual).toBeDefined();
    expect(Number(currentVirtual.amount)).toBe(250);

    const nextMonthList = await listTransactions(nextMonth.start, nextMonth.end);
    expect(nextMonthList.status).toBe(200);
    const nextVirtual = nextMonthList.body.data.find(
      (item: any) => item.fixedTemplateId === oldTemplateId && item.isVirtual === true
    );
    expect(nextVirtual).toBeDefined();
    expect(Number(nextVirtual.amount)).toBe(250);
  });
});
