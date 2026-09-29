import { AssistantMode, PrismaClient, Role } from '@prisma/client';
import ToolExecutorService from '../../src/services/tool-executor.service';
import UserFinancialAccountAccessService from '../../src/services/user-financial-account-access.service';

const prisma = new PrismaClient();

describe('Assistant recent transactions account access', () => {
  let companyId: number;
  let otherCompanyId: number;
  let userId: number;
  let secondUserId: number;
  let allowedAccountId: number;
  let privateAccountId: number;
  let otherCompanyAccountId: number;
  let allowedExpenseId: number;
  let allowedIncomeId: number;
  let privateExpenseId: number;
  let unassignedExpenseId: number;

  beforeAll(async () => {
    const suffix = Date.now();
    const company = await prisma.company.create({
      data: { name: 'Assistant access test', code: Number(`8${String(suffix).slice(-7)}`) }
    });
    const otherCompany = await prisma.company.create({
      data: { name: 'Other assistant access test', code: Number(`9${String(suffix).slice(-7)}`) }
    });
    companyId = company.id;
    otherCompanyId = otherCompany.id;

    const user = await prisma.user.create({
      data: { email: `assistant-access-${suffix}@test.com`, password: 'test-only', name: 'Reader', role: 'USER' }
    });
    const secondUser = await prisma.user.create({
      data: { email: `assistant-access-second-${suffix}@test.com`, password: 'test-only', name: 'Second reader', role: 'USER' }
    });
    userId = user.id;
    secondUserId = secondUser.id;
    await prisma.userCompany.createMany({
      data: [
        { userId, companyId, role: 'USER' },
        { userId, companyId: otherCompanyId, role: 'USER' },
        { userId: secondUserId, companyId, role: 'USER' }
      ]
    });

    const allowed = await prisma.financialAccount.create({
      data: { companyId, name: 'Allowed account', type: 'CHECKING' }
    });
    const privateAccount = await prisma.financialAccount.create({
      data: { companyId, name: 'Private account', type: 'CHECKING' }
    });
    const otherAccount = await prisma.financialAccount.create({
      data: { companyId: otherCompanyId, name: 'Other company account', type: 'CHECKING' }
    });
    allowedAccountId = allowed.id;
    privateAccountId = privateAccount.id;
    otherCompanyAccountId = otherAccount.id;

    const common = { companyId, createdBy: userId, date: new Date('2026-09-29T12:00:00Z'), amount: 10 };
    allowedExpenseId = (await prisma.financialTransaction.create({
      data: { ...common, description: 'Allowed expense', type: 'EXPENSE', fromAccountId: allowedAccountId }
    })).id;
    allowedIncomeId = (await prisma.financialTransaction.create({
      data: { ...common, description: 'Allowed income', type: 'INCOME', toAccountId: allowedAccountId }
    })).id;
    privateExpenseId = (await prisma.financialTransaction.create({
      data: { ...common, description: 'Private expense', type: 'EXPENSE', fromAccountId: privateAccountId }
    })).id;
    unassignedExpenseId = (await prisma.financialTransaction.create({
      data: { ...common, description: 'Unassigned expense', type: 'EXPENSE' }
    })).id;
    await prisma.financialTransaction.create({
      data: { ...common, companyId: otherCompanyId, description: 'Other company expense', type: 'EXPENSE', fromAccountId: otherCompanyAccountId }
    });
  });

  beforeEach(async () => {
    await prisma.userFinancialAccountAccess.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.userCompany.update({
      where: { userId_companyId: { userId, companyId } },
      data: { role: 'USER' }
    });
  });

  afterAll(async () => {
    const companyIds = [companyId, otherCompanyId].filter((id): id is number => typeof id === 'number');
    const userIds = [userId, secondUserId].filter((id): id is number => typeof id === 'number');
    await prisma.financialTransaction.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.userFinancialAccountAccess.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.financialAccount.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.userCompany.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function grant(accountId: number, readerId = userId, workspaceId = companyId) {
    await UserFinancialAccountAccessService.grantAccess({
      userId: readerId, accountIds: [accountId], companyId: workspaceId, grantedBy: userId
    });
  }

  async function recentTransactionIds(readerId = userId, workspaceId = companyId) {
    const membership = await prisma.userCompany.findUniqueOrThrow({
      where: { userId_companyId: { userId: readerId, companyId: workspaceId } }
    });
    const result = await ToolExecutorService.executeTool('get_recent_transactions', { limit: 10 }, {
      userId: readerId, companyId: workspaceId, role: membership.role,
      sessionId: 0, turnId: 0, mode: AssistantMode.OPERATOR
    });
    return (result.data.transactions as Array<{ id: number }>).map(({ id }) => id).sort((a, b) => a - b);
  }

  it('returns no transactions for a USER without account grants', async () => {
    expect(await recentTransactionIds()).toEqual([]);
  });

  it('returns only transactions involving the authorized account as source or destination', async () => {
    await grant(allowedAccountId);
    expect(await recentTransactionIds()).toEqual([allowedExpenseId, allowedIncomeId].sort((a, b) => a - b));
  });

  it('keeps each user limited to their own grants in the same company', async () => {
    await grant(allowedAccountId);
    await grant(privateAccountId, secondUserId);
    expect(await recentTransactionIds()).toEqual([allowedExpenseId, allowedIncomeId].sort((a, b) => a - b));
    expect(await recentTransactionIds(secondUserId)).toEqual([privateExpenseId]);
  });

  it.each([Role.ADMIN, Role.SUPERUSER])('preserves %s access only within the selected company', async (role) => {
    await prisma.userCompany.update({ where: { userId_companyId: { userId, companyId } }, data: { role } });
    expect(await recentTransactionIds()).toEqual(
      [allowedExpenseId, allowedIncomeId, privateExpenseId, unassignedExpenseId].sort((a, b) => a - b)
    );
  });

  it('returns no transactions immediately after revoking the last account grant', async () => {
    await grant(allowedAccountId);
    expect(await recentTransactionIds()).toHaveLength(2);
    await UserFinancialAccountAccessService.revokeAccess({ userId, accountIds: [allowedAccountId], companyId });
    expect(await recentTransactionIds()).toEqual([]);
  });

  it('does not use a grant from another company to expose local transactions', async () => {
    await grant(otherCompanyAccountId, userId, otherCompanyId);
    expect(await recentTransactionIds(userId, otherCompanyId)).toHaveLength(1);
    expect(await recentTransactionIds()).toEqual([]);
  });
});
