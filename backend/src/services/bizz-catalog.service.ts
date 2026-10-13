import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { BizzError } from './bizz-error';
import {
  CreateBizzCatalog,
  UpdateBizzCatalog,
  bizzCatalogListSchema
} from '../validators/bizz-catalog.validator';

const publicFields = {
  id: true,
  name: true,
  kind: true,
  unit: true,
  canPurchase: true,
  canSell: true,
  salePrice: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.BizzCatalogItemSelect;
type Item = Prisma.BizzCatalogItemGetPayload<{ select: typeof publicFields }>;
const present = (item: Item) => ({ ...item, salePrice: item.salePrice?.toFixed(2) ?? null });

export default class BizzCatalogService {
  static async get(companyId: number, id: string) {
    const item = await prisma.bizzCatalogItem.findFirst({
      where: { id, companyId },
      select: publicFields
    });
    if (!item) throw new BizzError(404, 'Produto ou serviço não encontrado nesta empresa.');
    return present(item);
  }

  static async list(companyId: number, filters: z.infer<typeof bizzCatalogListSchema>) {
    const where: Prisma.BizzCatalogItemWhereInput = {
      companyId,
      ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {}),
      ...(filters.kind === 'all' ? {} : { kind: filters.kind }),
      ...(filters.status === 'all' ? {} : { active: filters.status === 'active' }),
      ...(filters.usage === 'purchase'
        ? { canPurchase: true }
        : filters.usage === 'sale'
          ? { canSell: true }
          : filters.usage === 'both'
            ? { canPurchase: true, canSell: true }
            : {})
    };
    const [items, total] = await prisma.$transaction(
      [
        prisma.bizzCatalogItem.findMany({
          where,
          select: publicFields,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (filters.page - 1) * 20,
          take: 20
        }),
        prisma.bizzCatalogItem.count({ where })
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    return { items: items.map(present), total, page: filters.page, pageSize: 20 };
  }

  static async create(companyId: number, userId: number, input: CreateBizzCatalog) {
    const { requestKey, ...data } = input;
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const replay = async () => {
      const existing = await prisma.bizzCatalogItem.findUnique({
        where: { companyId_requestKey: { companyId, requestKey } }
      });
      if (!existing) return null;
      if (existing.requestHash !== requestHash)
        throw new BizzError(
          409,
          'Esta tentativa já foi utilizada. Reabra o cadastro para enviar outros dados.'
        );
      return present(
        await prisma.bizzCatalogItem.findUniqueOrThrow({
          where: { id: existing.id },
          select: publicFields
        })
      );
    };
    const existing = await replay();
    if (existing) return { item: existing, created: false };
    try {
      const item = await prisma.bizzCatalogItem.create({
        data: {
          ...data,
          companyId,
          requestKey,
          requestHash,
          createdById: userId,
          updatedById: userId
        },
        select: publicFields
      });
      return { item: present(item), created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await replay();
        if (duplicate) return { item: duplicate, created: false };
      }
      throw error;
    }
  }

  static async update(companyId: number, userId: number, id: string, input: UpdateBizzCatalog) {
    const { version, ...data } = input;
    return prisma.$transaction(async (tx) => {
      const existing = await tx.bizzCatalogItem.findFirst({
        where: { id, companyId },
        select: { id: true }
      });
      if (!existing) throw new BizzError(404, 'Produto ou serviço não encontrado nesta empresa.');
      const result = await tx.bizzCatalogItem.updateMany({
        where: { id, companyId, version },
        data: { ...data, version: { increment: 1 }, updatedById: userId }
      });
      if (!result.count)
        throw new BizzError(
          409,
          'Este cadastro foi alterado por outra pessoa. Feche e abra novamente para conferir a versão atual.'
        );
      return present(
        await tx.bizzCatalogItem.findUniqueOrThrow({ where: { id }, select: publicFields })
      );
    });
  }
}
