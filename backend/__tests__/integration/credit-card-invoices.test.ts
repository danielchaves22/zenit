import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Credit card invoices', () => {
  let companyId: number;
  let userId: number;
  let token: string;
  let expenseCategoryId: number;
  let payerAccountId: number;

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const createCreditCardAccount = async () => {
    const response = await request(app)
      .post('/api/financial/accounts')
      .set(authHeaders())
      .send({
        name: `Cartao Teste ${Date.now()}`,
        type: 'CREDIT_CARD',
        initialBalance: 0,
        bankName: 'Banco Teste',
        creditLimit: 1000,
        statementClosingDay: 10,
        statementDueDay: 15
      });

    expect(response.status).toBe(201);
    return response.body;
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
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
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
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.creditCardInvoice.deleteMany({ where: { account: { companyId } } });
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

  it('creates credit card accounts with limit and statement cycle', async () => {
    const card = await createCreditCardAccount();

    expect(card.type).toBe('CREDIT_CARD');
    expect(card.allowNegativeBalance).toBe(true);
    expect(card.creditLimit).toBe('1000');
    expect(card.statementClosingDay).toBe(10);
    expect(card.statementDueDay).toBe(15);
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
});
