import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { formatFinancialDateKey, parseFinancialDateKey } from '../utils/financial-calendar';
import { buildFinancialRecognitionWhere, buildOperationalTransactionWhere } from '../utils/financial-transaction-query';
import type { FinancialHistoryAccess } from './financial-history.service';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { parseFinancialDateKey(value); return true; } catch { return false; }
}, 'Data financeira inválida.');
export const realizedExpensesArgs = z.object({
  startDate: dateKey,
  endDate: dateKey,
  category: z.string().trim().min(1).max(160).nullable().optional(),
  fixedExpenses: z.enum(['ALL', 'ONLY_FIXED', 'EXCLUDE_FIXED']).default('ALL'),
  groupByCategory: z.boolean().default(false),
  mode: z.enum(['SUMMARY', 'LIST']).default('SUMMARY'),
  page: z.number().int().min(1).max(10000).default(1),
  limit: z.number().int().min(1).max(20).default(10)
}).strict().refine(args => args.startDate <= args.endDate, 'Período invertido.');

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
type Totals = { gross: Prisma.Decimal; credits: Prisma.Decimal; count: number };
const empty = (): Totals => ({ gross: new Prisma.Decimal(0), credits: new Prisma.Decimal(0), count: 0 });
function merge(target: Totals, value: Totals) {
  target.gross = target.gross.plus(value.gross); target.credits = target.credits.plus(value.credits); target.count += value.count;
}
function serialize(value: Totals, months: number) {
  const net = value.gross.minus(value.credits);
  return { grossExpenses: value.gross.toFixed(2), cardCredits: value.credits.toFixed(2),
    netExpenses: net.toFixed(2), monthlyAverage: net.div(months).toFixed(2), transactionCount: value.count };
}

const cardWhere: Prisma.FinancialTransactionWhereInput = { OR: [
  { creditCardInvoiceId: { not: null } },
  { fromAccount: { is: { type: 'CREDIT_CARD' } } },
  { toAccount: { is: { type: 'CREDIT_CARD' } } }
] };
// Refunds inherit the purchase's origin, as in FinancialHistoryService.
const fixedWhere: Prisma.FinancialTransactionWhereInput = { OR: [
  { recurringTransactionId: { not: null } },
  { refundOfTransaction: { is: { recurringTransactionId: { not: null } } } }
] };

