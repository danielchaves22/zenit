import { BankStatementItem, FinancialTransaction, Prisma, PrismaClient } from '@prisma/client';
import UserFinancialAccountAccessService from './user-financial-account-access.service';
import FinancialTransactionService from './financial-transaction.service';
import { BankStatement, calendarDate, hash, normalizeDescription, parseBankStatement } from './bank-statement-parser';
import { BANK_MATCH_RULE_VERSION, BankCandidate, assessBankCandidates, candidateFor, cents, classifyBankCandidates, day, idsKey, money, rankBankCandidates, shouldUseBankAi, signedTransactionAmount, similarity, sumCents, transactionDay } from './bank-reconciliation-matching';
import { readBankFeedback, signBankFeedback } from './bank-reconciliation-feedback';
import { suggestBankMatchByAi } from './bank-reconciliation-ai.service';
import { buildOperationalTransactionWhere } from '../utils/financial-transaction-query';

const prisma = new PrismaClient();
type Db = Prisma.TransactionClient;
export interface BankContext { accountId: number; companyId: number; userId: number; role: string }
export interface BankLinkInput {
  itemIds: number[];
  transactions: Array<{ id: number; version: string }>;
  settlePending?: boolean;
  settlementDate?: string;
  note?: string;
  cacheId?: number;
  candidateKey?: string;
  feedbackToken?: string;
}
export interface BankBulkLinkInput { itemId: number; transaction: { id: number; version: string }; feedbackToken: string }
const transactionSelect = {
  id: true, description: true, amount: true, date: true, dueDate: true, effectiveDate: true,
  type: true, status: true, fromAccountId: true, toAccountId: true, updatedAt: true
} satisfies Prisma.FinancialTransactionSelect;
const importSelect = { id: true, fileName: true, bank: true, format: true, bankAccount: true, metadata: true, createdAt: true } satisfies Prisma.BankStatementImportSelect;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function monthRange(month: string) {
  if (!/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}
const expandRange = (dates: Date[], days: number) => ({
  gte: new Date(Math.min(...dates.map(d => d.getTime())) - days * 86400000),
  lt: new Date(Math.max(...dates.map(d => d.getTime())) + (days + 1) * 86400000)
});
export const financialDateWhere = (range: { gte: Date; lt: Date }): Prisma.FinancialTransactionWhereInput => ({ OR: [
  { status: 'COMPLETED', effectiveDate: range },
  { status: 'COMPLETED', effectiveDate: null, date: range },
  { status: 'PENDING', dueDate: range },
  { status: 'PENDING', dueDate: null, date: range }
] });

async function access(context: BankContext) {
  const [account, accountIds] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: context.accountId, companyId: context.companyId }, include: { bank: true } }),
    UserFinancialAccountAccessService.getUserAccessibleAccounts(context.userId, context.role, context.companyId)
  ]);
  if (!account || !accountIds.includes(account.id)) throw new Error('Acesso negado à conta financeira.');
  if (!['CHECKING', 'SAVINGS'].includes(account.type) || account.purpose !== 'GENERAL') throw new Error('A conciliação bancária está disponível para conta corrente e poupança.');
  return { account, accountIds };
}
function transactionScope(context: BankContext, accountIds?: number[]): Prisma.FinancialTransactionWhereInput {
  return {
    companyId: context.companyId, archivedAt: null, isExternalCreditCardSettlement: false, status: { in: ['COMPLETED', 'PENDING'] },
    AND: [
      buildOperationalTransactionWhere(),
      { OR: [{ fromAccountId: context.accountId, type: { in: ['EXPENSE', 'TRANSFER'] } }, { toAccountId: context.accountId, type: { in: ['INCOME', 'TRANSFER'] } }] },
      ...(accountIds ? [
        { OR: [{ fromAccountId: null }, { fromAccountId: { in: accountIds } }] },
        { OR: [{ toAccountId: null }, { toAccountId: { in: accountIds } }] }
      ] : [])
    ]
  };
}
async function lockAccount(tx: Db, accountId: number, companyId: number) {
  const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "FinancialAccount" WHERE id = ${accountId} AND "companyId" = ${companyId} FOR UPDATE`;
  if (!locked.length) throw new Error('Conta não encontrada.');
}
async function session(tx: Db, accountId: number, month: string) {
  monthRange(month);
  return tx.bankReconciliation.upsert({ where: { accountId_month: { accountId, month } }, update: {}, create: { accountId, month } });
}
async function editableSession(tx: Db, accountId: number, month: string) {
  const current = await session(tx, accountId, month);
  if (current.status === 'COMPLETED') throw new Error('Reabra o mês antes de alterar a conciliação.');
  return current;
}
async function selectedItems(tx: Db, accountId: number, month: string, ids: number[], individual = false): Promise<BankStatementItem[]> {
  const limit = individual ? 5 : 20;
  if (!ids.length || ids.length > limit || new Set(ids).size !== ids.length) throw new Error(`Selecione de 1 a ${limit} itens distintos.`);
  const items = await tx.bankStatementItem.findMany({ where: { accountId, id: { in: ids }, date: monthRange(month), activeGroupId: null, ignoredAt: null }, orderBy: { id: 'asc' } });
  if (items.length !== ids.length) throw new Error('Um item já foi conciliado, está ignorado ou não pertence a esta conta e mês. Atualize a tela.');
  if (!individual && new Set(items.map(i => Math.sign(cents(i.amount)))).size !== 1) throw new Error('Agrupe apenas movimentos da mesma direção.');
  return items;
}
async function displacedHistoryDescriptions(tx: Db, context: BankContext, accountIds: number[], addedGroups: number) {
  const groups = await tx.bankReconciliationGroup.findMany({ where: { status: 'CONFIRMED', reconciliation: { accountId: context.accountId },
    transactions: { every: { active: true, transaction: transactionScope(context, accountIds) } } }, orderBy: { id: 'desc' },
    skip: Math.max(0, 100 - addedGroups), take: addedGroups, select: { items: { select: { item: { select: { description: true } } } } } });
  return groups.flatMap(group => group.items.map(row => row.item.description));
}
function linkChange(context: BankContext, items: BankStatementItem[], transactions: FinancialTransaction[],
  groups: Array<{ id: number; itemIds: number[]; transactionIds: number[] }>, displacedDescriptions: string[]) {
  return { groups, items: items.map(item => ({ id: item.id, date: day(item.date), amount: item.amount.toFixed(2), description: item.description,
    activeGroupId: groups.find(group => group.itemIds.includes(item.id))?.id })),
    transactions: transactions.map(t => ({ id: t.id, date: transactionDay(t), amount: money(signedTransactionAmount(t, context.accountId)), description: t.description })),
    historyDescriptions: [...new Set([...items.map(item => item.description), ...displacedDescriptions])] };
}
function decodeFile(fileBase64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64) || fileBase64.length % 4 !== 0) throw new Error('Arquivo inválido.');
  const buffer = Buffer.from(fileBase64, 'base64');
  return { buffer, statement: parseBankStatement(buffer) };
}
function accountCore(value: string) {
  return value.split('/').pop()!.replace(/-\w$/, '').replace(/\D/g, '').replace(/^0+/, '');
}
async function checkStatementAccount(context: BankContext, account: Awaited<ReturnType<typeof access>>['account'], statement: BankStatement, tx: Db = prisma) {
  const bankCode = Number(account.bankCode || account.bank?.code);
  const sourceCode = statement.bank === 'NUBANK' ? 260 : 237;
  if (bankCode && bankCode !== sourceCode) throw new Error('O banco do extrato difere do banco cadastrado nesta conta.');
  if (account.accountNumber && statement.accountNumber && accountCore(account.accountNumber) !== accountCore(statement.accountNumber)) throw new Error('O número da conta do extrato difere do cadastro.');
  const previousBank = await tx.bankStatementImport.findFirst({ where: { accountId: context.accountId }, select: { bank: true } });
  const previous = await tx.bankStatementImport.findFirst({ where: { accountId: context.accountId, bankAccount: { not: null } }, select: { bankAccount: true } });
  if ((previousBank && previousBank.bank !== statement.bank) || (previous?.bankAccount && statement.accountNumber && accountCore(previous.bankAccount) !== accountCore(statement.accountNumber))) throw new Error('Este extrato pertence a outra conta bancária que a importada anteriormente.');
}

export default class BankReconciliationService {
  static async preview(context: BankContext, month: string, fileBase64: string) {
    monthRange(month);
    const { account } = await access(context);
    const { statement } = decodeFile(fileBase64);
    await checkStatementAccount(context, account, statement);
    const inside = statement.movements.filter(i => i.date.startsWith(month));
    const outside = statement.movements.filter(i => !i.date.startsWith(month));
    const existing = await prisma.bankStatementItem.count({ where: { accountId: context.accountId, identityKey: { in: statement.movements.map(i => i.identityKey) } } });
    const { movements, ...metadata } = statement;
    return { ...metadata, total: movements.length, inMonth: inside.length, outsideCount: outside.length, existing,
      credits: money(sumCents(inside.filter(i => cents(i.amount) > 0).map(i => cents(i.amount)))),
      debits: money(sumCents(inside.filter(i => cents(i.amount) < 0).map(i => cents(i.amount)))),
      sample: inside.slice(0, 10), outside: outside.slice(0, 20) };
  }

  static async import(context: BankContext, month: string, fileBase64: string, fileName: string) {
    const { account } = await access(context);
    if (!account.isActive) throw new Error('Ative a conta antes de importar.');
    const { buffer, statement } = decodeFile(fileBase64);
    if (!statement.movements.some(i => i.date.startsWith(month))) throw new Error('O extrato não possui movimentos no mês escolhido.');
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      await checkStatementAccount(context, account, statement, tx);
      const current = await session(tx, context.accountId, month);
      const previous = await tx.bankStatementImport.findUnique({ where: { accountId_fileHash: { accountId: context.accountId, fileHash: hash(buffer) } }, select: { id: true } });
      const stored = await tx.bankStatementItem.findMany({ where: { accountId: context.accountId, identityKey: { in: statement.movements.map(i => i.identityKey) } } });
      if (previous && stored.length === statement.movements.length) return { importId: previous.id, created: 0, reused: statement.movements.length };
      if (current.status === 'COMPLETED') throw new Error('Reabra o mês antes de importar outro arquivo.');
      const byKey = new Map(stored.map(i => [i.identityKey, i]));
      const nativeRows = await tx.bankStatementItem.findMany({ where: { accountId: context.accountId, externalId: { in: statement.movements.flatMap(i => i.externalId ? [i.externalId] : []) } } });
      const byNativeId = new Map(nativeRows.map(i => [i.externalId, i]));
      for (const row of statement.movements) {
        const old = byKey.get(row.identityKey) || (row.externalId ? byNativeId.get(row.externalId) : undefined);
        if (old && (day(old.date) !== row.date || cents(old.amount) !== cents(row.amount) || old.normalizedDescription !== row.normalizedDescription)) {
          throw new Error('Um identificador já importado mudou de valor, data ou descrição. Confira o arquivo antes de continuar.');
        }
        if (old && !old.externalId && row.externalId) await tx.bankStatementItem.update({ where: { id: old.id }, data: { externalId: row.externalId } });
      }
      const { movements, ...metadata } = statement;
      const imported = previous || await tx.bankStatementImport.create({ data: { accountId: context.accountId, fileHash: hash(buffer),
        fileName, fileData: buffer, bank: statement.bank, format: statement.format, bankAccount: statement.accountNumber,
        importedForMonth: month, metadata: json(metadata), createdBy: context.userId }, select: { id: true } });
      const newRows = movements.filter(i => !byKey.has(i.identityKey));
      for (let offset = 0; offset < newRows.length; offset += 200) {
        await tx.bankStatementItem.createMany({ data: newRows.slice(offset, offset + 200).map(i => ({ ...i, date: new Date(i.date), accountId: context.accountId })) });
      }
      const all = await tx.bankStatementItem.findMany({ where: { accountId: context.accountId, identityKey: { in: movements.map(i => i.identityKey) } }, select: { id: true, identityKey: true } });
      const idByKey = new Map(all.map(i => [i.identityKey, i.id]));
      for (let offset = 0; offset < movements.length; offset += 200) {
        await tx.bankStatementImportItem.createMany({ data: movements.slice(offset, offset + 200).map((i, index) => ({ importId: imported.id, itemId: idByKey.get(i.identityKey)!, position: offset + index })), skipDuplicates: true });
      }
      const changedMonths = [...new Set(newRows.map(i => i.date.slice(0, 7)))];
      const reopened = await tx.bankReconciliation.findMany({ where: { accountId: context.accountId, month: { in: changedMonths }, status: 'COMPLETED' }, select: { id: true } });
      await tx.bankReconciliation.updateMany({ where: { id: { in: reopened.map(r => r.id) } }, data: { status: 'OPEN', completedAt: null, completedBy: null } });
      for (const reopenedMonth of reopened) await tx.bankReconciliationEvent.create({ data: { reconciliationId: reopenedMonth.id, userId: context.userId, action: 'NEW_STATEMENT_ITEMS', details: { importId: imported.id } } });
      await tx.bankReconciliationEvent.create({ data: { reconciliationId: current.id, userId: context.userId, action: 'IMPORT', details: { importId: imported.id, created: newRows.length, reused: stored.length } } });
      await tx.bankMatchCache.deleteMany({ where: { accountId: context.accountId } });
      return { importId: imported.id, created: newRows.length, reused: stored.length };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async reset(context: BankContext, month: string) {
    await access(context);
    const range = monthRange(month);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await tx.bankReconciliation.findUnique({ where: { accountId_month: { accountId: context.accountId, month } } });
      if (current?.status === 'COMPLETED') throw new Error('Não é possível reiniciar uma conciliação concluída.');
      const imports = await tx.bankStatementImport.findMany({ where: { accountId: context.accountId,
        OR: [{ importedForMonth: month }, { items: { some: { item: { date: range } } } }] }, select: { id: true, importedForMonth: true } });
      // Cascades remove only reconciliation evidence; FinancialTransaction is preserved.
      if (current) await tx.bankReconciliation.delete({ where: { id: current.id } });
      const removed = await tx.bankStatementItem.deleteMany({ where: { accountId: context.accountId, date: range } });
      await tx.bankMatchCache.deleteMany({ where: { accountId: context.accountId } });
      let removedFiles = 0;
      for (const file of imports) {
        const remaining = await tx.bankStatementImportItem.findFirst({ where: { importId: file.id }, orderBy: { position: 'asc' }, select: { item: { select: { date: true } } } });
        if (!remaining) { await tx.bankStatementImport.delete({ where: { id: file.id } }); removedFiles++; }
        else if (file.importedForMonth === month) await tx.bankStatementImport.update({ where: { id: file.id }, data: { importedForMonth: day(remaining.item.date).slice(0, 7) } });
      }
      return { removedItems: removed.count, removedFiles };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async load(context: BankContext, month: string, page = 1, filter = 'ALL') {
    const { account, accountIds } = await access(context);
    const range = monthRange(month);
    const monthWhere = { accountId: context.accountId, date: range };
    const itemWhere = { ...monthWhere, ...(filter === 'PENDING' ? { activeGroupId: null, ignoredAt: null } : filter === 'CONFIRMED' ? { activeGroupId: { not: null } } : filter === 'IGNORED' ? { ignoredAt: { not: null } } : {}) };
    const transactionsWhere: Prisma.FinancialTransactionWhereInput = { AND: [transactionScope(context, accountIds), financialDateWhere(range)], status: 'COMPLETED' };
    const [current, items, total, pending, credits, debits, linked, unmatched, allUnmatched, imports, history, ignored] = await Promise.all([
      prisma.bankReconciliation.findUnique({ where: { accountId_month: { accountId: context.accountId, month } } }),
      prisma.bankStatementItem.findMany({ where: itemWhere, orderBy: [{ date: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 }),
      prisma.bankStatementItem.count({ where: itemWhere }),
      prisma.bankStatementItem.count({ where: { ...monthWhere, activeGroupId: null, ignoredAt: null } }),
      prisma.bankStatementItem.aggregate({ where: { ...monthWhere, amount: { gt: 0 } }, _sum: { amount: true }, _count: true }),
      prisma.bankStatementItem.aggregate({ where: { ...monthWhere, amount: { lt: 0 } }, _sum: { amount: true }, _count: true }),
      prisma.bankStatementItem.count({ where: { ...monthWhere, activeGroupId: { not: null } } }),
      prisma.financialTransaction.count({ where: { ...transactionsWhere, bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } }),
      prisma.financialTransaction.count({ where: { AND: [transactionScope(context), financialDateWhere(range)], status: 'COMPLETED', bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } }),
      prisma.bankStatementImport.findMany({ where: { accountId: context.accountId, OR: [{ importedForMonth: month }, { items: { some: { item: { date: range } } } }] }, orderBy: { id: 'desc' }, take: 20, select: importSelect }),
      prisma.bankReconciliation.findMany({ where: { accountId: context.accountId }, orderBy: { month: 'desc' }, take: 120 }),
      prisma.bankStatementItem.count({ where: { ...monthWhere, ignoredAt: { not: null } } })
    ]);
    return { account: { id: account.id, name: account.name, isActive: account.isActive }, month, session: current, items, page, pageSize: 50, total,
      summary: { pending, confirmed: linked, ignored, total: credits._count + debits._count, credits: credits._sum.amount?.toFixed(2) || '0.00', debits: debits._sum.amount?.toFixed(2) || '0.00', unmatchedTransactions: allUnmatched, restrictedTransactions: allUnmatched - unmatched }, imports, history };
  }

  static async setIgnored(context: BankContext, month: string, itemId: number, ignored: boolean) {
    await access(context);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await editableSession(tx, context.accountId, month);
      const item = await tx.bankStatementItem.findFirst({ where: { id: itemId, accountId: context.accountId, date: monthRange(month) } });
      if (!item) throw new Error('Movimento não encontrado nesta conta e mês.');
      if (item.activeGroupId) throw new Error('Este movimento já está conciliado. Desfaça o vínculo antes de ignorá-lo.');
      const changed = !!item.ignoredAt !== ignored;
      const updated = changed ? await tx.bankStatementItem.update({ where: { id: item.id }, data: {
        ignoredAt: ignored ? new Date() : null, ignoredBy: ignored ? context.userId : null
      } }) : item;
      if (changed) await tx.bankReconciliationEvent.create({ data: { reconciliationId: current.id, userId: context.userId,
        action: ignored ? 'IGNORE_ITEM' : 'RESTORE_ITEM', details: { itemId, description: item.description.slice(0, 255) } } });
      // Remove only this movement from pending searches; ignoring is not match feedback for AI.
      return { item: updated, ...(ignored ? { change: { items: [updated], transactions: [], historyDescriptions: [], groups: [] } } : {}) };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async transactions(context: BankContext, month: string, search = '', page = 1, days = 0, unmatched = true) {
    const { accountIds } = await access(context);
    const monthDates = monthRange(month);
    const range = { gte: new Date(monthDates.gte.getTime() - days * 86400000), lt: new Date(monthDates.lt.getTime() + days * 86400000) };
    const where: Prisma.FinancialTransactionWhereInput = { AND: [transactionScope(context, accountIds), financialDateWhere(range)],
      ...(search ? { description: { contains: search, mode: 'insensitive' } } : {}),
      ...(unmatched ? { bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } : {}) };
    const [items, total] = await Promise.all([
      prisma.financialTransaction.findMany({ where, select: transactionSelect, orderBy: [{ date: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 }),
      prisma.financialTransaction.count({ where })
    ]);
    return { items: items.map(t => ({ ...t, amount: money(signedTransactionAmount(t, context.accountId)), version: t.updatedAt.toISOString() })), total, page, pageSize: 50 };
  }

  static async candidates(context: BankContext, month: string, itemIds: number[], useAi: boolean | 'auto' = false) {
    const { accountIds } = await access(context);
    const items = await selectedItems(prisma, context.accountId, month, itemIds);
    return (await this.searchCandidates(context, month, [items], accountIds, useAi))[0];
  }

  static async candidatesBatch(context: BankContext, month: string, itemIds: number[], useAi: boolean | 'auto' = false) {
    const { accountIds } = await access(context);
    const items = await selectedItems(prisma, context.accountId, month, itemIds, true);
    const results = await this.searchCandidates(context, month, items.map(item => [item]), accountIds, useAi);
    return { results: results.map((result, index) => ({ itemId: items[index].id, ...result })) };
  }

  static async scanMissing(context: BankContext, month: string, afterId = 0) {
    const { accountIds } = await access(context);
    const found = await prisma.bankStatementItem.findMany({ where: { accountId: context.accountId, date: monthRange(month), activeGroupId: null, ignoredAt: null, id: { gt: afterId } },
      orderBy: { id: 'asc' }, take: 6 });
    const items = found.slice(0, 5);
    const results = items.length ? await this.searchCandidates(context, month, items.map(item => [item]), accountIds, false) : [];
    return { rows: items.map((item, index) => ({ item, result: { itemId: item.id, ...results[index] } })),
      nextCursor: found.length > 5 ? items[items.length - 1].id : null };
  }

  private static async searchCandidates(context: BankContext, month: string, groups: BankStatementItem[][], accountIds: number[], useAi: boolean | 'auto', db: Db = prisma) {
    const items = groups.flat();
    const range = expandRange(items.map(i => i.date), 7);
    const base: Prisma.FinancialTransactionWhereInput = { AND: [transactionScope(context, accountIds), financialDateWhere(range)], bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } };
    const amounts = [...new Set(groups.map(group => money(Math.abs(sumCents(group.map(i => cents(i.amount)))))))];
    const exactLimit = 100 * groups.length, nearbyLimit = 200 * groups.length, neighborLimit = 25 * groups.length;
    const [exact, nearby, neighbors, history, restricted] = await Promise.all([
      db.financialTransaction.findMany({ where: { ...base, amount: { in: amounts } }, select: transactionSelect, orderBy: { id: 'desc' }, take: exactLimit + 1 }),
      db.financialTransaction.findMany({ where: base, select: transactionSelect, orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }], take: nearbyLimit + 1 }),
      db.bankStatementItem.findMany({ where: { accountId: context.accountId, activeGroupId: null, ignoredAt: null, AND: [{ date: range }, { date: monthRange(month) }] }, orderBy: { date: 'asc' }, take: neighborLimit + 1 }),
      db.bankReconciliationGroup.findMany({ where: { status: 'CONFIRMED', reconciliation: { accountId: context.accountId }, transactions: { every: { active: true, transaction: transactionScope(context, accountIds) } } },
        include: { items: { include: { item: { select: { description: true, normalizedDescription: true } } } }, transactions: { include: { transaction: { select: transactionSelect } } } }, orderBy: { id: 'desc' }, take: 100 }),
      db.financialTransaction.count({ where: { AND: [transactionScope(context), financialDateWhere(range)], NOT: transactionScope(context, accountIds),
        bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } })
    ]);
    const transactions = [...new Map([...exact.slice(0, exactLimit), ...nearby.slice(0, nearbyLimit)].map(t => [t.id, t])).values()];
    const limited = exact.length > exactLimit || nearby.length > nearbyLimit || restricted > 0;
    const ranked = await Promise.all(groups.map(async group => {
      const dates = expandRange(group.map(i => i.date), 7);
      const inRange = (date: string) => date >= day(dates.gte) && date < day(dates.lt);
      const localNeighbors = neighbors.filter(i => inRange(day(i.date)));
      const localTransactions = transactions.filter(t => inRange(transactionDay(t)));
      const target = sumCents(group.map(i => cents(i.amount)));
      const smaller = localTransactions.filter(t => { const amount = signedTransactionAmount(t, context.accountId); return Math.sign(amount) === Math.sign(target) && Math.abs(amount) < Math.abs(target); });
      const canCombineItems = group.length === 1 && localTransactions.some(t => { const amount = signedTransactionAmount(t, context.accountId); return Math.sign(amount) === Math.sign(target) && Math.abs(amount) > Math.abs(target); });
      // Exact counts are independent of the displayed suggestions and include adjacent imported months.
      const duplicateRange = expandRange(group.map(i => i.date), 3);
      const [itemCount, transactionCount] = group.length === 1 ? await Promise.all([
        db.bankStatementItem.count({ where: { accountId: context.accountId, activeGroupId: null, ignoredAt: null, amount: group[0].amount, date: duplicateRange } }),
        db.financialTransaction.count({ where: { AND: [transactionScope(context, accountIds), financialDateWhere(duplicateRange)],
          amount: money(Math.abs(target)), ...(target < 0 ? { fromAccountId: context.accountId, type: { in: ['EXPENSE', 'TRANSFER'] } } : { toAccountId: context.accountId, type: { in: ['INCOME', 'TRANSFER'] } }),
          bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } })
      ]) : [0, 0];
      return { items: group, neighbors: localNeighbors, limited: limited || (canCombineItems && (neighbors.length > neighborLimit || localNeighbors.length > 25)) || smaller.length > 25,
        evidence: { duplicateItem: itemCount > 1, duplicateTransaction: transactionCount > 1, incomplete: restricted > 0 },
        candidates: rankBankCandidates(group, localTransactions, context.accountId, localNeighbors.slice(0, 25), Number.MAX_SAFE_INTEGER) };
    }));
    const decisions = await db.bankMatchDecision.findMany({ where: { contextKey: { in: [...new Set(ranked.flatMap(r => r.candidates.map(c => c.key)))] }, decision: 'REJECTED', reconciliation: { accountId: context.accountId } }, select: { contextKey: true } });
    const rejected = new Set(decisions.map(d => d.contextKey));
    const descriptionPair = (statement: string, transaction: string) => JSON.stringify([normalizeDescription(statement), normalizeDescription(transaction)]);
    const knownPairs = new Set(history.flatMap(g => g.items.length === 1 && g.transactions.length === 1 && g.transactions[0].transaction
      ? [descriptionPair(g.items[0].item.description, g.transactions[0].transaction.description)] : []));
    return Promise.all(ranked.map(async ({ items, neighbors, limited, evidence, candidates: initial }) => {
      let candidates = initial.filter(c => !rejected.has(c.key));
      const examples = history.map(g => ({
        statement: g.items.map(i => i.item.description).join(' / '),
        transactions: g.transactions.flatMap(t => t.transaction ? [{ description: t.transaction.description, version: t.transaction.updatedAt.toISOString() }] : []),
        relevance: Math.max(...items.flatMap(i => g.items.map(h => similarity(i.description, h.item.description)))),
        id: g.id
      })).filter(h => h.relevance > 0.1 && h.transactions.length).sort((a, b) => b.relevance - a.relevance).slice(0, 5);
      for (const candidate of candidates) {
        // A previously reviewed mapping, not a token-overlap coincidence, establishes description equivalence.
        const known = candidate.items.length === 1 && candidate.transactions.length === 1
          && knownPairs.has(descriptionPair(candidate.items[0].description, candidate.transactions[0].description));
        if (known) { candidate.source = 'HISTORY'; candidate.score += 12; candidate.reason += ' Padrão semelhante a uma correspondência confirmada.'; }
      }
      // Compatible values precede divergent alternatives, including after the history bonus.
      candidates.sort((a, b) => Number(cents(a.difference) !== 0) - Number(cents(b.difference) !== 0) || b.score - a.score);
      const assessment = assessBankCandidates(candidates, limited);
      // Include compact dependencies from the full compatible pool, beyond the ten displayed candidates.
      const compatible = candidates.filter(candidate => cents(candidate.difference) === 0);
      const dependencies = { itemIds: [...new Set(compatible.flatMap(candidate => candidate.itemIds))],
        transactionIds: [...new Set(compatible.flatMap(candidate => candidate.transactions.map(transaction => transaction.id)))] };
      candidates = classifyBankCandidates(candidates, neighbors, limited, evidence, 10);
      const confidenceByKey = new Map(candidates.map(c => [c.key, c.confidence]));
      let cacheId: number | undefined, aiMessage: string | undefined;
      const needsAi = shouldUseBankAi(candidates);
      if (candidates.length && assessment !== 'POSSIBLE_MISSING' && (useAi === true || (useAi === 'auto' && needsAi))) {
        const result = await suggestBankMatchByAi({ context, items, candidates, examples });
        // AI can reorder suggestions, but cannot promote their confidence or return stale cached criteria.
        candidates = result.candidates.map(c => ({ ...c, confidence: confidenceByKey.get(c.key) })); cacheId = result.cacheId; aiMessage = result.message;
      } else if (useAi === 'auto' && candidates.length && !needsAi) {
        aiMessage = 'Valor e data conferem sem ambiguidade identificada. A consulta à IA foi dispensada; confira antes de confirmar.';
      }
      candidates = candidates.map(candidate => ({ ...candidate, feedbackToken: signBankFeedback(context, month, candidate) }));
      return { candidates, cacheId, aiMessage, limited, assessment, dependencies };
    }));
  }

  private static async linkTx(tx: Db, context: BankContext, reconciliationId: number, items: BankStatementItem[], transactions: FinancialTransaction[], note?: string, suggestion?: Prisma.InputJsonValue) {
    const total = sumCents(items.map(i => cents(i.amount)));
    if (transactions.some(t => t.status !== 'COMPLETED' || t.archivedAt || t.isExternalCreditCardSettlement || Math.sign(signedTransactionAmount(t, context.accountId)) !== Math.sign(total))) throw new Error('Selecione lançamentos liquidados, ativos e com a mesma direção do extrato.');
    if (sumCents(transactions.map(t => signedTransactionAmount(t, context.accountId))) !== total) throw new Error('Os valores selecionados não conferem. Resolva a diferença antes de confirmar.');
    const group = await tx.bankReconciliationGroup.create({ data: { reconciliationId, createdBy: context.userId, note, suggestion,
      items: { create: items.map(i => ({ itemId: i.id })) },
      transactions: { create: transactions.map(t => ({ accountId: context.accountId, transactionId: t.id, originalTransactionId: t.id,
        snapshot: json({ id: t.id, description: t.description, amount: t.amount, date: t.date, effectiveDate: t.effectiveDate, type: t.type, status: t.status, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId }) })) }
    } });
    const claimed = await tx.bankStatementItem.updateMany({ where: { id: { in: items.map(i => i.id) }, accountId: context.accountId, activeGroupId: null, ignoredAt: null }, data: { activeGroupId: group.id } });
    if (claimed.count !== items.length) throw new Error('Outro usuário conciliou um destes itens. Atualize a tela.');
    await tx.bankReconciliationEvent.create({ data: { reconciliationId, groupId: group.id, userId: context.userId, action: 'CONFIRM', details: { itemIds: items.map(i => i.id), transactionIds: transactions.map(t => t.id) } } });
    // Cache keys include candidate versions and relevant history. Unrelated answers remain reusable.
    return group;
  }

  static async confirm(context: BankContext, month: string, input: BankLinkInput) {
    const { accountIds } = await access(context);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await editableSession(tx, context.accountId, month);
      const items = await selectedItems(tx, context.accountId, month, input.itemIds);
      const transactionIds = input.transactions.map(t => t.id);
      if (!transactionIds.length || transactionIds.length > 20 || new Set(transactionIds).size !== transactionIds.length) throw new Error('Selecione lançamentos distintos.');
      const permittedCount = await tx.financialTransaction.count({ where: { AND: [transactionScope(context, accountIds)], id: { in: transactionIds } } });
      if (permittedCount !== transactionIds.length) throw new Error('Lançamento indisponível ou sem permissão de acesso.');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "FinancialTransaction" WHERE "companyId" = ${context.companyId} AND id IN (${Prisma.join(transactionIds)}) ORDER BY id FOR UPDATE NOWAIT`);
      const transactions = await tx.financialTransaction.findMany({ where: { AND: [transactionScope(context, accountIds)], id: { in: transactionIds } }, orderBy: { id: 'asc' } });
      if (transactions.length !== transactionIds.length) throw new Error('Lançamento indisponível ou sem permissão de acesso.');
      if (transactions.some(t => input.transactions.find(i => i.id === t.id)?.version !== t.updatedAt.toISOString())) throw new Error('Um lançamento foi alterado. Atualize as sugestões antes de confirmar.');
      const claimed = await tx.bankReconciliationTransaction.count({ where: { accountId: context.accountId, transactionId: { in: transactionIds }, active: true } });
      if (claimed) throw new Error('Um lançamento já está conciliado nesta conta.');
      let suggestion: Prisma.InputJsonValue | undefined;
      if (input.feedbackToken) {
        suggestion = json(readBankFeedback(input.feedbackToken, context, month, candidateFor(items, transactions, context.accountId).key));
      } else if (input.cacheId && input.candidateKey) {
        const cached = await tx.bankMatchCache.findFirst({ where: { id: input.cacheId, accountId: context.accountId, expiresAt: { gt: new Date() } } });
        const candidate = (cached?.result as unknown as { candidates?: BankCandidate[] })?.candidates?.find(c => c.key === input.candidateKey && idsKey(c.itemIds) === idsKey(input.itemIds) && idsKey(c.transactions.map(t => t.id)) === idsKey(transactionIds));
        if (candidate) suggestion = json({ source: candidate.source, model: candidate.model, reason: candidate.reason, key: candidate.key, confidence: candidate.confidence });
      }
      const completed: FinancialTransaction[] = [];
      for (const t of transactions) {
        if (t.status === 'PENDING') {
          if (!input.settlePending || !input.settlementDate) throw new Error('Confirme a liquidação e informe sua data para vincular lançamentos pendentes.');
          completed.push(await FinancialTransactionService.settleForBankReconciliationTx(tx, t, new Date(calendarDate(input.settlementDate)), context.companyId));
        } else completed.push(t);
      }
      const displaced = await displacedHistoryDescriptions(tx, context, accountIds, 1);
      const group = await this.linkTx(tx, context, current.id, items, completed, input.note, suggestion);
      await tx.bankMatchDecision.updateMany({ where: { contextKey: candidateFor(items, transactions, context.accountId).key }, data: { decision: 'ACCEPTED', feedback: suggestion, userId: context.userId } });
      return { ...group, change: linkChange(context, items, [...transactions, ...completed], [{ id: group.id, itemIds: input.itemIds, transactionIds }], displaced) };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async confirmBatch(context: BankContext, month: string, input: BankBulkLinkInput[]) {
    const { accountIds } = await access(context);
    const itemIds = input.map(row => row.itemId), transactionIds = input.map(row => row.transaction.id);
    if (!input.length || input.length > 50 || new Set(itemIds).size !== input.length || new Set(transactionIds).size !== input.length) {
      throw new Error('Selecione até 50 correspondências distintas da página, sem repetir movimentos ou lançamentos.');
    }
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await editableSession(tx, context.accountId, month);
      const items = await tx.bankStatementItem.findMany({ where: { accountId: context.accountId, date: monthRange(month), id: { in: itemIds }, activeGroupId: null, ignoredAt: null } });
      const permitted = await tx.financialTransaction.count({ where: { AND: [transactionScope(context, accountIds)], id: { in: transactionIds } } });
      if (items.length !== input.length || permitted !== input.length) throw new Error('Um item do lote mudou ou está indisponível. Atualize as sugestões antes de confirmar.');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "FinancialTransaction" WHERE "companyId" = ${context.companyId} AND id IN (${Prisma.join(transactionIds)}) ORDER BY id FOR UPDATE NOWAIT`);
      const transactions = await tx.financialTransaction.findMany({ where: { AND: [transactionScope(context, accountIds)], id: { in: transactionIds }, status: 'COMPLETED',
        bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } });
      const reviewed = input.map(row => {
        const item = items.find(item => item.id === row.itemId), transaction = transactions.find(t => t.id === row.transaction.id);
        if (!item || !transaction || transaction.updatedAt.toISOString() !== row.transaction.version) throw new Error('Um lançamento do lote mudou. Atualize as sugestões antes de confirmar.');
        const candidate = candidateFor([item], [transaction], context.accountId);
        const feedback = readBankFeedback(row.feedbackToken, context, month, candidate.key);
        if (!feedback.confidence || feedback.ruleVersion !== BANK_MATCH_RULE_VERSION || cents(candidate.difference) !== 0) throw new Error('A sugestão mudou ou tem diferença de valores. Atualize a busca e revise novamente.');
        return { item, transaction, candidate, feedback };
      });
      // Revalidate the entire reviewed snapshot before writing any link. No AI and no partial success.
      for (let offset = 0; offset < reviewed.length; offset += 5) {
        const batch = reviewed.slice(offset, offset + 5);
        const results = await this.searchCandidates(context, month, batch.map(row => [row.item]), accountIds, false, tx);
        if (results.some((result, index) => result.candidates.find(candidate => candidate.key === batch[index].candidate.key)?.confidence?.level !== batch[index].feedback.confidence.level)) {
          throw new Error('A confiabilidade de um item do lote mudou. Nenhum vínculo foi salvo; atualize as sugestões e revise novamente.');
        }
      }
      const displaced = await displacedHistoryDescriptions(tx, context, accountIds, reviewed.length);
      const groups: Array<{ id: number; itemIds: number[]; transactionIds: number[] }> = [];
      for (const row of reviewed) {
        const group = await this.linkTx(tx, context, current.id, [row.item], [row.transaction], undefined, json(row.feedback));
        await tx.bankMatchDecision.updateMany({ where: { contextKey: row.candidate.key }, data: { decision: 'ACCEPTED', feedback: json(row.feedback), userId: context.userId } });
        groups.push({ id: group.id, itemIds: [row.item.id], transactionIds: [row.transaction.id] });
      }
      return { confirmed: groups.length, change: linkChange(context, items, transactions, groups, displaced) };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async create(context: BankContext, month: string, input: { itemIds: number[]; description: string; categoryId?: number; transferAccountId?: number; effectiveDate: string }) {
    const { accountIds } = await access(context);
    if (input.transferAccountId && (!accountIds.includes(input.transferAccountId) || input.transferAccountId === context.accountId)) throw new Error('Conta de transferência inválida ou sem acesso.');
    return prisma.$transaction(async tx => {
      for (const id of [context.accountId, ...(input.transferAccountId ? [input.transferAccountId] : [])].sort((a, b) => a - b)) await lockAccount(tx, id, context.companyId);
      const current = await editableSession(tx, context.accountId, month);
      const items = await selectedItems(tx, context.accountId, month, input.itemIds);
      const amount = sumCents(items.map(i => cents(i.amount)));
      const type = input.transferAccountId ? 'TRANSFER' : amount < 0 ? 'EXPENSE' : 'INCOME';
      if (type !== 'TRANSFER' && !input.categoryId) throw new Error('Selecione uma categoria.');
      if (input.transferAccountId) {
        const other = await tx.financialAccount.findFirst({ where: { id: input.transferAccountId, companyId: context.companyId, isActive: true, type: { not: 'CREDIT_CARD' } } });
        if (!other) throw new Error('Para pagar uma fatura de cartão, use a rotina de pagamento de faturas e depois vincule o lançamento.');
      }
      const effectiveDate = new Date(calendarDate(input.effectiveDate));
      const created = await FinancialTransactionService.createForBankReconciliationTx(tx, {
        description: input.description, amount: money(Math.abs(amount)), date: effectiveDate, effectiveDate, type,
        fromAccountId: amount < 0 ? context.accountId : input.transferAccountId,
        toAccountId: amount > 0 ? context.accountId : input.transferAccountId,
        categoryId: type === 'TRANSFER' ? undefined : input.categoryId, companyId: context.companyId, createdBy: context.userId
      });
      const displaced = await displacedHistoryDescriptions(tx, context, accountIds, 1);
      const group = await this.linkTx(tx, context, current.id, items, [created], 'Lançamento criado na conciliação.');
      return { groupId: group.id, transactionId: created.id, change: linkChange(context, items, [created], [{ id: group.id, itemIds: input.itemIds, transactionIds: [created.id] }], displaced) };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }

  static async reject(context: BankContext, month: string, input: BankLinkInput) {
    const { accountIds } = await access(context);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const items = await selectedItems(tx, context.accountId, month, input.itemIds);
      const transactions = await tx.financialTransaction.findMany({ where: { AND: [transactionScope(context, accountIds)], id: { in: input.transactions.map(t => t.id) } } });
      if (!transactions.length || transactions.length !== input.transactions.length || transactions.some(t => input.transactions.find(v => v.id === t.id)?.version !== t.updatedAt.toISOString())) throw new Error('As sugestões mudaram. Atualize a tela.');
      const candidate = candidateFor(items, transactions, context.accountId);
      const feedback = input.feedbackToken ? json(readBankFeedback(input.feedbackToken, context, month, candidate.key)) : undefined;
      const current = await editableSession(tx, context.accountId, month);
      await tx.bankMatchDecision.upsert({ where: { contextKey: candidate.key }, update: { decision: 'REJECTED', userId: context.userId, feedback },
        create: { reconciliationId: current.id, contextKey: candidate.key, itemIds: input.itemIds, transactionIds: transactions.map(t => t.id), decision: 'REJECTED', feedback, userId: context.userId } });
      return { rejected: true };
    }, { isolationLevel: 'Serializable' });
  }

  static async undo(context: BankContext, month: string, groupId: number, note: string) {
    await access(context);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await editableSession(tx, context.accountId, month);
      const group = await tx.bankReconciliationGroup.findFirst({ where: { id: groupId, reconciliationId: current.id } });
      if (!group) throw new Error('Vínculo não encontrado.');
      if (group.status === 'UNDONE') return { undone: true };
      await tx.bankStatementItem.updateMany({ where: { activeGroupId: group.id }, data: { activeGroupId: null } });
      await tx.bankReconciliationTransaction.updateMany({ where: { groupId: group.id }, data: { active: false } });
      await tx.bankReconciliationGroup.update({ where: { id: group.id }, data: { status: 'UNDONE' } });
      await tx.bankReconciliationEvent.create({ data: { reconciliationId: current.id, groupId, userId: context.userId, action: 'UNDO', details: { note } } });
      await tx.bankMatchCache.deleteMany({ where: { accountId: context.accountId } });
      return { undone: true };
    }, { isolationLevel: 'Serializable' });
  }

  static async status(context: BankContext, month: string, status: 'OPEN' | 'COMPLETED') {
    await access(context);
    return prisma.$transaction(async tx => {
      await lockAccount(tx, context.accountId, context.companyId);
      const current = await session(tx, context.accountId, month);
      if (current.status === status) return current;
      if (status === 'COMPLETED') {
        const where = { accountId: context.accountId, date: monthRange(month) };
        const [total, pending, unmatched] = await Promise.all([
          tx.bankStatementItem.count({ where }), tx.bankStatementItem.count({ where: { ...where, activeGroupId: null, ignoredAt: null } }),
          tx.financialTransaction.count({ where: { AND: [transactionScope(context), financialDateWhere(monthRange(month))], status: 'COMPLETED', bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } } })
        ]);
        if (!total || pending || unmatched) throw new Error('Resolva os itens do extrato e os lançamentos liquidados sem vínculo antes de concluir o mês.');
      }
      const updated = await tx.bankReconciliation.update({ where: { id: current.id }, data: { status, completedAt: status === 'COMPLETED' ? new Date() : null, completedBy: status === 'COMPLETED' ? context.userId : null } });
      await tx.bankReconciliationEvent.create({ data: { reconciliationId: current.id, userId: context.userId, action: status === 'COMPLETED' ? 'COMPLETE' : 'REOPEN' } });
      return updated;
    }, { isolationLevel: 'Serializable' });
  }

  static async audit(context: BankContext, month: string, page = 1) {
    const { accountIds } = await access(context);
    monthRange(month);
    const scope = { reconciliation: { accountId: context.accountId, month } };
    const [groups, total, events] = await Promise.all([
      prisma.bankReconciliationGroup.findMany({ where: scope, include: { items: { include: { item: true } }, transactions: { include: { transaction: { select: transactionSelect } } } }, orderBy: { id: 'desc' }, skip: (page - 1) * 20, take: 20 }),
      prisma.bankReconciliationGroup.count({ where: scope }),
      prisma.bankReconciliationEvent.findMany({ where: scope, orderBy: { id: 'desc' }, take: 50 })
    ]);
    return { groups: groups.map(g => ({ ...g, transactions: g.transactions.map(link => {
      const snapshot = link.snapshot as { amount: string; type: string; fromAccountId: number | null; toAccountId: number | null };
      const ids = [snapshot.fromAccountId, snapshot.toAccountId, link.transaction?.fromAccountId, link.transaction?.toAccountId].filter((id): id is number => typeof id === 'number');
      return ids.every(id => accountIds.includes(id)) ? { ...link, snapshot: { ...(link.snapshot as Record<string, unknown>), amount: money(signedTransactionAmount(snapshot, context.accountId)) } } : { id: link.id, restricted: true };
    }) })), total, events, page, pageSize: 20 };
  }
}
