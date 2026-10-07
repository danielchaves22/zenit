import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  CreateBizzContact,
  UpdateBizzContact,
  bizzContactListSchema
} from '../validators/bizz-contact.validator';
import { z } from 'zod';

export class BizzError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const publicFields = {
  id: true,
  name: true,
  personType: true,
  isCustomer: true,
  isSupplier: true,
  document: true,
  email: true,
  phone: true,
  notes: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.BizzContactSelect;

export default class BizzContactService {
  static async list(companyId: number, filters: z.infer<typeof bizzContactListSchema>) {
    const documentQuery = filters.q.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const where: Prisma.BizzContactWhereInput = {
      companyId,
      ...(filters.status === 'all' ? {} : { active: filters.status === 'active' }),
      ...(filters.role === 'customer'
        ? { isCustomer: true }
        : filters.role === 'supplier'
          ? { isSupplier: true }
          : {}),
      ...(filters.q
        ? {
            OR: [
              ...['name', 'email', 'phone'].map((field) => ({
                [field]: { contains: filters.q, mode: 'insensitive' }
              })),
              ...(documentQuery ? [{ document: { contains: documentQuery } }] : [])
            ]
          }
        : {})
    };
    const [items, total] = await prisma.$transaction(
      [
        prisma.bizzContact.findMany({
          where,
          select: publicFields,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (filters.page - 1) * 20,
          take: 20
        }),
        prisma.bizzContact.count({ where })
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    return { items, total, page: filters.page, pageSize: 20 };
  }

  static async create(companyId: number, userId: number, input: CreateBizzContact) {
    const { requestKey, ...data } = input;
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const replay = async () => {
      const existing = await prisma.bizzContact.findUnique({
        where: { companyId_requestKey: { companyId, requestKey } }
      });
      if (!existing) return null;
      if (existing.requestHash !== requestHash)
        throw new BizzError(
          409,
          'Esta tentativa já foi utilizada. Reabra o cadastro para enviar outros dados.'
        );
      return prisma.bizzContact.findUniqueOrThrow({ where: { id: existing.id }, select: publicFields });
    };
    const existing = await replay();
    if (existing) return { contact: existing, created: false };
    try {
      const contact = await prisma.bizzContact.create({
        data: { ...data, companyId, requestKey, requestHash, createdById: userId, updatedById: userId },
        select: publicFields
      });
      return { contact, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await replay();
        if (duplicate) return { contact: duplicate, created: false };
        throw new BizzError(
          409,
          'Já existe um cadastro com este documento nesta empresa. Pesquise também nos inativos.'
        );
      }
      throw error;
    }
  }

  static async update(companyId: number, userId: number, id: string, input: UpdateBizzContact) {
    const { version, ...data } = input;
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.bizzContact.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw new BizzError(404, 'Cadastro não encontrado nesta empresa.');
        const result = await tx.bizzContact.updateMany({
          where: { id, companyId, version },
          data: { ...data, version: { increment: 1 }, updatedById: userId }
        });
        if (!result.count)
          throw new BizzError(
            409,
            'Este cadastro foi alterado por outra pessoa. Feche e abra novamente para conferir a versão atual.'
          );
        return tx.bizzContact.findUniqueOrThrow({ where: { id }, select: publicFields });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BizzError(409, 'Já existe um cadastro com este documento nesta empresa.');
      }
      throw error;
    }
  }
}
