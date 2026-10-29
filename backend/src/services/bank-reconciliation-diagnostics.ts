import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { BankContext } from './bank-reconciliation.service';

/** A historical comparison is reconstructed from the current balance, including adjustments. */
export async function bankReconciliationDiagnostics(context: BankContext, accountIds: number[], range: { gte: Date; lt: Date }) {
  return prisma.$transaction(async tx => {
    const account = await tx.financialAccount.findFirstOrThrow({ where: { id: context.accountId, companyId: context.companyId } });
    const imports = await tx.bankStatementImport.findMany({ where: { accountId: context.accountId,
      OR: [{ importedForMonth: range.gte.toISOString().slice(0, 7) }, { items: { some: { item: { date: range } } } }] },
      select: { fileName: true, metadata: true }, orderBy: { id: 'desc' } });
    const evidence = imports.flatMap(file => {
      if (!file.metadata || typeof file.metadata !== 'object' || Array.isArray(file.metadata)) return [];
      const meta = file.metadata as Record<string, unknown>;
      if (typeof meta.balanceDate !== 'string' || typeof meta.closingBalance !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(meta.balanceDate) || !/^-?\d+(\.\d{1,2})?$/.test(meta.closingBalance)) return [];
      const date = new Date(`${meta.balanceDate}T00:00:00Z`);
      return date >= range.gte && date < range.lt ? [{ fileName: file.fileName, date: meta.balanceDate, amount: meta.closingBalance }] : [];
    }).sort((a, b) => b.date.localeCompare(a.date));
    const latest = evidence[0];
    const conflicting = !!latest && evidence.some(e => e.date === latest.date && !new Prisma.Decimal(e.amount).equals(latest.amount));
    const cutoff = latest ? new Date(`${latest.date}T00:00:00Z`) : null;
    const afterCutoff = cutoff ? new Date(cutoff.getTime() + 86400000) : range.lt;
    const dates = (gte: Date, lt?: Date): Prisma.FinancialTransactionWhereInput => ({ OR: [
      { effectiveDate: { gte, ...(lt ? { lt } : {}) } }, { effectiveDate: null, date: { gte, ...(lt ? { lt } : {}) } }
    ] });
    const scope: Prisma.FinancialTransactionWhereInput = { companyId: context.companyId, status: 'COMPLETED', archivedAt: null,
      isExternalCreditCardSettlement: false, OR: [{ fromAccountId: context.accountId }, { toAccountId: context.accountId }] };
    const permissions: Prisma.FinancialTransactionWhereInput = { AND: [
      { OR: [{ fromAccountId: null }, { fromAccountId: { in: accountIds } }] },
      { OR: [{ toAccountId: null }, { toAccountId: { in: accountIds } }] }
    ] };
    const restricted = await tx.financialTransaction.count({ where: { AND: [scope, { NOT: permissions }, dates(range.gte)] } });
    const sumTransactions = async (extra: Prisma.FinancialTransactionWhereInput) => {
      const groups = await tx.financialTransaction.groupBy({ by: ['fromAccountId', 'toAccountId', 'type'],
        where: { AND: [scope, permissions, extra] }, _sum: { amount: true } });
      return groups.reduce((sum, group) => {
        const amount = group._sum.amount || new Prisma.Decimal(0);
        if (group.fromAccountId === context.accountId && group.toAccountId === context.accountId) return sum;
        if (group.fromAccountId === context.accountId && ['EXPENSE', 'TRANSFER'].includes(group.type)) return sum.minus(amount);
        if (group.toAccountId === context.accountId && ['INCOME', 'TRANSFER'].includes(group.type)) return sum.plus(amount);
        return sum;
      }, new Prisma.Decimal(0));
    };
    const [future, unlinked, pending, ignored] = await Promise.all([
      cutoff && !restricted ? sumTransactions(dates(afterCutoff)) : Promise.resolve(null),
      restricted ? Promise.resolve(null) : sumTransactions({ AND: [dates(range.gte, range.lt), { entryKind: 'NORMAL',
        NOT: { OR: [{ fromAccount: { is: { purpose: 'BUDGET' } } }, { toAccount: { is: { purpose: 'BUDGET' } } }] } },
        { bankReconciliationLinks: { none: { accountId: context.accountId, active: true } } }] }),
      tx.bankStatementItem.aggregate({ where: { accountId: context.accountId, date: range, activeGroupId: null, ignoredAt: null }, _sum: { amount: true } }),
      tx.bankStatementItem.aggregate({ where: { accountId: context.accountId, date: range, ignoredAt: { not: null } }, _sum: { amount: true } })
    ]);
    const cashClosing = future !== null && !conflicting ? account.balance.minus(future) : null;
    const statementClosing = latest && !conflicting ? latest.amount : null;
    const warnings = [
      ...(!latest ? ['O extrato não informa um saldo final com data dentro deste mês. Importe um arquivo com essa informação para comparar os saldos.'] : []),
      ...(conflicting ? ['Há saldos diferentes nos arquivos para a mesma data. Confira os extratos antes de comparar.'] : []),
      ...(restricted ? ['Há lançamentos com acesso restrito. O saldo histórico e o total do Cash sem vínculo não podem ser calculados com seu acesso.'] : []),
      'O saldo do Cash no corte é reconstituído com os registros atuais, incluindo ajustes de saldo e movimentos internos. O saldo inicial e períodos anteriores também podem explicar diferenças.',
      'Os totais sem vínculo são do mês inteiro. Não representam, por si só, a causa da diferença de saldo.'
    ];
    return { cutoffDate: latest?.date || null, fileName: latest?.fileName || null, statementClosing,
      cashClosing: cashClosing?.toFixed(2) ?? null,
      difference: statementClosing !== null && cashClosing !== null ? new Prisma.Decimal(statementClosing).minus(cashClosing).toFixed(2) : null,
      pendingStatementNet: (pending._sum.amount || new Prisma.Decimal(0)).toFixed(2),
      unmatchedCashNet: unlinked?.toFixed(2) ?? null, ignoredNet: (ignored._sum.amount || new Prisma.Decimal(0)).toFixed(2), warnings };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}
