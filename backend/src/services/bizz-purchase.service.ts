import { createHash } from 'crypto';
import { AppKey, FinancialTransaction, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import FinancialTransactionService from './financial-transaction.service';
import { BizzError } from './bizz-error';
import {
  bizzPurchaseListSchema,
  CreateBizzPurchase,
  SettleBizzPurchase
} from '../validators/bizz-purchase.validator';

type Actor = { companyId: number; userId: number };
type DB = Prisma.TransactionClient;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
const publicDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const include = {
  items: { orderBy: { position: 'asc' as const } },
  transactions: {
    orderBy: { installmentNumber: 'asc' as const },
    include: { fromAccount: { select: { id: true, name: true } } }
  }
} satisfies Prisma.BizzPurchaseInclude;
type Purchase = Prisma.BizzPurchaseGetPayload<{ include: typeof include }>;

async function access(db: DB, actor: Actor) {
  const member = await db.userCompany.findUnique({
    where: { userId_companyId: { userId: actor.userId, companyId: actor.companyId } }
  });
  if (!member) throw new BizzError(403, 'Acesso negado a esta empresa.');
  const integration = await db.companyAppEntitlement.findFirst({
    where: {
      companyId: actor.companyId,
      enabled: true,
      app: { appKey: AppKey.ZENIT_CASH, isActive: true }
    }
  });
  const accounts = await db.financialAccount.findMany({
    where: {
      companyId: actor.companyId,
      isActive: true,
      isSystemManaged: false,
      type: { not: 'CREDIT_CARD' },
      ...(member.role === 'ADMIN' || member.role === 'SUPERUSER'
        ? {}
        : { userAccess: { some: { userId: actor.userId, companyId: actor.companyId } } })
    },
    select: { id: true, name: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
  });
  return { enabled: Boolean(integration), accounts };
}
function requireIntegration(scope: Awaited<ReturnType<typeof access>>) {
  if (!scope.enabled)
    throw new BizzError(403, 'O Zenit Cash precisa estar habilitado para esta empresa.');
}
function requireAccount(scope: Awaited<ReturnType<typeof access>>, id: number | null) {
  if (!scope.accounts.some((account) => account.id === id))
    throw new BizzError(403, 'Selecione uma conta ativa desta empresa à qual você tenha acesso.');
}
function present(purchase: Purchase, scope: Awaited<ReturnType<typeof access>>) {
  const installments = purchase.transactions.map((transaction) => ({
    id: transaction.id,
    number: transaction.installmentNumber,
    amount: (transaction.originalAmount ?? transaction.amount).toFixed(2),
    paidAmount: transaction.status === 'COMPLETED' ? transaction.amount.toFixed(2) : null,
    dueDate: publicDate(transaction.dueDate),
    effectiveDate: publicDate(transaction.effectiveDate),
    status: transaction.status,
    updatedAt: transaction.updatedAt.toISOString(),
    account: scope.accounts.some((account) => account.id === transaction.fromAccountId)
      ? transaction.fromAccount
      : null,
    canSettle:
      scope.enabled &&
      !purchase.canceledAt &&
      transaction.status === 'PENDING' &&
      !transaction.archivedAt &&
      scope.accounts.some((account) => account.id === transaction.fromAccountId)
  }));
  const pending = purchase.transactions.filter((transaction) => transaction.status === 'PENDING');
  return {
    id: purchase.id,
    number: purchase.number,
    supplierId: purchase.supplierId,
    supplierName: purchase.supplierName,
    date: publicDate(purchase.date),
    total: purchase.total.toFixed(2),
    notes: purchase.notes,
    status:
      purchase.canceledAt ||
      (installments.length > 0 && installments.every((item) => item.status === 'CANCELED'))
        ? 'CANCELED'
        : installments.length > 0 && installments.every((item) => item.status === 'COMPLETED')
          ? 'PAID'
          : 'PENDING',
    nextDueDate:
      pending
        .map((transaction) => publicDate(transaction.dueDate))
        .filter(Boolean)
        .sort()[0] ?? null,
    paidCount: installments.filter((item) => item.status === 'COMPLETED').length,
    installmentCount: installments.length,
    canCancel:
      scope.enabled &&
      !purchase.canceledAt &&
      pending.length === installments.length &&
      installments.every((item) => item.canSettle),
    items: purchase.items.map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      total: item.total.toFixed(2)
    })),
    installments
  };
}

export default class BizzPurchaseService {
  static async options(actor: Actor) {
    const scope = await access(prisma, actor);
    const categories =
      scope.enabled && scope.accounts.length
        ? await prisma.financialCategory.findMany({
            where: { companyId: actor.companyId, type: 'EXPENSE' },
            select: { id: true, name: true, isDefault: true },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
          })
        : [];
    return { enabled: scope.enabled, accounts: scope.enabled ? scope.accounts : [], categories };
  }

