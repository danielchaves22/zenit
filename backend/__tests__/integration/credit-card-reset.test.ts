import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Credit card reset', () => {
  let companyId: number;
  let ownerUserId: number;
  let ownerToken: string;
  let nonOwnerUserId: number;
  let nonOwnerToken: string;
  let categoryId: number;
  let payerAccountId: number;
  let cardAccountId: number;

  const ownerHeaders = () => ({
    Authorization: `Bearer ${ownerToken}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const nonOwnerHeaders = () => ({
    Authorization: `Bearer ${nonOwnerToken}`,
    'X-Company-Id': companyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  async function seedCardHistory() {
    const recurringTemplate = await prisma.recurringTransaction.create({
      data: {
        description: 'Assinatura do cartao',
        amount: 50,
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        startDate: new Date('2026-06-01T12:00:00.000Z'),
        nextDueDate: new Date('2026-06-10T12:00:00.000Z'),
        fromAccountId: cardAccountId,
        categoryId,
        companyId,
        createdBy: ownerUserId
      }
    });

    const paidInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: cardAccountId,
        referenceYear: 2026,
        referenceMonth: 5,
        closingDate: new Date('2026-05-10T12:00:00.000Z'),
        dueDate: new Date('2026-05-17T12:00:00.000Z'),
        status: 'PAID',
        settlementType: 'TRANSFER',
        settledAt: new Date('2026-05-17T12:00:00.000Z'),
        totalAmount: 100
      }
    });

    const openInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: cardAccountId,
        referenceYear: 2026,
        referenceMonth: 6,
        closingDate: new Date('2026-06-10T12:00:00.000Z'),
        dueDate: new Date('2026-06-17T12:00:00.000Z'),
        status: 'OPEN',
        totalAmount: 50
      }
    });

    const externalPaidInvoice = await prisma.creditCardInvoice.create({
      data: {
        accountId: cardAccountId,
        referenceYear: 2026,
        referenceMonth: 4,
        closingDate: new Date('2026-04-10T12:00:00.000Z'),
        dueDate: new Date('2026-04-17T12:00:00.000Z'),
        status: 'PAID',
        settlementType: 'EXTERNAL',
        settledAt: new Date('2026-04-17T12:00:00.000Z'),
        totalAmount: 30
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra parcelada antiga',
        amount: 100,
        date: new Date('2026-05-04T12:00:00.000Z'),
        dueDate: paidInvoice.dueDate,
        effectiveDate: new Date('2026-05-04T12:00:00.000Z'),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: cardAccountId,
        categoryId,
        companyId,
        createdBy: ownerUserId,
        purchaseGroupId: 'purchase-group-paid',
        creditCardInvoiceId: paidInvoice.id
      }
    });

    const paymentTransaction = await prisma.financialTransaction.create({
      data: {
        description: 'Pagamento da fatura do cartao',
        amount: 100,
        date: new Date('2026-05-17T12:00:00.000Z'),
        effectiveDate: new Date('2026-05-17T12:00:00.000Z'),
        type: 'TRANSFER',
        status: 'COMPLETED',
        fromAccountId: payerAccountId,
        toAccountId: cardAccountId,
        companyId,
        createdBy: ownerUserId
      }
    });

    await prisma.creditCardInvoice.update({
      where: { id: paidInvoice.id },
      data: { paymentTransactionId: paymentTransaction.id }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Fixa materializada do cartao',
        amount: 50,
        date: new Date('2026-06-10T12:00:00.000Z'),
        dueDate: openInvoice.dueDate,
        effectiveDate: new Date('2026-06-10T12:00:00.000Z'),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: cardAccountId,
        categoryId,
        companyId,
        createdBy: ownerUserId,
        recurringTransactionId: recurringTemplate.id,
        occurrenceKey: `${recurringTemplate.id}:2026-06`,
        purchaseGroupId: 'purchase-group-fixed',
        creditCardInvoiceId: openInvoice.id
      }
    });

    await prisma.financialTransaction.create({
      data: {
        description: 'Compra em fatura paga externamente',
        amount: 30,
        date: new Date('2026-04-04T12:00:00.000Z'),
        dueDate: externalPaidInvoice.dueDate,
        effectiveDate: new Date('2026-04-04T12:00:00.000Z'),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: cardAccountId,
        categoryId,
        companyId,
        createdBy: ownerUserId,
        purchaseGroupId: 'purchase-group-external',
        creditCardInvoiceId: externalPaidInvoice.id,
        isExternalCreditCardSettlement: true
      }
    });

    await prisma.financialAccount.update({
      where: { id: payerAccountId },
      data: { balance: 900 }
    });

    await prisma.financialAccount.update({
      where: { id: cardAccountId },
      data: { balance: -50 }
    });
  }

  beforeAll(async () => {
    const companyCode = Number(`9${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Credit Card Reset Test',
        code: companyCode
      }
    });
    companyId = company.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const ownerUser = await prisma.user.create({
      data: {
        email: `credit-card-reset-owner-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Credit Card Owner',
        role: 'USER'
      }
    });
    ownerUserId = ownerUser.id;

    const nonOwnerUser = await prisma.user.create({
      data: {
        email: `credit-card-reset-user-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Credit Card Non Owner',
        role: 'SUPERUSER'
      }
    });
    nonOwnerUserId = nonOwnerUser.id;

    await prisma.userCompany.create({
      data: {
        userId: ownerUserId,
        companyId,
        isDefault: true,
        role: 'USER',
        isCompanyOwner: true,
        manageFinancialAccounts: true,
        manageFinancialCategories: true
      }
    });

    await prisma.userCompany.create({
      data: {
        userId: nonOwnerUserId,
        companyId,
        isDefault: false,
        role: 'SUPERUSER',
        isCompanyOwner: false,
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
          userId: ownerUserId,
          companyId,
          appId: ecosystemApp.id
        }
      },
      update: { granted: true },
      create: { userId: ownerUserId, companyId, appId: ecosystemApp.id, granted: true }
    });

    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId: nonOwnerUserId,
          companyId,
          appId: ecosystemApp.id
        }
      },
      update: { granted: true },
      create: { userId: nonOwnerUserId, companyId, appId: ecosystemApp.id, granted: true }
    });

    ownerToken = generateToken({ userId: ownerUserId });
    nonOwnerToken = generateToken({ userId: nonOwnerUserId });
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
        name: `Conta Pagadora Reset ${Date.now()}`,
        type: 'CHECKING',
        balance: 1000,
        allowNegativeBalance: true,
        companyId
      }
    });
    payerAccountId = payerAccount.id;

    const cardAccount = await prisma.financialAccount.create({
      data: {
        name: `Cartao Reset ${Date.now()}`,
        type: 'CREDIT_CARD',
        balance: 0,
        allowNegativeBalance: true,
        creditLimit: 2500,
        statementClosingDay: 10,
        statementDueDay: 17,
        companyId
      }
    });
    cardAccountId = cardAccount.id;

    const category = await prisma.financialCategory.create({
      data: {
        name: `Categoria Reset ${Date.now()}`,
        type: 'EXPENSE',
        color: '#ef4444',
        companyId
      }
    });
    categoryId = category.id;
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
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, nonOwnerUserId] } } });
    await prisma.$disconnect();
  });

  it('allows only company owners to preview the credit card reset', async () => {
    const response = await request(app)
      .get(`/api/financial/credit-cards/${cardAccountId}/reset/preview`)
      .set(nonOwnerHeaders());

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      'Acesso negado: apenas o company owner pode executar esta acao.'
    );
  });

  it('removes only the selected credit card history and restores affected account balances', async () => {
    await seedCardHistory();

    const previewResponse = await request(app)
      .get(`/api/financial/credit-cards/${cardAccountId}/reset/preview`)
      .set(ownerHeaders());

    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body).toMatchObject({
      card: {
        id: cardAccountId
      },
      deleted: {
        transactions: 4,
        creditCardPurchases: 3,
        creditCardInvoices: 3,
        fixedTemplates: 1,
        fixedOccurrences: 1,
        invoicePayments: 1
      },
      balances: {
        affectedAccounts: 1,
        cardBalanceAfterReset: '0.00'
      },
      safeguards: {
        affectsOnlySelectedCard: true,
        budgetsUnaffected: true
      }
    });

    const executeResponse = await request(app)
      .post(`/api/financial/credit-cards/${cardAccountId}/reset`)
      .set(ownerHeaders())
      .send({
        confirmationText: 'RESETAR'
      });

    expect(executeResponse.status).toBe(200);
    expect(executeResponse.body.deleted.transactions).toBe(4);

    const [remainingTransactions, remainingInvoices, remainingFixedTemplates, payerAccount, cardAccount] =
      await Promise.all([
        prisma.financialTransaction.count({ where: { companyId } }),
        prisma.creditCardInvoice.count({ where: { accountId: cardAccountId } }),
        prisma.recurringTransaction.count({ where: { companyId } }),
        prisma.financialAccount.findUnique({ where: { id: payerAccountId } }),
        prisma.financialAccount.findUnique({ where: { id: cardAccountId } })
      ]);

    expect(remainingTransactions).toBe(0);
    expect(remainingInvoices).toBe(0);
    expect(remainingFixedTemplates).toBe(0);
    expect(Number(payerAccount?.balance)).toBe(1000);
    expect(Number(cardAccount?.balance)).toBe(0);
  });
});
