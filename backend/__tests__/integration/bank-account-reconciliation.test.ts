import { PrismaClient } from '@prisma/client';
import Service, { BankContext } from '../../src/services/bank-reconciliation.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import { bradescoCsv, bradescoOfx, nubankCsv, ofx } from '../fixtures/bank-statements';
import express from 'express';
import request from 'supertest';
import financialRoutes from '../../src/routes/financial.routes';
import { suggestBankMatchByAi } from '../../src/services/bank-reconciliation-ai.service';

jest.mock('../../src/services/bank-reconciliation-ai.service', () => ({ suggestBankMatchByAi: jest.fn(async ({ candidates }) => ({ candidates, message: 'IA consultada no teste.' })) }));

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
  const reviewBatch = async () => (await Service.candidatesBatch(context, month, await importedIds(), false)).results.map(result => {
    const candidate = result.candidates[0];
    return { itemId: result.itemId, transaction: candidate.transactions[0], feedbackToken: candidate.feedbackToken! };
  });
  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: 'Bank reconciliation test', code: Number(`8${String(Date.now()).slice(-7)}`) } });
    companyId = company.id;
    const user = await prisma.user.create({ data: { name: 'Reconciler', email: `bank-${Date.now()}@test.invalid`, password: 'not-a-real-password', role: 'ADMIN' } });
    userId = user.id;
  });
  beforeEach(async () => {
    jest.mocked(suggestBankMatchByAi).mockClear();
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

  it('ignores statement evidence without creating financial records or AI feedback, and can complete the month', async () => {
    await importRows([['22/08/2026', '-20.00', 'ignored', 'Movimento fora do controle']]);
    const [itemId] = await importedIds();
    const original = await Service.load(context, month);
    expect(original.summary.ignored).toBe(0);
    const result = await Service.setIgnored(context, month, itemId, true);
    expect(result.item.ignoredAt).toBeInstanceOf(Date); expect(result.item.ignoredBy).toBe(userId);
    expect(result.change?.transactions).toEqual([]);
    const ignored = await Service.load(context, month);
    expect(ignored.summary).toMatchObject({ total: 1, pending: 0, confirmed: 0, ignored: 1, debits: '-20.00' });
    expect((await Service.load(context, month, 1, 'PENDING')).items).toHaveLength(0);
    expect((await Service.load(context, month, 1, 'IGNORED')).items.map(item => item.id)).toEqual([itemId]);
    expect((await Service.scanMissing(context, month)).rows).toEqual([]);
    await expect(Service.candidates(context, month, [itemId])).rejects.toThrow('ignorado');
    await expect(Service.create(context, month, { itemIds: [itemId], description: 'Não criar', categoryId, effectiveDate: '2026-08-22' })).rejects.toThrow('ignorado');
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(0);
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect(await prisma.bankMatchDecision.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    await Service.setIgnored(context, month, itemId, true);
    const audit = await Service.audit(context, month);
    expect(audit.events.filter(event => event.action === 'IGNORE_ITEM')).toHaveLength(1);
    expect(audit.events.find(event => event.action === 'IGNORE_ITEM')).toMatchObject({ userId, details: { itemId } });
    await importRows([['22/08/2026', '-20.00', 'ignored', 'Movimento fora do controle']]);
    expect((await Service.load(context, month)).summary.ignored).toBe(1);
    expect((await Service.status(context, month, 'COMPLETED')).status).toBe('COMPLETED');
    await expect(Service.setIgnored(context, month, itemId, false)).rejects.toThrow('Reabra');
    await Service.status(context, month, 'OPEN');
    await Service.setIgnored(context, month, itemId, false);
    expect((await Service.load(context, month)).summary).toMatchObject({ pending: 1, ignored: 0 });
    expect((await Service.load(context, month)).items[0]).toMatchObject({ ignoredAt: null, ignoredBy: null });
    expect((await Service.scanMissing(context, month)).rows.map(row => row.item.id)).toEqual([itemId]);
    expect((await Service.audit(context, month)).events.filter(event => event.action === 'RESTORE_ITEM')).toHaveLength(1);
    await expect(Service.status(context, month, 'COMPLETED')).rejects.toThrow('Resolva');
  });
  it('removes ignored movements from duplicate evidence and restores that evidence when reconsidered', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-20.00', 'b', 'Outro movimento']]);
    await createExisting('20.00');
    const [first, second] = await importedIds();
    expect((await Service.candidates(context, month, [first], false)).candidates[0].confidence?.level).toBe('MEDIUM_LOW');
    await Service.setIgnored(context, month, second, true);
    expect((await Service.candidates(context, month, [first], false)).candidates[0].confidence?.level).toBe('HIGH');
    await Service.setIgnored(context, month, second, false);
    expect((await Service.candidates(context, month, [first], false)).candidates[0].confidence?.level).toBe('MEDIUM_LOW');
  });
  it('never uses an ignored movement in a grouped match', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-30.00', 'b', 'Mercado']]);
    await createExisting('50.00');
    const [first, second] = await importedIds();
    expect((await Service.candidates(context, month, [first], false)).candidates.some(candidate => candidate.itemIds.includes(second))).toBe(true);
    await Service.setIgnored(context, month, second, true);
    const result = await Service.candidates(context, month, [first], false);
    expect(result.candidates.every(candidate => !candidate.itemIds.includes(second))).toBe(true);
    expect(result.assessment).toBe('POSSIBLE_MISSING');
  });
  it('blocks ignored items in stale single and batch confirmations and keeps existing transactions unchanged', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const transaction = await createExisting('20.00');
    const [itemId] = await importedIds(), batch = await reviewBatch();
    await Service.setIgnored(context, month, itemId, true);
    await expect(confirm([itemId], [transaction.id])).rejects.toThrow('ignorado');
    await expect(Service.confirmBatch(context, month, batch)).rejects.toThrow('indisponível');
    expect((await Service.load(context, month)).summary).toMatchObject({ pending: 0, ignored: 1, unmatchedTransactions: 1 });
    await expect(Service.status(context, month, 'COMPLETED')).rejects.toThrow('Resolva');
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe('1000.00');
    expect((await prisma.financialTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).updatedAt).toEqual(transaction.updatedAt);
    await Service.setIgnored(context, month, itemId, false); await confirm([itemId], [transaction.id]);
    await expect(Service.setIgnored(context, month, itemId, true)).rejects.toThrow('Desfaça');
  });
  it('scopes ignore and restore to the authorized account and month, and reset clears ignored decisions', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const [itemId] = await importedIds();
    await expect(Service.setIgnored({ ...context, accountId: otherAccountId }, month, itemId, true)).rejects.toThrow('não encontrado');
    await expect(Service.setIgnored(context, '2026-09', itemId, true)).rejects.toThrow('não encontrado');
    await expect(Service.setIgnored({ ...context, companyId: companyId + 1 }, month, itemId, true)).rejects.toThrow('Acesso negado');
    await Service.setIgnored(context, month, itemId, true); await Service.reset(context, month);
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    expect((await Service.load(context, month)).summary).toMatchObject({ ignored: 0, pending: 1 });
  });
  it('confirms a reviewed batch across confidence levels, preserving separate feedback and unrelated AI cache', async () => {
    await importRows([['22/08/2026', '-20.00', 'high', 'Padaria'], ['22/08/2026', '30.00', 'medium', 'PIX recebido'], ['22/08/2026', '-70.00', 'lower', 'Mercado'], ['22/08/2026', '-150.00', 'low', 'Outro estabelecimento']]);
    await createExisting('20.00');
    await createExisting('30.00', { type: 'INCOME', fromAccountId: null, toAccountId: accountId, description: 'Reembolso', categoryId: null });
    await createExisting('70.00', { description: 'Mercado', effectiveDate: new Date('2026-08-23') });
    await createExisting('150.00', { description: 'Despesa doméstica', effectiveDate: new Date('2026-08-29') });
    const batch = await reviewBatch();
    await prisma.bankMatchCache.create({ data: { accountId, key: `unrelated-${accountId}`, result: {}, expiresAt: new Date('2200-01-01') } });
    const balance = (await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2);
    const result = await Service.confirmBatch(context, month, batch);
    expect(result.confirmed).toBe(4); expect(result.change.items).toHaveLength(4); expect(result.change.groups).toHaveLength(4);
    const groups = await prisma.bankReconciliationGroup.findMany({ where: { reconciliation: { accountId } }, orderBy: { id: 'asc' }, include: { items: true, transactions: true } });
    expect(groups.map(group => (group.suggestion as any).confidence.level)).toEqual(['HIGH', 'MEDIUM_HIGH', 'MEDIUM_LOW', 'LOW']);
    expect(groups.every(group => group.items.length === 1 && group.transactions.length === 1)).toBe(true);
    expect(await prisma.bankMatchCache.count({ where: { accountId } })).toBe(1);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe(balance);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    await expect(Service.confirmBatch(context, month, batch)).rejects.toThrow('indisponível');
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(4);
  });
  it('confirms a full page of fifty separate pairs within one transaction', async () => {
    await importRows(Array.from({ length: 50 }, (_, i) => ['22/08/2026', String(-(1000 + i)), `item-${i}`, `Compra ${i}`]));
    for (let i = 0; i < 50; i++) await createExisting(String(1000 + i), { description: `Compra ${i}` });
    const ids = await importedIds(), batch = [];
    for (let offset = 0; offset < ids.length; offset += 5) {
      const results = (await Service.candidatesBatch(context, month, ids.slice(offset, offset + 5), false)).results;
      batch.push(...results.map(result => ({ itemId: result.itemId, transaction: result.candidates[0].transactions[0], feedbackToken: result.candidates[0].feedbackToken! })));
    }
    const started = Date.now();
    expect((await Service.confirmBatch(context, month, batch)).confirmed).toBe(50);
    console.info(`Bank batch: 50 pairs confirmed in ${Date.now() - started} ms (isolated test database)`);
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(50);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
  }, 60000);
  it('rolls back the entire batch when one reviewed transaction changed', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-30.00', 'b', 'Mercado']]);
    await createExisting('20.00'); const second = await createExisting('30.00', { description: 'Mercado' });
    const batch = await reviewBatch();
    await prisma.financialTransaction.update({ where: { id: second.id }, data: { description: 'Alterado' } });
    await expect(Service.confirmBatch(context, month, batch)).rejects.toThrow('mudou');
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect(await prisma.bankStatementItem.count({ where: { accountId, activeGroupId: { not: null } } })).toBe(0);
  });
  it('revalidates confidence without AI before saving any batch links', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-30.00', 'b', 'Mercado']]);
    await createExisting('20.00'); await createExisting('30.00', { description: 'Mercado' });
    const batch = await reviewBatch();
    await createExisting('30.00', { description: 'Outro lançamento igual' });
    await expect(Service.confirmBatch(context, month, batch)).rejects.toThrow('Nenhum vínculo foi salvo');
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
  });
  it('rejects forged receipts, repeated transactions, foreign accounts and completed months in batches', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-30.00', 'b', 'Mercado']]);
    await createExisting('20.00'); await createExisting('30.00', { description: 'Mercado' });
    const batch = await reviewBatch();
    await expect(Service.confirmBatch(context, month, [{ ...batch[0], feedbackToken: 'forged' }, batch[1]])).rejects.toThrow('expirou');
    await expect(Service.confirmBatch(context, month, [batch[0], { ...batch[1], transaction: batch[0].transaction }])).rejects.toThrow('repetir');
    await expect(Service.confirmBatch({ ...context, accountId: otherAccountId }, month, batch)).rejects.toThrow('indisponível');
    await expect(Service.confirmBatch(context, '2026-09', batch)).rejects.toThrow('indisponível');
    await prisma.bankReconciliation.update({ where: { accountId_month: { accountId, month } }, data: { status: 'COMPLETED' } });
    await expect(Service.confirmBatch(context, month, batch)).rejects.toThrow('Reabra');
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
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
  it('searches selected movements separately, including both directions, without creating links', async () => {
    await importRows([['22/08/2026', '-20.00', 'out', 'Padaria'], ['22/08/2026', '30.00', 'in', 'Reembolso']]);
    const expense = await createExisting('20.00');
    const income = await createExisting('30.00', { type: 'INCOME', fromAccountId: null, toAccountId: accountId, description: 'Reembolso', categoryId: null });
    const ids = await importedIds();
    const result = await Service.candidatesBatch(context, month, ids);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].candidates[0].transactions.map(t => t.id)).toEqual([expense.id]);
    expect(result.results[1].candidates[0].transactions.map(t => t.id)).toEqual([income.id]);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
    await expect(Service.candidates(context, month, ids)).rejects.toThrow('mesma direção');
  });
  it('uses AI only for ambiguous items and retains feedback from rule-based confirmations', async () => {
    await importRows([['22/08/2026', '-20.00', 'strong', 'Padaria'], ['22/08/2026', '-30.00', 'uncertain', 'Mercado']]);
    const strong = await createExisting('20.00');
    await createExisting('30.00', { description: 'Mercado' });
    await createExisting('30.00', { description: 'Mercado' });
    const ids = await importedIds();
    await Service.candidatesBatch(context, month, ids);
    expect(suggestBankMatchByAi).toHaveBeenCalledTimes(1);
    expect(jest.mocked(suggestBankMatchByAi).mock.calls[0][0].items.map(i => i.id)).toEqual([ids[1]]);
    await confirm([ids[0]], [strong.id]);
    expect((await prisma.bankReconciliationGroup.findFirstOrThrow({ where: { reconciliation: { accountId } }, include: { items: true, transactions: true } })).items).toHaveLength(1);
    await expect(Service.candidatesBatch(context, month, ids)).rejects.toThrow('já foi conciliado');
    expect((await Service.candidatesBatch(context, month, [ids[1]])).results).toHaveLength(1);
  });
  it('searches ambiguous rows automatically without invoking AI or persisting search progress', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    await createExisting('20.00'); await createExisting('20.00');
    const ids = await importedIds();
    const result = await Service.candidatesBatch(context, month, ids, false);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    expect(result.results[0].candidates.map(c => c.confidence?.level)).toEqual(['MEDIUM_LOW', 'MEDIUM_LOW']);
    expect(await prisma.bankMatchCache.count({ where: { accountId } })).toBe(0);
    expect(await prisma.bankMatchDecision.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect(await prisma.bankReconciliationGroup.count({ where: { reconciliation: { accountId } } })).toBe(0);
    jest.mocked(suggestBankMatchByAi).mockImplementationOnce(async ({ candidates }) => ({ candidates: [...candidates].reverse().map(c => ({ ...c, source: 'AI', confidence: { level: 'HIGH', reasons: ['AI'] } })), message: 'AI' }));
    const refined = await Service.candidatesBatch(context, month, ids, 'auto');
    expect(suggestBankMatchByAi).toHaveBeenCalledTimes(1);
    expect(refined.results[0].candidates.every(c => c.confidence?.level === 'MEDIUM_LOW')).toBe(true);
  });
  it('skips AI for a unique same-date match with a different description, even when explicitly requested', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'PIX Comércio 123']]);
    await createExisting('20.00', { description: 'Café da manhã' });
    const result = await Service.candidates(context, month, await importedIds(), true);
    expect(result.candidates[0].confidence?.level).toBe('MEDIUM_HIGH');
    expect(result.assessment).toBe('CANDIDATES');
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
  });
  it('recognizes an exact confirmed description mapping but never promotes a different date', async () => {
    await importRows([['05/08/2026', '-20.00', 'history', 'PIX Comércio 123'], ['22/08/2026', '-20.00', 'a', 'PIX Comércio 123']]);
    const old = await createExisting('20.00', { description: 'Café da manhã', effectiveDate: new Date('2026-08-05') });
    const current = await createExisting('20.00', { description: 'Café da manhã' });
    const ids = await importedIds(); await confirm([ids[0]], [old.id]);
    expect((await Service.candidates(context, month, [ids[1]], false)).candidates[0]).toMatchObject({ source: 'HISTORY', confidence: { level: 'HIGH' } });
    await prisma.financialTransaction.update({ where: { id: current.id }, data: { effectiveDate: new Date('2026-08-23') } });
    expect((await Service.candidates(context, month, [ids[1]], false)).candidates[0].confidence?.level).toBe('MEDIUM_LOW');
  });
  it('checks duplicate statement values in adjacent imported months at the three-day boundary', async () => {
    await importRows([['31/08/2026', '-20.00', 'a', 'Padaria'], ['03/09/2026', '-20.00', 'b', 'Outro nome']]);
    await createExisting('20.00', { effectiveDate: new Date('2026-08-31') });
    const ids = await importedIds();
    expect((await Service.candidates(context, month, [ids[0]], false)).candidates[0].confidence?.level).toBe('MEDIUM_LOW');
    await prisma.bankStatementItem.update({ where: { id: ids[1] }, data: { date: new Date('2026-09-04') } });
    expect((await Service.candidates(context, month, [ids[0]], false)).candidates[0].confidence?.level).toBe('HIGH');
  });
  it('retains compatible alternatives beyond the ten displayed suggestions after rejection', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    for (let i = 0; i < 11; i++) await createExisting('20.00', { description: i ? `Descrição ${i}` : 'Padaria' });
    const ids = await importedIds();
    const first = await Service.candidates(context, month, ids, false);
    expect(first.candidates).toHaveLength(10);
    expect(first.candidates[0].confidence?.level).toBe('MEDIUM_LOW');
    for (const candidate of first.candidates) await Service.reject(context, month, { itemIds: ids, transactions: candidate.transactions, feedbackToken: candidate.feedbackToken });
    const remaining = await Service.candidates(context, month, ids, false);
    expect(remaining.assessment).toBe('CANDIDATES');
    expect(remaining.candidates).toHaveLength(1);
    expect(remaining.candidates[0].confidence?.level).toBe('MEDIUM_LOW');
    await Service.reject(context, month, { itemIds: ids, transactions: remaining.candidates[0].transactions, feedbackToken: remaining.candidates[0].feedbackToken });
    expect((await Service.candidates(context, month, ids)).assessment).toBe('POSSIBLE_MISSING');
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
  });
  it('distinguishes incompatible values and incomplete searches from compatible grouped values', async () => {
    await importRows([['22/08/2026', '-30.00', 'a', 'Padaria']]);
    await createExisting('20.00');
    const ids = await importedIds();
    expect((await Service.candidates(context, month, ids)).assessment).toBe('POSSIBLE_MISSING');
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    await createExisting('10.00');
    expect((await Service.candidates(context, month, ids, false)).assessment).toBe('CANDIDATES');
    for (let i = 0; i < 24; i++) await createExisting('1.00');
    expect((await Service.candidates(context, month, ids, false)).assessment).toBe('INCOMPLETE');
  });
  it('persists the displayed evidence only on feedback and rejects tampered or mismatched receipts', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    await createExisting('20.00', { description: 'Meu café' });
    const ids = await importedIds();
    const candidate = (await Service.candidates(context, month, ids, false)).candidates[0];
    const input = { itemIds: ids, transactions: candidate.transactions, feedbackToken: candidate.feedbackToken };
    expect(candidate.feedbackToken).toBeTruthy();
    expect(await prisma.bankMatchDecision.count({ where: { reconciliation: { accountId } } })).toBe(0);
    await expect(Service.reject(context, month, { ...input, feedbackToken: 'forged' })).rejects.toThrow('expirou');
    await expect(Service.confirm({ ...context, role: 'SUPERUSER' }, month, input)).rejects.toThrow();
    await Service.reject(context, month, input);
    expect((await prisma.bankMatchDecision.findUniqueOrThrow({ where: { contextKey: candidate.key } })).feedback).toMatchObject({ ruleVersion: 'bank-match-v2', confidence: { level: 'MEDIUM_HIGH' }, source: 'RULE' });
    const group = await Service.confirm(context, month, input);
    expect(group.suggestion).toMatchObject({ key: candidate.key, confidence: candidate.confidence, source: 'RULE' });
    expect((await prisma.bankMatchDecision.findUniqueOrThrow({ where: { contextKey: candidate.key } })).decision).toBe('ACCEPTED');
    expect(await prisma.bankMatchCache.count({ where: { accountId } })).toBe(0);
  });
  it('scans missing items past the first display page with bounded cursors, without AI or database search records', async () => {
    await importRows(Array.from({ length: 53 }, (_, i) => ['22/08/2026', '-20.00', `id-${i}`, `Movimento ${i}`] as [string, string, string, string]));
    const ids = await importedIds(); const scanned: number[] = []; let cursor: number | null = 0;
    while (cursor !== null) {
      const result = await Service.scanMissing(context, month, cursor);
      expect(result.rows.length).toBeLessThanOrEqual(5);
      expect(result.rows.every(r => r.result.assessment === 'POSSIBLE_MISSING')).toBe(true);
      scanned.push(...result.rows.map(r => r.item.id)); cursor = result.nextCursor;
    }
    expect(scanned).toEqual(ids);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    expect(await prisma.bankMatchDecision.count({ where: { reconciliation: { accountId } } })).toBe(0);
    expect((await Service.scanMissing({ ...context, accountId: otherAccountId }, month)).rows).toEqual([]);
  });
  it('rejects batch items belonging to another account and keeps the batch bounded', async () => {
    await importRows([['22/08/2026', '-20.00', 'a', 'Padaria']]);
    const ids = await importedIds();
    await expect(Service.candidatesBatch({ ...context, accountId: otherAccountId }, month, ids)).rejects.toThrow('não pertence');
    await expect(Service.candidatesBatch(context, month, Array.from({ length: 6 }, (_, i) => i + 1))).rejects.toThrow('1 a 5');
  });
  it('resets only reconciliation evidence and reuses financial transactions after importing again', async () => {
    const rows: Array<[string, string, string, string]> = [['22/08/2026', '-20.00', 'a', 'Padaria'], ['22/08/2026', '-10.00', 'b', 'Tarifa']];
    await importRows(rows);
    const ids = await importedIds();
    const existing = await createExisting('20.00');
    await confirm([ids[0]], [existing.id]);
    await Service.create(context, month, { itemIds: [ids[1]], description: 'Tarifa', effectiveDate: '2026-08-22', categoryId });
    const before = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    const session = (await Service.load(context, month)).session!;
    await prisma.bankMatchDecision.create({ data: { reconciliationId: session.id, contextKey: `reset-${accountId}`, itemIds: ids, transactionIds: [existing.id], decision: 'REJECTED', userId } });
    await prisma.bankMatchCache.create({ data: { accountId, key: `cache-${accountId}`, result: {}, expiresAt: new Date('2200-01-01') } });
    expect(await Service.reset(context, month)).toEqual({ removedItems: 2, removedFiles: 1 });
    expect(await prisma.bankReconciliation.count({ where: { accountId } })).toBe(0);
    expect(await prisma.bankMatchDecision.count({ where: { reconciliationId: session.id } })).toBe(0);
    expect(await prisma.bankReconciliationEvent.count({ where: { reconciliationId: session.id } })).toBe(0);
    expect(await prisma.bankReconciliationTransaction.count({ where: { accountId } })).toBe(0);
    expect(await prisma.bankStatementImport.count({ where: { accountId } })).toBe(0);
    expect(await prisma.bankMatchCache.count({ where: { accountId } })).toBe(0);
    expect(await prisma.financialTransaction.count({ where: { companyId } })).toBe(2);
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).balance.toFixed(2)).toBe(before.balance.toFixed(2));
    expect((await importRows(rows)).created).toBe(2);
    expect((await Service.load(context, month)).summary.unmatchedTransactions).toBe(2);
  });
  it('preserves a shared file and a completed neighboring month when resetting and reimporting', async () => {
    const rows: Array<[string, string, string, string]> = [['22/08/2026', '-20.00', 'aug', 'Padaria'], ['02/09/2026', '-30.00', 'sep', 'Mercado']];
    const imported = await importRows(rows);
    const september = await prisma.bankStatementItem.findFirstOrThrow({ where: { accountId, date: new Date('2026-09-02') } });
    const existing = await createExisting('30.00', { date: new Date('2026-09-02'), effectiveDate: new Date('2026-09-02') });
    await Service.confirm(context, '2026-09', { itemIds: [september.id], transactions: [{ id: existing.id, version: existing.updatedAt.toISOString() }] });
    await Service.status(context, '2026-09', 'COMPLETED');
    expect(await Service.reset(context, month)).toEqual({ removedItems: 1, removedFiles: 0 });
    expect((await Service.load(context, month)).imports).toHaveLength(0);
    expect((await Service.load(context, '2026-09')).summary.confirmed).toBe(1);
    const repeated = await importRows(rows);
    expect(repeated.importId).toBe(imported.importId); expect(repeated.created).toBe(1);
    expect(await prisma.bankStatementImport.count({ where: { accountId } })).toBe(1);
    expect((await Service.load(context, '2026-09')).session?.status).toBe('COMPLETED');
    await expect(Service.reset(context, '2026-09')).rejects.toThrow('concluída');
    expect((await Service.load(context, '2026-09')).summary.confirmed).toBe(1);
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
    const restricted = await Service.candidates(limited, month, await importedIds());
    expect(restricted.candidates).toHaveLength(0);
    expect(restricted.assessment).toBe('INCOMPLETE');
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
    const ids = await importedIds();
    expect((await request(app).post(`${path}/suggestions/batch`).send({ itemIds: ids })).body.results[0].itemId).toBe(ids[0]);
    expect((await request(app).post(`${path}/items/${ids[0]}/ignored`).send({ ignored: 'true' })).status).toBe(400);
    expect((await request(app).post(`${path}/items/${ids[0]}/ignored`).send({ ignored: true, accountId: otherAccountId })).body.item.ignoredBy).toBe(userId);
    expect((await request(app).get(`${path}?filter=IGNORED`)).body.items.map((item: any) => item.id)).toEqual(ids);
    expect((await request(app).get(`${path}?filter=PENDING`)).body.items).toEqual([]);
    expect((await request(app).post(`${path}/items/${ids[0]}/ignored`).send({ ignored: false })).body.item.ignoredAt).toBeNull();
    await createExisting('20.00'); await createExisting('20.00');
    const rulesOnly = await request(app).post(`${path}/suggestions/batch`).send({ itemIds: ids, useAi: false, accountId: otherAccountId });
    expect(rulesOnly.status).toBe(200);
    expect(rulesOnly.body.results[0].candidates[0].confidence.level).toBe('MEDIUM_LOW');
    const scan = await request(app).get(`${path}/missing?accountId=${otherAccountId}`);
    expect(scan.status).toBe(200);
    expect(scan.body.rows.map((r: any) => r.item.id)).toEqual(ids);
    expect((await request(app).get(`${path}/missing?afterId=-1`)).status).toBe(400);
    expect((await request(app).get(`${path}/scan`)).body.rows.map((row: any) => row.item.id)).toEqual(ids);
    expect((await request(app).get(`${path}/scan?afterId=-1`)).status).toBe(400);
    expect(suggestBankMatchByAi).not.toHaveBeenCalled();
    expect((await request(app).post(`${path}/suggestions/batch`).send({ itemIds: ids, useAi: 'false' })).status).toBe(400);
    expect((await request(app).post(`${path}/suggestions/batch`).send({ itemIds: [...ids, ...ids] })).status).toBe(400);
    expect((await request(app).post(`${path}/reset`).send({ confirmed: false })).status).toBe(400);
    expect((await Service.load(context, month)).summary.total).toBe(1);
    expect(await prisma.bankStatementItem.count({ where: { accountId: otherAccountId } })).toBe(0);
    expect((await request(app).post(`${path}/confirm`).send({ itemIds: [], transactions: [] })).status).toBe(400);
    const candidate = rulesOnly.body.results[0].candidates[0];
    const match = { itemId: ids[0], transaction: candidate.transactions[0], feedbackToken: candidate.feedbackToken };
    expect((await request(app).post(`${path}/confirm/batch`).send({ matches: [] })).status).toBe(400);
    expect((await request(app).post(`${path}/confirm/batch`).send({ matches: Array.from({ length: 51 }, () => match) })).status).toBe(400);
    expect((await request(app).post(`${path}/confirm/batch`).send({ matches: [match], accountId: otherAccountId })).body.confirmed).toBe(1);
    expect((await request(app).get(`/financial/accounts/${accountId}/reconciliation/2026-13`)).status).toBe(400);
  });
});
