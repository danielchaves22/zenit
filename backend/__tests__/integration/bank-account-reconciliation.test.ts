import { PrismaClient } from '@prisma/client';
import Service, { BankContext } from '../../src/services/bank-reconciliation.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import { bradescoCsv, bradescoOfx, nubankCsv, ofx } from '../fixtures/bank-statements';
import express from 'express';
import request from 'supertest';
import financialRoutes from '../../src/routes/financial.routes';

jest.mock('../../src/services/cache.service', () => ({ __esModule: true, default: {
  invalidatePattern: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined),
  getAccountBalanceKey: (id: number) => String(id)
} }));
const prisma = new PrismaClient();
const month = '2026-08';
describe('Bank reconciliation persisted workflow', () => {
  let companyId: number, userId: number, accountId: number, otherAccountId: number, categoryId: number, context: BankContext;
  const importedIds = async () => (await prisma.bankStatementItem.findMany({ where: { accountId }, orderBy: { id: 'asc' } })).map(i => i.id);
  const importRows = (rows: Array<[string, string, string, string]>) => Service.import(context, month, nubankCsv(rows).toString('base64'), 'nubank.csv');
  const createExisting = (amount: string, overrides: Record<string, unknown> = {}) => prisma.financialTransaction.create({ data: {
    description: 'Padaria', amount, date: new Date('2026-08-22'), effectiveDate: new Date('2026-08-22'), status: 'COMPLETED', type: 'EXPENSE',
    fromAccountId: accountId, categoryId, companyId, createdBy: userId, ...overrides
  } });
  const confirm = async (itemIds: number[], transactionIds: number[], extra = {}) => {
    const transactions = await prisma.financialTransaction.findMany({ where: { id: { in: transactionIds } } });
    return Service.confirm(context, month, { itemIds, transactions: transactions.map(t => ({ id: t.id, version: t.updatedAt.toISOString() })), ...extra });
  };
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: 'Bank reconciliation test', code: Number(`8${String(Date.now()).slice(-7)}`) } });
    companyId = company.id;
    const user = await prisma.user.create({ data: { name: 'Reconciler', email: `bank-${Date.now()}@test.invalid`, password: 'not-a-real-password', role: 'ADMIN' } });
    userId = user.id;
  });
  beforeEach(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    const account = await prisma.financialAccount.create({ data: { name: 'Nubank', companyId, type: 'CHECKING', balance: '1000.00', allowNegativeBalance: true } });
    const other = await prisma.financialAccount.create({ data: { name: 'Bradesco', companyId, type: 'CHECKING', balance: '1000.00', allowNegativeBalance: true } });
    accountId = account.id; otherAccountId = other.id;
    categoryId = (await prisma.financialCategory.create({ data: { name: 'Alimentação', type: 'EXPENSE', companyId } })).id;
    context = { companyId, accountId, userId, role: 'ADMIN' };
  });
  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('deduplicates Bradesco CSV/OFX, keeps September rows, and never imports investment balances', async () => {
    const preview = await Service.preview(context, month, bradescoCsv.toString('base64'));
    expect(preview.inMonth).toBe(2); expect(preview.outsideCount).toBe(1);
    const first = await Service.import(context, month, bradescoCsv.toString('base64'), 'bradesco.csv');
    const repeated = await Service.import(context, month, bradescoCsv.toString('base64'), 'same.csv');
    const otherFormat = await Service.import(context, month, bradescoOfx.toString('base64'), 'bradesco.ofx');
    expect(first.created).toBe(3); expect(repeated.created).toBe(0); expect(otherFormat.created).toBe(0);
    expect(await prisma.bankStatementItem.count({ where: { accountId } })).toBe(3);
    expect(await prisma.bankStatementImport.count({ where: { accountId } })).toBe(2);
    expect((await Service.load(context, month)).summary.total).toBe(2);
    expect((await Service.load(context, '2026-09')).summary.total).toBe(1);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
  });
  it('reimports Nubank in another format and preserves individually distinct same-value rows', async () => {
    await importRows([['22/08/2026', '-20.00', 'nu1', 'Padaria'], ['22/08/2026', '-20.00', 'nu2', 'Padaria']]);
    const file = ofx(260, [1, 2].map(i => ({ date: '2026-08-22', amount: '-20.00', id: `nu${i}`, description: 'Padaria' })));
    expect((await Service.import(context, month, file.toString('base64'), 'nu.ofx')).created).toBe(0);
    expect(await importedIds()).toHaveLength(2);
    await expect(Service.import(context, month, bradescoCsv.toString('base64'), 'wrong-bank.csv')).rejects.toThrow('outra conta');
  });
  it('suggests grouped values using effectiveDate, and confirmation does not change an existing balance', async () => {
    await importRows([['22/08/2026', '-38.34', 'a', 'Padaria'], ['22/08/2026', '-8.30', 'b', 'Padaria']]);
    const existing = await createExisting('46.64', { dueDate: new Date('2026-09-10') });
    const itemIds = await importedIds();
    const suggestions = await Service.candidates(context, month, [itemIds[0]]);
    expect(suggestions.candidates[0].itemIds).toEqual(itemIds);
    const group = await confirm(itemIds, [existing.id]);
    expect(group.status).toBe('CONFIRMED');
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('1000.00');
    expect((await Service.load(context, month)).summary.confirmed).toBe(2);
    await Service.status(context, month, 'COMPLETED');
    await expect(Service.undo(context, month, group.id, 'Corrigir')).rejects.toThrow('Reabra');
    await Service.status(context, month, 'OPEN');
    await Service.undo(context, month, group.id, 'Correspondência incorreta');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(1);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('1000.00');
    expect((await Service.load(context, month)).summary.pending).toBe(2);
  });
  it('invalidates the entire group after a financial edit and retains snapshots after deletion', async () => {
    await importRows([['22/08/2026', '-46.64', 'a', 'Padaria']]);
    const first = await createExisting('38.34'), second = await createExisting('8.30');
    const group = await confirm(await importedIds(), [first.id, second.id]);
    await Service.status(context, month, 'COMPLETED');
    await FinancialTransactionService.updateTransaction(first.id, { amount: '39.34' }, companyId);
    expect((await prisma.bankReconciliationGroup.findUniqueOrThrow({ where: { id: group.id } })).status).toBe('REVIEW');
    expect((await Service.load(context, month)).session?.status).toBe('OPEN');
    expect(await prisma.bankReconciliationTransaction.count({ where: { groupId: group.id, active: true } })).toBe(0);
    await prisma.financialTransaction.delete({ where: { id: first.id } });
    const audit = await Service.audit(context, month);
    expect(audit.groups[0].items).toHaveLength(1);
    expect(audit.groups[0].transactions).toHaveLength(2);
  });
  it('requires explicit settlement, changes the balance once, and rolls back mismatched totals', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const existing = await createExisting('21.00', { status: 'PENDING', effectiveDate: null });
    const itemIds = await importedIds();
    await expect(confirm(itemIds, [existing.id])).rejects.toThrow('liquidação');
    await expect(confirm(itemIds, [existing.id], { settlePending: true, settlementDate: '2026-08-22' })).rejects.toThrow('valores');
    expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: existing.id } })).status).toBe('PENDING');
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('1000.00');
    await prisma.financialTransaction.update({ where: { id: existing.id }, data: { amount: '20.00' } });
    await confirm(itemIds, [existing.id], { settlePending: true, settlementDate: '2026-08-22' });
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('980.00');
    await expect(confirm(itemIds, [existing.id], { settlePending: true, settlementDate: '2026-08-22' })).rejects.toThrow('já foi conciliado');
  });
  it('creates a missing transaction and its link atomically, with no duplicate on retry', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const payload = { itemIds: await importedIds(), description: 'Padaria', categoryId, effectiveDate: '2026-08-22' };
    await expect(Service.create(context, month, { ...payload, categoryId: 99999999 })).rejects.toThrow();
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    await Service.create(context, month, payload);
    await expect(Service.create(context, month, payload)).rejects.toThrow('já foi conciliado');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(1);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('980.00');
  });
  it('reconciles both sides of a transfer while forbidding two links on the same side', async () => {
    await importRows([['22/08/2026', '-100.00', 'a', 'Transferência'], ['22/08/2026', '-100.00', 'b', 'Outra transferência']]);
    const transfer = await createExisting('100.00', { description: 'Transferência', type: 'TRANSFER', toAccountId: otherAccountId, categoryId: null });
    const itemIds = await importedIds();
    await confirm([itemIds[0]], [transfer.id]);
    await expect(confirm([itemIds[1]], [transfer.id])).rejects.toThrow('já está conciliado');
    const otherContext = { ...context, accountId: otherAccountId };
    await Service.import(otherContext, month, nubankCsv([['22/08/2026', '100.00', 'other', 'Transferência']]).toString('base64'), 'incoming.csv');
    const incoming = await prisma.bankStatementItem.findFirstOrThrow({ where: { accountId: otherAccountId } });
    await Service.confirm(otherContext, month, { itemIds: [incoming.id], transactions: [{ id: transfer.id, version: transfer.updatedAt.toISOString() }] });
    expect(await prisma.bankReconciliationTransaction.count({ where: { transactionId: transfer.id, active: true } })).toBe(2);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(1);
  });
  it('rejects cross-company and cross-account links, and hides restricted transfer candidates', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Transferência']]);
    const transfer = await createExisting('20.00', { type: 'TRANSFER', toAccountId: otherAccountId, categoryId: null });
    await expect(Service.load({ ...context, companyId: companyId + 999999 }, month)).rejects.toThrow('Acesso negado');
    const wrongAccount = await createExisting('20.00', { fromAccountId: otherAccountId });
    await expect(confirm(await importedIds(), [wrongAccount.id])).rejects.toThrow('permissão');
    await prisma.userFinancialAccountAccess.create({ data: { userId, financialAccountId: accountId, companyId, grantedBy: userId } });
    const limited = { ...context, role: 'USER' };
    expect((await Service.candidates(limited, month, await importedIds())).candidates).toHaveLength(0);
    await expect(Service.confirm(limited, month, { itemIds: await importedIds(), transactions: [{ id: transfer.id, version: transfer.updatedAt.toISOString() }] })).rejects.toThrow('permissão');
  });
  it('remembers rejections for the reviewed pair and refuses stale confirmation versions', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const existing = await createExisting('20.00');
    const payload = { itemIds: await importedIds(), transactions: [{ id: existing.id, version: existing.updatedAt.toISOString() }] };
    await Service.reject(context, month, payload);
    expect((await Service.candidates(context, month, payload.itemIds)).candidates).toHaveLength(0);
    await prisma.financialTransaction.update({ where: { id: existing.id }, data: { description: 'Padaria corrigida' } });
    expect((await Service.candidates(context, month, payload.itemIds)).candidates).toHaveLength(1);
    await expect(Service.confirm(context, month, payload)).rejects.toThrow('alterado');
  });
  it('does not complete a partially visible account while a restricted transfer remains unlinked', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const existing = await createExisting('20.00');
    await confirm(await importedIds(), [existing.id]);
    await createExisting('100.00', { type: 'TRANSFER', toAccountId: otherAccountId, categoryId: null });
    await prisma.userFinancialAccountAccess.create({ data: { userId, financialAccountId: accountId, companyId, grantedBy: userId } });
    const limited = { ...context, role: 'USER' };
    const view = await Service.load(limited, month);
    expect(view.summary.restrictedTransactions).toBe(1);
    expect(view.summary.unmatchedTransactions).toBe(1);
    expect((await Service.transactions(limited, month)).items).toHaveLength(0);
    await expect(Service.status(limited, month, 'COMPLETED')).rejects.toThrow('sem vínculo');
  });
  it('blocks completion with unlinked transactions and reopens after a retrospective insertion', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const existing = await createExisting('20.00'), extra = await createExisting('10.00');
    await confirm(await importedIds(), [existing.id]);
    await expect(Service.status(context, month, 'COMPLETED')).rejects.toThrow('sem vínculo');
    await prisma.financialTransaction.delete({ where: { id: extra.id } });
    await Service.status(context, month, 'COMPLETED');
    await createExisting('5.00');
    expect((await Service.load(context, month)).session?.status).toBe('OPEN');
  });
  it('serializes concurrent confirmation without adding duplicate active claims', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const existing = await createExisting('20.00'), itemIds = await importedIds();
    const results = await Promise.allSettled([confirm(itemIds, [existing.id]), confirm(itemIds, [existing.id])]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.bankReconciliationTransaction.count({ where: { accountId, active: true } })).toBe(1);
  });
  it('keeps manual balance adjustments outside the bank movement matching', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    await createExisting('20.00', { entryKind: 'BALANCE_ADJUSTMENT', description: 'Saldo inicial' });
    expect((await Service.candidates(context, month, await importedIds())).candidates).toHaveLength(0);
    const existing = await createExisting('20.00');
    await confirm(await importedIds(), [existing.id]);
    await Service.status(context, month, 'COMPLETED');
    await createExisting('15.00', { entryKind: 'BALANCE_ADJUSTMENT', description: 'Ajuste manual' });
    expect((await Service.load(context, month)).session?.status).toBe('COMPLETED');
  });
  it('routes the monthly workspace and never accepts body/query account overrides', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { companyId, userId, role: 'ADMIN' } as typeof req.user; next(); });
    app.use('/financial', financialRoutes);
    const path = `/financial/accounts/${accountId}/reconciliation/${month}`;
    const upload = nubankCsv([['22/08/2026', '-20.00', 'a', 'Padaria']]).toString('base64');
    expect((await request(app).post(`${path}/preview`).send({ fileBase64: upload, fileName: 'file.csv', accountId: otherAccountId })).status).toBe(200);
    expect((await request(app).post(`${path}/imports?id=${otherAccountId}`).send({ fileBase64: upload, fileName: 'file.csv', id: otherAccountId })).status).toBe(200);
    expect((await request(app).get(path)).body.account.id).toBe(accountId);
    expect(await prisma.bankStatementItem.count({ where: { accountId: otherAccountId } })).toBe(0);
    expect((await request(app).post(`${path}/confirm`).send({ itemIds: [], transactions: [] })).status).toBe(400);
    expect((await request(app).get(`/financial/accounts/${accountId}/reconciliation/2026-13`)).status).toBe(400);
  });
});
