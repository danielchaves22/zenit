import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { normalizeCreditCardHistoryDescription } from '../../src/services/credit-card-reconciliation-history.service';
import { loadReconciliationDescriptionSuggestions } from '../../src/services/reconciliation-description-suggestion.service';

const db = new PrismaClient();
const date = new Date('2026-11-01T00:00:00Z');
const raw = 'Café-010 A&B';
const alternate = 'Cafe / 010 A&B';

async function fixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({ data: { name: 'Reader', email: `${randomUUID()}@test.invalid`, password: 'test' } });
  const company = await tx.company.create({ data: { name: 'Global reconciliation', code: 75813924 } });
  const companyId = company.id, userId = user.id;
  const membership = await tx.userCompany.create({ data: { userId, companyId, role: 'USER', manageFinancialAccounts: true } });
  const app = await tx.ecosystemApp.upsert({ where: { appKey: 'ZENIT_CASH' }, update: { isActive: true },
    create: { appKey: 'ZENIT_CASH', name: 'Cash' } });
  await tx.companyAppEntitlement.create({ data: { companyId, appId: app.id } });
  const grant = await tx.userAppGrant.create({ data: { userId, companyId, appId: app.id } });
  const card = await tx.financialAccount.create({ data: { companyId, type: 'CREDIT_CARD', name: 'Card' } });
  const bank = await tx.financialAccount.create({ data: { companyId, type: 'CHECKING', name: 'Bank' } });
  const hidden = await tx.financialAccount.create({ data: { companyId, type: 'CHECKING', name: 'Hidden' } });
  await tx.userFinancialAccountAccess.createMany({ data: [card, bank].map(a => ({ companyId, userId, grantedBy: userId, financialAccountId: a.id })) });
  const invoice = await tx.creditCardInvoice.create({ data: { accountId: card.id, referenceYear: 2026, referenceMonth: 11, closingDate: date, dueDate: date } });
  const expense = await tx.financialTransaction.create({ data: { companyId, createdBy: userId, fromAccountId: card.id, creditCardInvoiceId: invoice.id,
    type: 'EXPENSE', amount: 50, date, description: 'Descrição do cartão' } });
  await tx.creditCardDescriptionHistory.create({ data: {
    accountId: card.id, invoiceId: invoice.id, transactionId: expense.id, sourceType: 'NUBANK_OFX', sourceDescription: raw,
    sourceHash: createHash('sha256').update(normalizeCreditCardHistoryDescription(raw)).digest('hex'),
    kind: 'PURCHASE', amount: 50, date, confirmedAt: new Date('2026-11-10Z')
  } });
  const reconciliation = await tx.bankReconciliation.create({ data: { accountId: bank.id, month: '2026-11' } });
  async function linkBank(description: string, confirmedAt: string, otherAccountId?: number) {
    const transaction = await tx.financialTransaction.create({ data: { companyId, createdBy: userId, toAccountId: bank.id,
      fromAccountId: otherAccountId, type: otherAccountId ? 'TRANSFER' : 'INCOME', amount: 20, date, description } });
    const item = await tx.bankStatementItem.create({ data: { accountId: bank.id, identityKey: randomUUID(), date,
      amount: 20, description: alternate, normalizedDescription: 'CAFE 010 A B' } });
    const group = await tx.bankReconciliationGroup.create({ data: { reconciliationId: reconciliation.id, createdBy: userId,
      createdAt: new Date(confirmedAt), items: { create: { itemId: item.id } }, transactions: { create: {
        accountId: bank.id, originalTransactionId: transaction.id, transactionId: transaction.id, snapshot: {}
      } } } });
    await tx.bankStatementItem.update({ where: { id: item.id }, data: { activeGroupId: group.id } });
    return { item, group, transaction };
  }
  const load = (sources = [raw]) => loadReconciliationDescriptionSuggestions({ companyId, userId, sourceDescriptions: sources, existingTx: tx });
  return { userId, companyId, membership, grant, card, bank, hidden, expense, linkBank, load };
}