/** Historical consumption, never a forecast or an invoice cash-flow report. */
export default class RealizedExpensesService {
  static async query(raw: Record<string, unknown>, access: FinancialHistoryAccess) {
    const args = realizedExpensesArgs.parse(raw);
    const start = parseFinancialDateKey(args.startDate); start.setUTCHours(0, 0, 0, 0);
    const end = parseFinancialDateKey(args.endDate); end.setUTCHours(23, 59, 59, 999);
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
    if (months > 60) throw new Error('Consulte até 60 meses por vez.');
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const partialMonths = [...new Set([
      ...(start.getUTCDate() !== 1 ? [args.startDate.slice(0, 7)] : []),
      ...(end.getUTCDate() !== lastDay ? [args.endDate.slice(0, 7)] : [])
    ])];

    // Summary and page share a snapshot: new transactions cannot change one but not the other.
    return prisma.$transaction(async tx => {
      const categories = await tx.financialCategory.findMany({
        where: { companyId: access.companyId }, select: { id: true, name: true, parentId: true }
      });
      const byId = new Map(categories.map(category => [category.id, category]));
      const path = (id: number): string => {
        const names: string[] = []; const visited = new Set<number>(); let current = byId.get(id);
        while (current && !visited.has(current.id)) {
          visited.add(current.id); names.unshift(current.name);
          current = current.parentId === null ? undefined : byId.get(current.parentId);
        }
        return names.join(' / ');
      };
      let categoryIds: number[] | undefined;
      let selectedCategory: { id: number; name: string; includesSubcategories: boolean } | null = null;
      if (args.category) {
        const query = normalize(args.category);
        const exact = categories.filter(category => normalize(category.name) === query || normalize(path(category.id)) === query);
        const matches = exact.length ? exact : categories.filter(category => normalize(path(category.id)).includes(query));
        if (matches.length !== 1) return { ok: false as const, code: matches.length ? 'AMBIGUOUS_CATEGORY' : 'CATEGORY_NOT_FOUND',
          message: matches.length ? 'Escolha uma das categorias encontradas.' : 'Categoria não encontrada. Peça o nome da categoria; não remova o filtro.',
          matches: matches.slice(0, 20).map(category => ({ id: category.id, name: path(category.id) })),
          matchesTruncated: matches.length > 20 };
        const ids = new Set([matches[0].id]);
        for (let changed = true; changed;) {
          changed = false;
          for (const category of categories) if (category.parentId !== null && ids.has(category.parentId) && !ids.has(category.id)) {
            ids.add(category.id); changed = true;
          }
        }
        categoryIds = [...ids]; selectedCategory = { id: matches[0].id, name: path(matches[0].id), includesSubcategories: ids.size > 1 };
      }
      const where: Prisma.FinancialTransactionWhereInput = { AND: [
        { companyId: access.companyId, date: { gte: start, lte: end } },
        buildOperationalTransactionWhere(), buildFinancialRecognitionWhere('ECONOMIC'),
        { OR: [{ type: 'EXPENSE' }, { type: 'INCOME', creditCardCreditKind: { not: null } }] },
        // Legacy and current invoice settlements can be EXPENSE rows. Never count them again.
        { paidInvoice: { is: null }, creditCardInvoicePayment: { is: null }, isExternalCreditCardSettlement: false },
        ...(access.accessFilter ? [access.accessFilter] : []),
        ...(access.accessibleAccountIds !== undefined ? [{ OR: [
          { fromAccountId: { in: access.accessibleAccountIds } }, { toAccountId: { in: access.accessibleAccountIds } }
        ] }] : []),
        ...(categoryIds ? [{ categoryId: { in: categoryIds } }] : []),
        ...(args.fixedExpenses === 'ALL' ? [] : [args.fixedExpenses === 'ONLY_FIXED' ? fixedWhere : { NOT: fixedWhere }])
      ] };
      const channels = { outsideCreditCard: empty(), creditCard: empty() };
      const categoryTotals = new Map<number | null, typeof channels>();
      for (const channel of ['outsideCreditCard', 'creditCard'] as const) {
        const groups = await tx.financialTransaction.groupBy({
          by: ['categoryId', 'creditCardCreditKind'],
          where: { AND: [where, channel === 'creditCard' ? cardWhere : { NOT: cardWhere }] },
          _sum: { amount: true }, _count: { _all: true }
        });
        for (const group of groups) {
          const value = empty(); value.count = group._count._all;
          value[group.creditCardCreditKind ? 'credits' : 'gross'] = group._sum.amount ?? new Prisma.Decimal(0);
          merge(channels[channel], value);
          const category = categoryTotals.get(group.categoryId) ?? { outsideCreditCard: empty(), creditCard: empty() };
          merge(category[channel], value); categoryTotals.set(group.categoryId, category);
        }
      }
      const pack = (values: typeof channels) => {
        const total = empty(); merge(total, values.outsideCreditCard); merge(total, values.creditCard);
        return { outsideCreditCard: serialize(values.outsideCreditCard, months), creditCard: serialize(values.creditCard, months), total: serialize(total, months) };
      };
      const summary = pack(channels);
      const items = args.mode === 'LIST' ? await tx.financialTransaction.findMany({
        where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (args.page - 1) * args.limit, take: args.limit,
        select: { id: true, description: true, amount: true, date: true, effectiveDate: true, categoryId: true,
          creditCardInvoiceId: true, creditCardCreditKind: true, installmentNumber: true, totalInstallments: true,
          recurringTransactionId: true, refundOfTransaction: { select: { recurringTransactionId: true } },
          fromAccount: { select: { name: true, type: true } }, toAccount: { select: { name: true, type: true } } }
      }) : [];
      const grouped = args.groupByCategory ? [...categoryTotals].map(([id, value]) => ({
        categoryId: id, category: id === null ? 'Sem categoria' : path(id), ...pack(value)
      })).sort((a, b) => new Prisma.Decimal(b.total.netExpenses).comparedTo(a.total.netExpenses)) : [];
      return {
        ok: true as const, startDate: args.startDate, endDate: args.endDate, category: selectedCategory, fixedExpenses: args.fixedExpenses,
        basis: 'Gastos realizados por data da compra/competência. Inclui compras no cartão com fatura aberta e parcelas registradas na data da compra. Exclui pendências, transferências, ajustes de saldo, ignorados e pagamentos de fatura. Créditos de cartão são apresentados separadamente e abatidos no total líquido.',
        average: { unit: 'MONTH', monthCount: months, partialMonths,
          method: 'Total líquido do período dividido pelos meses de calendário abrangidos, incluindo meses sem gastos. Meses parciais usam apenas os dias consultados, sem projeção.' },
        summary,
        categories: grouped.slice(0, 20), categoriesTruncated: grouped.length > 20,
        items: items.map(item => ({ id: item.id, description: item.description, amount: item.amount.toFixed(2),
          date: formatFinancialDateKey(item.date), effectiveDate: item.effectiveDate ? formatFinancialDateKey(item.effectiveDate) : null,
          category: item.categoryId === null ? 'Sem categoria' : path(item.categoryId),
          channel: item.creditCardInvoiceId !== null || item.fromAccount?.type === 'CREDIT_CARD' || item.toAccount?.type === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'OUTSIDE_CREDIT_CARD',
          account: item.fromAccount?.name ?? item.toAccount?.name ?? null, creditKind: item.creditCardCreditKind,
          installmentNumber: item.installmentNumber, totalInstallments: item.totalInstallments,
          isFixed: item.recurringTransactionId !== null || item.refundOfTransaction?.recurringTransactionId != null,
          fixedTemplateId: item.recurringTransactionId ?? item.refundOfTransaction?.recurringTransactionId ?? null })),
        pagination: { page: args.mode === 'LIST' ? args.page : null, limit: args.limit, totalItems: summary.total.transactionCount,
          totalPages: Math.ceil(summary.total.transactionCount / args.limit),
          hasMore: args.mode === 'LIST' && args.page * args.limit < summary.total.transactionCount },
        totalsCoverFullPeriod: true
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
}