  static async get(actor: Actor, id: string) {
    const [purchase, scope] = await Promise.all([
      prisma.bizzPurchase.findFirst({ where: { id, companyId: actor.companyId }, include }),
      access(prisma, actor)
    ]);
    if (!purchase) throw new BizzError(404, 'Compra não encontrada nesta empresa.');
    return present(purchase, scope);
  }

  static async list(actor: Actor, filters: z.infer<typeof bizzPurchaseListSchema>) {
    const scope = await access(prisma, actor);
    const where: Prisma.BizzPurchaseWhereInput = {
      companyId: actor.companyId,
      ...(filters.q
        ? {
            OR: [
              { supplierName: { contains: filters.q, mode: 'insensitive' } },
              ...(/^\d+$/.test(filters.q) && Number(filters.q) <= 2147483647
                ? [{ number: Number(filters.q) }]
                : [])
            ]
          }
        : {}),
      ...(filters.status === 'canceled'
        ? { canceledAt: { not: null } }
        : filters.status === 'all'
          ? {}
          : {
              canceledAt: null,
              transactions:
                filters.status === 'pending'
                  ? { some: { status: 'PENDING' } }
                  : { every: { status: 'COMPLETED' } }
            })
    };
    const [items, total] = await prisma.$transaction(
      [
        prisma.bizzPurchase.findMany({
          where,
          include,
          orderBy: [{ date: 'desc' }, { number: 'desc' }],
          skip: (filters.page - 1) * 20,
          take: 20
        }),
        prisma.bizzPurchase.count({ where })
      ],
      { isolationLevel: 'RepeatableRead' }
    );
    return {
      items: items.map((item) => present(item, scope)),
      total,
      page: filters.page,
      pageSize: 20
    };
  }