// Roll back synthetic workspaces even on assertion failures. No fixture survives into another test suite.
async function check(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error('rollback fixture');
  try {
    await db.$transaction(async tx => { await run(tx); throw rollback; }, { timeout: 20000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

afterAll(() => db.$disconnect());

it('selects the latest visible explicit decision in either module and drops undone or ambiguous links', () => check(async tx => {
  const f = await fixture(tx);
  const sources = [raw, alternate, 'Café-011 A&B', 'Café-010 A+B', ''];
  const options = (text: string) => new Map([[raw, text], [alternate, text]]);
  const bank = await f.linkBank('Descrição bancária', '2026-11-16Z');
  expect(await f.load(sources)).toEqual(options('Descrição bancária'));
  await tx.creditCardDescriptionHistory.update({ where: { transactionId: f.expense.id }, data: { confirmedAt: new Date('2026-11-17Z') } });
  expect(await f.load(sources)).toEqual(options('Descrição do cartão'));
  await tx.creditCardDescriptionHistory.update({ where: { transactionId: f.expense.id }, data: { confirmedAt: null } });
  expect(await f.load(sources)).toEqual(options('Descrição bancária'));
  const secondItem = await tx.bankStatementItem.create({ data: { accountId: f.bank.id, identityKey: randomUUID(), date,
    amount: 20, description: 'Outro estabelecimento', normalizedDescription: 'OUTRO ESTABELECIMENTO', activeGroupId: bank.group.id } });
  await tx.bankReconciliationGroupItem.create({ data: { groupId: bank.group.id, itemId: secondItem.id } });
  expect(await f.load(sources)).toEqual(options('Descrição do cartão'));
  await tx.bankStatementItem.delete({ where: { id: secondItem.id } });
  await tx.bankReconciliationGroup.update({ where: { id: bank.group.id }, data: { status: 'UNDONE' } });
  expect(await f.load(sources)).toEqual(options('Descrição do cartão'));
  await tx.financialTransaction.update({ where: { id: f.expense.id }, data: { archivedAt: date } });
  expect(await f.load(sources)).toEqual(new Map());
}));

it('requires Cash membership, feature and account grants, including the other side of a transfer', () => check(async tx => {
  const f = await fixture(tx);
  await f.linkBank('Conta sem acesso', '2026-11-20Z', f.hidden.id);
  expect((await f.load()).get(raw)).toBe('Descrição do cartão');
  await tx.userFinancialAccountAccess.deleteMany({ where: { userId: f.userId, financialAccountId: f.bank.id } });
  expect((await f.load()).get(raw)).toBe('Descrição do cartão');
  await tx.userCompany.update({ where: { id: f.membership.id }, data: { manageFinancialAccounts: false } });
  expect(await f.load()).toEqual(new Map());
  await tx.userCompany.update({ where: { id: f.membership.id }, data: { role: 'SUPERUSER' } });
  expect((await f.load()).get(raw)).toBe('Conta sem acesso');
  await tx.userAppGrant.update({ where: { id: f.grant.id }, data: { granted: false } });
  expect(await f.load()).toEqual(new Map());
  await tx.userAppGrant.update({ where: { id: f.grant.id }, data: { granted: true } });
  await tx.userCompany.delete({ where: { id: f.membership.id } });
  expect(await f.load()).toEqual(new Map());
}));

it('does not cross workspaces even for a user who manages accounts in both', () => check(async tx => {
  const f = await fixture(tx);
  const other = await tx.company.create({ data: { name: 'Other workspace', code: 75813925 } });
  await tx.userCompany.create({ data: { companyId: other.id, userId: f.userId, role: 'SUPERUSER' } });
  await tx.companyAppEntitlement.create({ data: { appId: f.grant.appId, companyId: other.id } });
  await tx.userAppGrant.create({ data: { appId: f.grant.appId, companyId: other.id, userId: f.userId } });
  expect(await loadReconciliationDescriptionSuggestions({
    companyId: other.id, userId: f.userId, sourceDescriptions: [raw], existingTx: tx
  })).toEqual(new Map());
  expect((await f.load()).get(raw)).toBe('Descrição do cartão');
}));
