import { AccountType } from '@prisma/client';
import prisma from '../../src/lib/prisma';
import FinancialAccountService from '../../src/services/financial-account.service';
import cacheService from '../../src/services/cache.service';
import { BANK_CATALOG, getBankIconPath } from '../../src/catalogs/bank-catalog';

// Exercise cache reuse/invalidation while account and bank persistence use the test database.
jest.mock('../../src/services/cache.service', () => {
  const values = new Map<string, unknown>();
  return {
    __esModule: true,
    default: {
      getAccountBalanceKey: (id: number) => `account:${id}`,
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: unknown) => { values.set(key, value); return true; },
      del: async (key: string) => values.delete(key)
    }
  };
});

describe('Financial account bank logos', () => {
  let companyId: number;
  const bankIds: number[] = [];

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: 'Account logo tests', code: 987621 } });
    companyId = company.id;
    for (const entry of BANK_CATALOG.slice(0, 2)) {
      const bank = await prisma.bank.create({
        data: { code: `LOGO_TEST_${entry.code}`, name: `Logo test ${entry.name}`, iconSlug: entry.iconSlug, displayOrder: entry.displayOrder }
      });
      bankIds.push(bank.id);
    }
  });

  afterAll(async () => {
    if (companyId) {
      await prisma.financialAccount.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.bank.deleteMany({ where: { id: { in: bankIds } } });
    await prisma.$disconnect();
  });

  it.each<AccountType>(['CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH'])(
    'persists, lists, changes and clears the logo for %s accounts', async (type) => {
      const account = await FinancialAccountService.createAccount({
        name: `Conta ${type}`, type, companyId, bankId: bankIds[0], initialBalance: '125.00'
      });
      const firstBank = {
        id: bankIds[0], name: `Logo test ${BANK_CATALOG[0].name}`,
        iconPath: getBankIconPath(BANK_CATALOG[0].iconSlug)
      };
      expect(await FinancialAccountService.getAccountById(account.id)).toMatchObject({ bank: firstBank });
      expect(await FinancialAccountService.listAccounts({ companyId })).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: account.id, bank: expect.objectContaining(firstBank) })
      ]));

      await FinancialAccountService.updateAccount(account.id, { bankId: bankIds[1] });
      expect(await FinancialAccountService.getAccountById(account.id)).toMatchObject({
        bankId: bankIds[1], bankName: `Logo test ${BANK_CATALOG[1].name}`,
        bank: { id: bankIds[1], iconPath: getBankIconPath(BANK_CATALOG[1].iconSlug) }
      });

      await FinancialAccountService.updateAccount(account.id, { bankId: null });
      const cleared = await FinancialAccountService.getAccountById(account.id);
      expect(cleared).toMatchObject({ bankId: null, bankName: null, bankCode: null, bank: null });
      expect(cleared?.balance.toString()).toBe('125');
    }
  );

  it('refreshes cached accounts without bank data and preserves legacy metadata on unrelated edits', async () => {
    const account = await FinancialAccountService.createAccount({
      name: 'Conta legada', type: 'CHECKING', companyId, bankName: 'Banco antigo', bankCode: 'ANTIGO'
    });
    await cacheService.set(cacheService.getAccountBalanceKey(account.id), account);
    expect(await FinancialAccountService.getAccountById(account.id)).toMatchObject({ bank: null, bankName: 'Banco antigo' });
    await FinancialAccountService.updateAccount(account.id, { name: 'Conta renomeada' });
    expect(await FinancialAccountService.getAccountById(account.id)).toMatchObject({
      name: 'Conta renomeada', bankId: null, bankName: 'Banco antigo', bankCode: 'ANTIGO'
    });
  });
});
