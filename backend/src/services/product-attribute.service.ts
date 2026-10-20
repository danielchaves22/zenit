import { createHash } from 'crypto';
import { Prisma, ProductAttribute, ProductAttributeOption } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { BizzError } from './bizz-error';
import {
  attributeKey,
  attributeListSchema,
  AttributeInput,
  companyOptionsSchema,
  createAttributeSchema,
  ProductAttributeInput
} from '../validators/product-attribute.validator';

type Tx = Prisma.TransactionClient;
type Scope = number | null;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const visible = (companyId: Scope) =>
  companyId === null ? { companyId: null } : { OR: [{ companyId: null }, { companyId }] };
const optionsInclude = (companyId: Scope) => ({
  options: { where: visible(companyId), orderBy: { id: 'asc' as const } }
});
const revision = (options: ProductAttributeOption[], companyId: Scope) =>
  hash(
    options
      .filter((o) => o.companyId === companyId)
      .map((o) => [o.id, o.label, o.active, o.updatedAt.toISOString()])
  );
function present(item: ProductAttribute & { options: ProductAttributeOption[] }, companyId: Scope) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    unit: item.unit,
    active: item.active,
    version: item.version,
    scope: item.companyId === null ? 'global' : 'company',
    revision: revision(item.options, companyId),
    options: item.options.map((o) => ({
      id: o.id,
      label: o.label,
      active: o.active,
      scope: o.companyId === null ? 'global' : 'company'
    }))
  };
}
async function find(tx: Tx, companyId: Scope, id: string) {
  const item = await tx.productAttribute.findFirst({
    where: { id, ...visible(companyId) },
    include: optionsInclude(companyId)
  });
  if (!item) throw new BizzError(404, 'Característica não encontrada.');
  return item;
}
async function lock(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ProductAttribute" WHERE id = ${id}::uuid FOR UPDATE`;
}
async function writeOptions(
  tx: Tx,
  attributeId: string,
  owner: Scope,
  input: AttributeInput['options']
) {
  const existing = await tx.productAttributeOption.findMany({
    where: { attributeId, companyId: owner }
  });
  // Existing options are inactivated explicitly, never removed through an incomplete/stale form.
  if (existing.some((o) => !input.some((v) => v.id === o.id)))
    throw new BizzError(
      409,
      'A lista de valores mudou. Reabra o cadastro. Para remover um valor, inative-o.'
    );
  for (const value of input) {
    const current = value.id ? existing.find((o) => o.id === value.id) : undefined;
    if (value.id && !current) throw new BizzError(400, 'Valor não pertence a este cadastro.');
    const labelKey = attributeKey(value.label);
    if (
      owner !== null &&
      (!current || current.labelKey !== labelKey) &&
      (await tx.productAttributeOption.findFirst({
        where: { attributeId, companyId: null, labelKey }
      }))
    )
      throw new BizzError(409, `O valor "${value.label}" já existe no catálogo global.`);
    if (
      current &&
      labelKey !== current.labelKey &&
      (await tx.productAttributeValue.count({
        where: { optionId: current.id }
      }))
    )
      throw new BizzError(409, 'Um valor em uso não pode ser renomeado. Inative-o e crie outro.');
    const data = { label: value.label, labelKey, active: value.active };
    if (current) {
      if (current.label !== value.label || current.active !== value.active)
        await tx.productAttributeOption.update({ where: { id: current.id }, data });
    } else
      await tx.productAttributeOption.create({ data: { ...data, attributeId, companyId: owner } });
  }
}
export default class ProductAttributeService {
  static async get(companyId: Scope, id: string) {
    return present(await find(prisma, companyId, id), companyId);
  }
  static async list(companyId: Scope, filters: z.infer<typeof attributeListSchema>) {
    const where: Prisma.ProductAttributeWhereInput = {
      AND: [
        visible(companyId),
        filters.scope === 'global'
          ? { companyId: null }
          : filters.scope === 'company'
            ? { companyId: companyId ?? -1 }
            : {}
      ],
      ...(filters.q ? { nameKey: { contains: attributeKey(filters.q) } } : {}),
      ...(filters.status === 'all' ? {} : { active: filters.status === 'active' })
    };
    const [items, total] = await prisma.$transaction(
      [
        prisma.productAttribute.findMany({
          where,
          include: optionsInclude(companyId),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (filters.page - 1) * 20
        }),
        prisma.productAttribute.count({ where })
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    return {
      items: items.map((item) => present(item, companyId)),
      total,
      page: filters.page,
      pageSize: 20
    };
  }
  static async create(
    companyId: Scope,
    userId: number,
    input: z.infer<typeof createAttributeSchema>
  ) {
    const { options, requestKey, ...data } = input;
    if (options.some((o) => o.id))
      throw new BizzError(400, 'Novos valores não devem informar identificador.');
    const requestHash = hash(input);
    const replay = async () => {
      const found = await prisma.productAttribute.findFirst({
        where: { companyId, requestKey },
        include: optionsInclude(companyId)
      });
      if (!found) return null;
      if (found.requestHash !== requestHash)
        throw new BizzError(409, 'Esta tentativa já foi utilizada. Reabra o cadastro.');
      return present(found, companyId);
    };
    const found = await replay();
    if (found) return found;
    try {
      return await prisma.$transaction(async (tx) => {
        const nameKey = attributeKey(data.name);
        if (await tx.productAttribute.findFirst({ where: { nameKey, ...visible(companyId) } }))
          throw new BizzError(
            409,
            'Já existe uma característica com este nome. Utilize o cadastro existente.'
          );
        const item = await tx.productAttribute.create({
          data: {
            ...data,
            nameKey,
            companyId,
            requestKey,
            requestHash,
            createdById: userId,
            updatedById: userId
          }
        });
        await writeOptions(tx, item.id, companyId, options);
        return present(await find(tx, companyId, item.id), companyId);
      });
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
        (error instanceof BizzError && error.status === 409)
      ) {
        const duplicate = await replay();
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }
  static async update(companyId: Scope, userId: number, id: string, input: AttributeInput) {
    return prisma.$transaction(async (tx) => {
      await find(tx, companyId, id);
      await lock(tx, id);
      const current = await find(tx, companyId, id);
      if (current.companyId !== companyId)
        throw new BizzError(403, 'Características globais são administradas no Zenit Admin.');
      if (current.version !== input.version)
        throw new BizzError(409, 'Este cadastro mudou. Reabra para conferir a versão atual.');
      // Type and unit define the meaning of stored values, including company extensions.
      if (
        (current.type !== input.type || current.unit !== input.unit) &&
        ((await tx.productAttributeValue.count({ where: { attributeId: id } })) ||
          (await tx.productAttributeOption.count({ where: { attributeId: id } })))
      )
        throw new BizzError(
          409,
          'Não é possível alterar tipo ou unidade de uma característica com valores cadastrados.'
        );
      const { options, version: _version, ...data } = input;
      const nameKey = attributeKey(data.name);
      if (
        await tx.productAttribute.findFirst({
          where: { id: { not: id }, nameKey, ...visible(companyId) }
        })
      )
        throw new BizzError(409, 'Já existe uma característica com este nome.');
      await writeOptions(tx, id, companyId, options);
      await tx.productAttribute.update({
        where: { id },
        data: {
          ...data,
          nameKey,
          version: { increment: 1 },
          updatedById: userId
        }
      });
      return present(await find(tx, companyId, id), companyId);
    });
  }
  static async companyOptions(
    companyId: number,
    id: string,
    input: z.infer<typeof companyOptionsSchema>
  ) {
    return prisma.$transaction(async (tx) => {
      await find(tx, companyId, id);
      await lock(tx, id);
      const current = await find(tx, companyId, id);
      if (current.companyId !== null || current.type !== 'SELECT')
        throw new BizzError(400, 'Esta operação exige uma característica global do tipo Lista.');
      if (!current.active) throw new BizzError(409, 'Esta característica está inativa.');
      if (revision(current.options, companyId) !== input.revision)
        throw new BizzError(409, 'Os valores da empresa mudaram. Reabra o cadastro.');
      await writeOptions(tx, id, companyId, input.options);
      return present(await find(tx, companyId, id), companyId);
    });
  }
}

export const productValuesInclude = {
  attribute: { select: { id: true, name: true, type: true, unit: true, active: true } },
  option: { select: { id: true, label: true, active: true } }
} satisfies Prisma.ProductAttributeValueInclude;

/** Called in the catalog transaction. Locks serialize definition/option edits with product writes. */
export async function saveProductAttributes(
  tx: Tx,
  companyId: number,
  itemId: string,
  kind: string,
  input: ProductAttributeInput | undefined
) {
  const existing = await tx.productAttributeValue.findMany({ where: { itemId } });
  if (kind !== 'PRODUCT' && (input?.length || (input === undefined && existing.length)))
    throw new BizzError(400, 'Remova as características antes de mudar o cadastro para serviço.');
  if (input === undefined) return; // Older clients must not erase attributes.
  for (const value of [...input].sort((a, b) => a.attributeId.localeCompare(b.attributeId))) {
    await tx.$queryRaw`SELECT id FROM "ProductAttribute" WHERE id = ${value.attributeId}::uuid FOR SHARE`;
    const attr = await find(tx, companyId, value.attributeId);
    const previous = existing.find((v) => v.attributeId === attr.id);
    const optionId = value.optionId ?? null;
    const textValue = value.textValue ?? null;
    const numberValue = value.numberValue == null ? null : new Prisma.Decimal(value.numberValue);
    const unchanged =
      previous &&
      previous.optionId === optionId &&
      previous.textValue === textValue &&
      (previous.numberValue?.toString() ?? null) === (numberValue?.toString() ?? null);
    if (!attr.active && !unchanged)
      throw new BizzError(400, `A característica "${attr.name}" está inativa.`);
    if (attr.type === 'SELECT') {
      const option = attr.options.find((o) => o.id === optionId);
      if (!option || textValue !== null || numberValue !== null)
        throw new BizzError(400, `Selecione um valor válido para "${attr.name}".`);
      if (!option.active && !unchanged)
        throw new BizzError(400, `O valor "${option.label}" está inativo.`);
    } else if (
      attr.type === 'TEXT'
        ? textValue === null || optionId !== null || numberValue !== null
        : numberValue === null || optionId !== null || textValue !== null
    )
      throw new BizzError(400, `Informe um valor válido para "${attr.name}".`);
  }
  await tx.productAttributeValue.deleteMany({ where: { itemId } });
  if (input.length)
    await tx.productAttributeValue.createMany({
      data: input.map((v) => ({
        itemId,
        attributeId: v.attributeId,
        optionId: v.optionId ?? null,
        textValue: v.textValue ?? null,
        numberValue: v.numberValue ?? null
      }))
    });
}
