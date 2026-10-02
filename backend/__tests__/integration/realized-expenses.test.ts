import { PrismaClient } from '@prisma/client';
import Report from '../../src/services/realized-expenses.service';
import ToolExecutor from '../../src/services/tool-executor.service';
import AccountAccess from '../../src/services/user-financial-account-access.service';

const db = new PrismaClient();
jest.setTimeout(30000);
describe('realized expense report on PostgreSQL', () => {
  let companyId: number; let otherCompanyId: number; let userId: number;
  let checking: number; let card: number; let privateAccount: number;
  let food: number; let market: number;
  let fixedTemplateId: number;
  const args = { startDate: '2026-10-02', endDate: '2026-10-02', groupByCategory: true, mode: 'LIST', page: 1, limit: 2 };
  const report = (changes: Record<string, unknown> = {}, accountIds?: number[]) => Report.query({ ...args, ...changes }, {
    companyId, accessibleAccountIds: accountIds ?? [checking, card]
  });
  beforeAll(async () => {
    const suffix = Date.now();
    companyId = (await db.company.create({ data: { name: 'Expense report test', code: Number(`6${String(suffix).slice(-7)}`) } })).id;
    otherCompanyId = (await db.company.create({ data: { name: 'Other report test', code: Number(`5${String(suffix).slice(-7)}`) } })).id;
    userId = (await db.user.create({ data: { name: 'Reader', email: `expenses-${suffix}@test.invalid`, password: 'test-only', role: 'USER' } })).id;
    await db.userCompany.create({ data: { userId, companyId, role: 'USER' } });
    checking = (await db.financialAccount.create({ data: { companyId, name: 'Conta', type: 'CHECKING' } })).id;
    card = (await db.financialAccount.create({ data: { companyId, name: 'Cartão', type: 'CREDIT_CARD' } })).id;
    privateAccount = (await db.financialAccount.create({ data: { companyId, name: 'Privada', type: 'CHECKING' } })).id;
    const budget = (await db.financialAccount.create({ data: { companyId, name: 'Orçamento', type: 'CHECKING', purpose: 'BUDGET' } })).id;
    const otherAccount = (await db.financialAccount.create({ data: { companyId: otherCompanyId, name: 'Outra empresa', type: 'CHECKING' } })).id;
    food = (await db.financialCategory.create({ data: { companyId, name: 'Alimentação' } })).id;
    market = (await db.financialCategory.create({ data: { companyId, name: 'Mercado', parentId: food } })).id;
    const otherParent = (await db.financialCategory.create({ data: { companyId, name: 'Outro grupo' } })).id;
    await db.financialCategory.create({ data: { companyId, name: 'Mercado', parentId: otherParent } });
    const base = { companyId, createdBy: userId, type: 'EXPENSE' as const, status: 'COMPLETED' as const,
      date: new Date('2026-10-02T12:00:00Z'), fromAccountId: checking, categoryId: market, amount: 200, description: 'Excluded' };
    const invoice = await db.creditCardInvoice.create({ data: { accountId: card, referenceYear: 2026, referenceMonth: 10,
      closingDate: new Date('2026-10-10'), dueDate: new Date('2026-10-17'), status: 'OPEN' } });
    fixedTemplateId = (await db.recurringTransaction.create({ data: {
      companyId, createdBy: userId, description: 'Modelo fixo inativo', amount: 10.1, type: 'EXPENSE',
      frequency: 'MONTHLY', startDate: base.date, nextDueDate: base.date, isActive: false
    } })).id;
    await db.financialTransaction.createMany({ data: [
      { ...base, description: 'Início do dia', amount: 10.1, date: new Date('2026-10-02T00:00:00Z'), categoryId: food, recurringTransactionId: fixedTemplateId },
      { ...base, description: 'Fim do dia', amount: 20.2, date: new Date('2026-10-02T23:59:59.999Z'), installmentNumber: 1, totalInstallments: 2 },
      { ...base, description: 'Compra 1/2', amount: 35.15, fromAccountId: card, creditCardInvoiceId: invoice.id, installmentNumber: 1, totalInstallments: 2, purchaseGroupId: 'report-purchase', recurringTransactionId: fixedTemplateId },
      { ...base, description: 'Compra 2/2', amount: 35.15, fromAccountId: card, creditCardInvoiceId: invoice.id, installmentNumber: 2, totalInstallments: 2, purchaseGroupId: 'report-purchase', scheduledDate: new Date('2026-11-02'), recurringTransactionId: fixedTemplateId },
      { ...base, description: 'Sem categoria', amount: 4.5, categoryId: null },
      { ...base, description: 'Mês anterior', amount: 9, date: new Date('2026-09-30T12:00:00Z'), recurringTransactionId: fixedTemplateId },
      { ...base, description: 'Depois do período', date: new Date('2026-10-03T00:00:00Z'), amount: 0 },
      { ...base, status: 'PENDING', recurringTransactionId: fixedTemplateId }, { ...base, status: 'CANCELED' },
      { ...base, archivedAt: new Date() }, { ...base, entryKind: 'BALANCE_ADJUSTMENT' },
      { ...base, fromAccountId: budget }, { ...base, isExternalCreditCardSettlement: true },
      { ...base, type: 'TRANSFER', toAccountId: card }, { ...base, type: 'INCOME', fromAccountId: null, toAccountId: checking },
      { ...base, fromAccountId: privateAccount, amount: 900, recurringTransactionId: fixedTemplateId }, { ...base, fromAccountId: null, amount: 4000 },
      { ...base, companyId: otherCompanyId, fromAccountId: otherAccount, categoryId: null, amount: 5000 }
    ] });
    const purchase = await db.financialTransaction.findFirstOrThrow({ where: { companyId, description: 'Compra 1/2' } });
    await db.financialTransaction.create({ data: { ...base, description: 'Estorno cartão', amount: 5.1, type: 'INCOME',
      fromAccountId: null, toAccountId: card, creditCardInvoiceId: invoice.id, creditCardCreditKind: 'REFUND', refundOfTransactionId: purchase.id } });
    const payment = await db.financialTransaction.create({ data: { ...base, description: 'Pagamento fatura', amount: 80 } });
    await db.creditCardInvoicePayment.create({ data: { invoiceId: invoice.id, transactionId: payment.id, amount: 80, paymentDate: base.date } });
    const legacy = await db.financialTransaction.create({ data: { ...base, description: 'Pagamento antigo', amount: 90 } });
    await db.creditCardInvoice.create({ data: { accountId: card, referenceYear: 2026, referenceMonth: 9,
      closingDate: new Date('2026-09-10'), dueDate: new Date('2026-09-17'), status: 'PAID', paymentTransactionId: legacy.id } });
  });

  afterAll(async () => {
    // Only this suite's fixtures; no production connection is allowed by the runner.
    if (companyId) {
      await db.creditCardInvoicePayment.deleteMany({ where: { invoice: { account: { companyId } } } });
      await db.creditCardInvoice.updateMany({ where: { account: { companyId } }, data: { paymentTransactionId: null } });
      await db.financialTransaction.deleteMany({ where: { companyId, creditCardCreditKind: { not: null } } });
      await db.financialTransaction.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
      await db.userFinancialAccountAccess.deleteMany({ where: { companyId } });
      await db.userCompany.deleteMany({ where: { companyId } });
      await db.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('counts realized purchases once, splits channels and nets card credits even with an OPEN invoice', async () => {
    const result = await report(); if (!result.ok) throw new Error('Report failed');
    expect(result.summary.outsideCreditCard.netExpenses).toBe('34.80');
    expect(result.summary.creditCard.grossExpenses).toBe('70.30');
    expect(result.summary.creditCard.cardCredits).toBe('5.10');
    expect(result.summary.creditCard.netExpenses).toBe('65.20');
    expect(result.summary.total.netExpenses).toBe('100.00');
    expect(result.summary.total.transactionCount).toBe(6);
    expect(result.items).toHaveLength(2);
    expect(result.pagination.hasMore).toBe(true);
    const next = await report({ page: 2 }); if (!next.ok) throw new Error('Report failed');
    expect(next.summary).toEqual(result.summary);
    expect(next.items.every(item => !result.items.some(previous => previous.id === item.id))).toBe(true);
    expect(result.categories.find(row => row.category === 'Sem categoria')?.total.netExpenses).toBe('4.50');
  });

  it('includes zero-spend months and discloses partial months instead of projecting', async () => {
    const result = await report({ startDate: '2026-09-01', endDate: '2026-11-30', mode: 'SUMMARY' });
    if (!result.ok) throw new Error('Report failed');
    expect(result.summary.total.netExpenses).toBe('109.00');
    expect(result.summary.total.monthlyAverage).toBe('36.33');
    expect(result.average.monthCount).toBe(3); expect(result.average.partialMonths).toEqual([]);
    expect(result.items).toEqual([]);
    const partial = await report(); if (!partial.ok) throw new Error('Report failed');
    expect(partial.average.partialMonths).toEqual(['2026-10']);
    const empty = await report({ startDate: '2026-11-01', endDate: '2026-11-30' });
    if (!empty.ok) throw new Error('Report failed');
    expect(empty.summary.total.monthlyAverage).toBe('0.00');
  });

  it('filters by recorded fixed origin after settlement, including refunds and inactive templates', async () => {
    const all = await report({ limit: 20 });
    const fixed = await report({ fixedExpenses: 'ONLY_FIXED', limit: 20 });
    const nonFixed = await report({ fixedExpenses: 'EXCLUDE_FIXED', limit: 20 });
    if (!all.ok || !fixed.ok || !nonFixed.ok) throw new Error('Report failed');
    expect(all.fixedExpenses).toBe('ALL');
    expect(fixed.fixedExpenses).toBe('ONLY_FIXED');
    expect(nonFixed.fixedExpenses).toBe('EXCLUDE_FIXED');
    expect(fixed.summary.outsideCreditCard.netExpenses).toBe('10.10');
    expect(fixed.summary.creditCard.grossExpenses).toBe('70.30');
    expect(fixed.summary.creditCard.cardCredits).toBe('5.10');
    expect(fixed.summary.total.netExpenses).toBe('75.30');
    expect(nonFixed.summary.total.netExpenses).toBe('24.70');
    expect(fixed.items).toHaveLength(4); expect(nonFixed.items).toHaveLength(2);
    expect(fixed.items.every(item => item.isFixed && item.fixedTemplateId === fixedTemplateId)).toBe(true);
    expect(fixed.items.find(item => item.creditKind === 'REFUND')?.isFixed).toBe(true);
    expect(nonFixed.items.every(item => !item.isFixed && item.fixedTemplateId === null)).toBe(true);
    expect(nonFixed.items.find(item => item.totalInstallments === 2)).toBeDefined();
    expect(all.items.filter(item => item.isFixed).map(item => item.id)).toEqual(fixed.items.map(item => item.id));
    expect(all.items.filter(item => !item.isFixed).map(item => item.id)).toEqual(nonFixed.items.map(item => item.id));
  });

  it('applies fixed filters before category totals, monthly averages and pagination', async () => {
    const first = await report({ fixedExpenses: 'ONLY_FIXED', category: 'alimentacao' });
    const next = await report({ fixedExpenses: 'ONLY_FIXED', category: 'alimentacao', page: 2 });
    if (!first.ok || !next.ok) throw new Error('Report failed');
    expect(first.pagination).toMatchObject({ totalItems: 4, totalPages: 2, hasMore: true });
    expect(next.pagination.hasMore).toBe(false);
    expect(next.summary).toEqual(first.summary);
    expect(next.items.every(item => item.isFixed && !first.items.some(previous => previous.id === item.id))).toBe(true);
    expect(first.categories.map(row => row.total.netExpenses).sort()).toEqual(['10.10', '65.20']);
    const period = { startDate: '2026-09-01', endDate: '2026-11-30', mode: 'SUMMARY' };
    const fixed = await report({ ...period, fixedExpenses: 'ONLY_FIXED' });
    const nonFixed = await report({ ...period, fixedExpenses: 'EXCLUDE_FIXED', category: 'alimentacao' });
    if (!fixed.ok || !nonFixed.ok) throw new Error('Report failed');
    expect(fixed.average.monthCount).toBe(3);
    expect(fixed.summary.total).toMatchObject({ netExpenses: '84.30', monthlyAverage: '28.10' });
    expect(nonFixed.summary.total).toMatchObject({ netExpenses: '20.20', monthlyAverage: '6.73' });
    const empty = await report({ fixedExpenses: 'ONLY_FIXED', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(empty).toMatchObject({ summary: { total: { monthlyAverage: '0.00' } }, items: [] });
  });

  it('filters an entire category tree, handles accents and requires disambiguation', async () => {
    const result = await report({ category: 'alimentacao', limit: 20 }); if (!result.ok) throw new Error('Report failed');
    expect(result.category?.includesSubcategories).toBe(true);
    expect(result.summary.total.netExpenses).toBe('95.50');
    expect(result.items.some(item => item.category === 'Sem categoria')).toBe(false);
    expect(await report({ category: 'Mercado' })).toMatchObject({ ok: false, code: 'AMBIGUOUS_CATEGORY' });
    expect(await report({ category: 'inexistente' })).toMatchObject({ ok: false, code: 'CATEGORY_NOT_FOUND' });
    const leaf = await report({ category: 'Alimentação / Mercado' }); if (!leaf.ok) throw new Error('Report failed');
    expect(leaf.summary.total.netExpenses).toBe('85.40');
  });

  it('applies account grants to totals and details and denies empty or foreign grants', async () => {
    for (const allowed of [[], [-1]]) {
      const result = await report({}, allowed); if (!result.ok) throw new Error('Report failed');
      expect(result.summary.total.netExpenses).toBe('0.00'); expect(result.items).toEqual([]);
    }
    const onlyCard = await report({}, [card]); if (!onlyCard.ok) throw new Error('Report failed');
    expect(onlyCard.summary.total.netExpenses).toBe('65.20');
    const context = { companyId, userId, role: 'USER' as const, sessionId: 0, turnId: 0, mode: 'OPERATOR' as const };
    expect((await ToolExecutor.executeTool('get_realized_expenses', args, context)).data).toMatchObject({ summary: { total: { netExpenses: '0.00' } } });
    await AccountAccess.grantAccess({ companyId, userId, accountIds: [checking], grantedBy: userId });
    expect((await ToolExecutor.executeTool('get_realized_expenses', args, context)).data).toMatchObject({ summary: { total: { netExpenses: '34.80' } } });
    expect((await ToolExecutor.executeTool('get_realized_expenses', { ...args, fixedExpenses: 'ONLY_FIXED' }, context)).data)
      .toMatchObject({ summary: { total: { netExpenses: '10.10' } } });
    expect((await ToolExecutor.executeTool('get_realized_expenses', { ...args, fixedExpenses: 'EXCLUDE_FIXED' }, context)).data)
      .toMatchObject({ summary: { total: { netExpenses: '24.70' } } });
    await AccountAccess.revokeAccess({ companyId, userId, accountIds: [checking] });
    expect((await ToolExecutor.executeTool('get_realized_expenses', args, context)).data).toMatchObject({ summary: { total: { netExpenses: '0.00' } } });
    const admin = await ToolExecutor.executeTool('get_realized_expenses', args, { ...context, role: 'ADMIN' });
    expect(admin.data).toMatchObject({ summary: { total: { netExpenses: '5000.00' } } });
  });

  it.each([
    { startDate: '2026-02-30' }, { startDate: '2026-11-01' }, { startDate: '2020-01-01' },
    { page: 0 }, { limit: 21 }, { companyId: 123 }, { category: '' }, { fixedExpenses: 'INVALID' }, { fixedExpenses: null }
  ])('rejects invalid or injected inputs: %j', async changes => {
    await expect(report(changes)).rejects.toThrow();
  });
});