  static async create(actor: Actor, input: CreateBizzPurchase) {
    const { requestKey, ...payload } = input;
    const requestHash = hash(payload);
    const replay = async () => {
      const existing = await prisma.bizzPurchase.findUnique({
        where: { companyId_requestKey: { companyId: actor.companyId, requestKey } }
      });
      if (!existing) return null;
      if (existing.requestHash !== requestHash)
        throw new BizzError(
          409,
          'Esta tentativa já registrou outra compra. Confira a lista antes de continuar.'
        );
      return this.get(actor, existing.id);
    };
    const existing = await replay();
    if (existing) return { purchase: existing, created: false };
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const scope = await access(tx, actor);
          requireIntegration(scope);
          requireAccount(scope, input.fromAccountId);
          const supplier = await tx.bizzContact.findFirst({
            where: {
              id: input.supplierId,
              companyId: actor.companyId,
              active: true,
              isSupplier: true
            }
          });
          if (!supplier) throw new BizzError(400, 'Selecione um fornecedor ativo desta empresa.');
          const catalog = await tx.bizzCatalogItem.findMany({
            where: {
              id: { in: input.items.map((item) => item.catalogItemId) },
              companyId: actor.companyId,
              active: true,
              canPurchase: true
            }
          });
          const items = input.items.map((item, position) => {
            const found = catalog.find((candidate) => candidate.id === item.catalogItemId);
            if (!found)
              throw new BizzError(
                400,
                'Selecione produtos ou serviços ativos e disponíveis para compra.'
              );
            const total = new Prisma.Decimal(item.quantity)
              .mul(item.unitPrice)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            if (total.lte(0) || total.gte('1000000000000'))
              throw new BizzError(
                400,
                'O total do item deve estar entre R$ 0,01 e R$ 999.999.999.999,99.'
              );
            return { ...item, position, name: found.name, unit: found.unit, total };
          });
          const total = items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));
          if (total.gte('1000000000000') || total.mul(100).lt(input.installmentCount))
            throw new BizzError(
              400,
              'O total deve permitir parcelas de ao menos R$ 0,01 e ter até 12 dígitos inteiros.'
            );
          if (
            input.categoryId &&
            !(await tx.financialCategory.findFirst({
              where: { id: input.categoryId, companyId: actor.companyId, type: 'EXPENSE' }
            }))
          )
            throw new BizzError(400, 'Categoria de despesa inválida para esta empresa.');
          const purchase = await tx.bizzPurchase.create({
            data: {
              companyId: actor.companyId,
              supplierId: supplier.id,
              supplierName: supplier.name,
              date: date(input.date),
              total,
              notes: input.notes || null,
              createdById: actor.userId,
              requestKey,
              requestHash,
              items: { create: items }
            }
          });
          const created = await FinancialTransactionService.createTransaction(
            {
              description: `Compra Bizz #${purchase.number} · ${supplier.name}`,
              amount: total.toFixed(2),
              date: date(input.date),
              dueDate: date(input.firstDueDate),
              type: 'EXPENSE',
              status: 'PENDING',
              fromAccountId: input.fromAccountId,
              categoryId: input.categoryId,
              companyId: actor.companyId,
              createdBy: actor.userId,
              installmentCount: input.installmentCount
            },
            tx,
            { deferPostCommitEffects: true }
          );
          const transactions = Array.isArray(created) ? created : [created];
          for (const transaction of transactions) {
            await tx.financialTransaction.update({
              where: { id: transaction.id },
              data: { bizzPurchaseId: purchase.id, originalAmount: transaction.amount }
            });
          }
          return { id: purchase.id, transactions };
        },
        { timeout: 30000 }
      );
      await FinancialTransactionService.publishDeferredCommitEffects({
        companyId: actor.companyId,
        accountIds: [input.fromAccountId],
        transactionIds: result.transactions.map((item) => item.id),
        operation: 'bizz-purchase-create'
      });
      return { purchase: await this.get(actor, result.id), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await replay();
        if (duplicate) return { purchase: duplicate, created: false };
      }
      throw error;
    }
  }

  static async settle(actor: Actor, id: string, transactionId: number, input: SettleBizzPurchase) {
    const requestHash = hash({ transactionId, ...input });
    const result = await prisma.$transaction(
      async (tx) => {
        const purchase = await tx.bizzPurchase.findFirst({
          where: { id, companyId: actor.companyId }
        });
        if (!purchase) throw new BizzError(404, 'Compra não encontrada nesta empresa.');
        const scope = await access(tx, actor);
        requireIntegration(scope);
        const rows = await tx.$queryRaw<
          FinancialTransaction[]
        >`SELECT * FROM "FinancialTransaction" WHERE id = ${transactionId} AND "companyId" = ${actor.companyId} AND "bizzPurchaseId" = ${id}::uuid FOR UPDATE`;
        const original = rows[0];
        if (!original) throw new BizzError(404, 'Parcela não encontrada nesta compra.');
        requireAccount(scope, original.fromAccountId);
        requireAccount(scope, input.fromAccountId);
        const receipt = await tx.bizzPurchasePayment.findUnique({
          where: { purchaseId_requestKey: { purchaseId: id, requestKey: input.requestKey } }
        });
        if (receipt) {
          if (receipt.requestHash !== requestHash)
            throw new BizzError(409, 'Esta tentativa já foi utilizada para outro pagamento.');
          return [original.fromAccountId!, input.fromAccountId];
        }
        if (
          purchase.canceledAt ||
          original.status !== 'PENDING' ||
          original.archivedAt ||
          original.updatedAt.toISOString() !== input.expectedUpdatedAt
        )
          throw new BizzError(
            409,
            'A parcela foi alterada ou já foi paga. Atualize a compra antes de continuar.'
          );
        let updated: FinancialTransaction;
        try {
          updated = await FinancialTransactionService.settleBizzPurchaseTransactionTx(
            tx,
            original,
            {
              amount: input.amount,
              fromAccountId: input.fromAccountId,
              effectiveDate: date(input.effectiveDate)
            }
          );
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
          if (error instanceof Error)
            throw new BizzError(
              400,
              error.message.startsWith('Insufficient balance')
                ? 'Saldo insuficiente na conta selecionada. Escolha outra conta ou confira o saldo no Cash.'
                : error.message
            );
          throw error;
        }
        await tx.bizzPurchasePayment.create({
          data: {
            purchaseId: id,
            transactionId: updated.id,
            requestKey: input.requestKey,
            requestHash,
            createdById: actor.userId
          }
        });
        return [original.fromAccountId!, input.fromAccountId];
      },
      { timeout: 30000 }
    );
    await FinancialTransactionService.publishDeferredCommitEffects({
      companyId: actor.companyId,
      accountIds: result,
      transactionIds: [transactionId],
      operation: 'bizz-purchase-settle'
    });
    return this.get(actor, id);
  }

  static async cancel(actor: Actor, id: string) {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.bizzPurchase.findFirst({
        where: { id, companyId: actor.companyId }
      });
      if (!purchase) throw new BizzError(404, 'Compra não encontrada nesta empresa.');
      const scope = await access(tx, actor);
      requireIntegration(scope);
      const transactions = await tx.$queryRaw<
        FinancialTransaction[]
      >`SELECT * FROM "FinancialTransaction" WHERE "bizzPurchaseId" = ${id}::uuid AND "companyId" = ${actor.companyId} ORDER BY id FOR UPDATE`;
      for (const transaction of transactions) requireAccount(scope, transaction.fromAccountId);
      if (purchase.canceledAt || transactions.every((item) => item.status === 'CANCELED'))
        return transactions;
      if (transactions.some((item) => item.status !== 'PENDING'))
        throw new BizzError(409, 'Esta compra já possui pagamento e não pode ser cancelada.');
      await tx.financialTransaction.updateMany({
        where: { bizzPurchaseId: id, companyId: actor.companyId },
        data: { status: 'CANCELED' }
      });
      await tx.bizzPurchase.update({ where: { id }, data: { canceledAt: new Date() } });
      return transactions;
    });
    await FinancialTransactionService.publishDeferredCommitEffects({
      companyId: actor.companyId,
      accountIds: result.map((item) => item.fromAccountId!),
      transactionIds: result.map((item) => item.id),
      operation: 'bizz-purchase-cancel'
    });
    return this.get(actor, id);
  }
}
