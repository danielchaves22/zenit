import { createHash } from 'crypto';
import { BizzContactMethodKind, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  CreateBizzContact,
  UpdateBizzContact,
  bizzContactListSchema
} from '../validators/bizz-contact.validator';
import { z } from 'zod';
import GeographyService from './geography.service';
import {
  addressFields,
  addressSelect,
  prepareAddresses,
  presentAddresses,
  saveAddresses
} from './bizz-contact-addresses';

import { BizzError } from './bizz-error';
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
  updatedAt: true,
  postalCode: true,
  street: true,
  addressNumber: true,
  complement: true,
  neighborhood: true,
  city: true,
  cityIbgeCode: true,
  state: true,
  country: true,
  addresses: { select: addressSelect, orderBy: { position: 'asc' } },
  methods: {
    select: { kind: true, value: true, position: true },
    orderBy: [{ kind: 'asc' }, { position: 'asc' }]
  }
} satisfies Prisma.BizzContactSelect;

type ContactRow = Prisma.BizzContactGetPayload<{ select: typeof publicFields }>;
function present({ methods, ...contact }: ContactRow) {
  const values = (kind: BizzContactMethodKind, legacy: string | null) => {
    const items = methods
      .filter((method) => method.kind === kind)
      .map((method) => method.value);
    return items.length ? items : legacy ? [legacy] : [];
  };
  return {
    ...contact,
    addresses: presentAddresses(contact),
    location: GeographyService.match(contact),
    phones: values('PHONE', contact.phone),
    emails: values('EMAIL', contact.email)
  };
}
function methodRows(phones: string[], emails: string[]) {
  return [
    ...phones.map((value, position) => ({
      kind: BizzContactMethodKind.PHONE,
      value,
      position
    })),
    ...emails.map((value, position) => ({
      kind: BizzContactMethodKind.EMAIL,
      value,
      position
    }))
  ];
}
// A legacy editor can change its one field without dropping values it cannot display.
function replaceFirst(values: string[], first: string | null, phone = false) {
  const next = [...(first ? [first] : []), ...values.slice(1)];
  const seen = new Set<string>();
  return next.filter((value) => {
    const key = phone ? value.replace(/\D/g, '') || value.toLowerCase() : value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default class BizzContactService {
  static async get(companyId: number, id: string) {
    const contact = await prisma.bizzContact.findFirst({
      where: { id, companyId },
      select: publicFields
    });
    if (!contact) throw new BizzError(404, 'Cadastro não encontrado nesta empresa.');
    return present(contact);
  }

  static async list(companyId: number, filters: z.infer<typeof bizzContactListSchema>) {
    const documentQuery = filters.q.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const phoneQuery = /^[+\d\s().-]+$/.test(filters.q) ? filters.q.replace(/\D/g, '') : '';
    const where: Prisma.BizzContactWhereInput = {
      companyId,
      ...(filters.status === 'all' ? {} : { active: filters.status === 'active' }),
      ...(filters.personType === 'all' ? {} : { personType: filters.personType }),
      ...(filters.role === 'customer'
        ? { isCustomer: true }
        : filters.role === 'supplier'
          ? { isSupplier: true }
          : filters.role === 'both'
            ? { isCustomer: true, isSupplier: true }
            : filters.role === 'none'
              ? { isCustomer: false, isSupplier: false }
              : {}),
      ...(filters.q
        ? {
            OR: [
              ...['name', 'email', 'phone'].map((field) => ({
                [field]: { contains: filters.q, mode: 'insensitive' }
              })),
              {
                methods: {
                  some: { value: { contains: filters.q, mode: 'insensitive' } }
                }
              },
              ...(phoneQuery && phoneQuery !== filters.q
                ? [
                    { phone: { contains: phoneQuery } },
                    {
                      methods: {
                        some: {
                          kind: BizzContactMethodKind.PHONE,
                          value: { contains: phoneQuery }
                        }
                      }
                    }
                  ]
                : []),
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
    return {
      items: items.map(present),
      total,
      page: filters.page,
      pageSize: 20
    };
  }

  static async create(companyId: number, userId: number, input: CreateBizzContact) {
    const {
      requestKey,
      phones: suppliedPhones,
      emails: suppliedEmails,
      location,
      addresses: suppliedAddresses,
      ...data
    } = input;
    const phones = suppliedPhones ?? (data.phone ? [data.phone] : []);
    const emails = suppliedEmails ?? (data.email ? [data.email] : []);
    data.phone = phones[0] ?? null;
    data.email = emails[0] ?? null;
    // Empty new address fields are equivalent to older requests without an address.
    const legacyAddressFields = new Set([
      'postalCode',
      'street',
      'addressNumber',
      'complement',
      'neighborhood',
      'city',
      'state',
      'country'
    ]);
    const hashData: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) => !legacyAddressFields.has(key) || value != null
      )
    );
    // Single-value requests retain the pre-migration hash, including legacy retries.
    if (phones.length > 1) hashData.phones = phones.slice(1);
    if (emails.length > 1) hashData.emails = emails.slice(1);
    if (location !== undefined) hashData.location = location;
    if (suppliedAddresses !== undefined) hashData.addresses = suppliedAddresses;
    const requestHash = createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
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
      return present(
        await prisma.bizzContact.findUniqueOrThrow({
          where: { id: existing.id },
          select: publicFields
        })
      );
    };
    const existing = await replay();
    if (existing) return { contact: existing, created: false };
    const addresses = prepareAddresses(suppliedAddresses, data, location);
    try {
      const contact = await prisma.bizzContact.create({
        data: {
          ...data,
          ...addressFields(addresses[0]),
          addresses: { create: addresses },
          methods: { create: methodRows(phones, emails) },
          companyId,
          requestKey,
          requestHash,
          createdById: userId,
          updatedById: userId
        },
        select: publicFields
      });
      return { contact: present(contact), created: true };
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
    const {
      version,
      phones: suppliedPhones,
      emails: suppliedEmails,
      location,
      addresses: suppliedAddresses,
      ...data
    } = input;
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.bizzContact.findFirst({
          where: { id, companyId },
          select: publicFields
        });
        if (!existing) throw new BizzError(404, 'Cadastro não encontrado nesta empresa.');
        const current = present(existing);
        const addresses = prepareAddresses(suppliedAddresses, data, location, existing);
        const phones =
          suppliedPhones ??
          (data.phone === undefined
            ? current.phones
            : replaceFirst(current.phones, data.phone, true));
        const emails =
          suppliedEmails ??
          (data.email === undefined
            ? current.emails
            : replaceFirst(current.emails, data.email));
        const result = await tx.bizzContact.updateMany({
          where: { id, companyId, version },
          data: {
            ...data,
            ...addressFields(addresses[0]),
            phone: phones[0] ?? null,
            email: emails[0] ?? null,
            version: { increment: 1 },
            updatedById: userId
          }
        });
        if (!result.count)
          throw new BizzError(
            409,
            'Este cadastro foi alterado por outra pessoa. Feche e abra novamente para conferir a versão atual.'
          );
        // Only after the scoped version check succeeds, replace this contact's methods atomically.
        await saveAddresses(tx, id, addresses, existing.addresses);
        await tx.bizzContactMethod.deleteMany({ where: { contactId: id } });
        const methods = methodRows(phones, emails);
        if (methods.length)
          await tx.bizzContactMethod.createMany({
            data: methods.map((method) => ({ ...method, contactId: id }))
          });
        return present(
          await tx.bizzContact.findUniqueOrThrow({
            where: { id },
            select: publicFields
          })
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BizzError(409, 'Já existe um cadastro com este documento nesta empresa.');
      }
      throw error;
    }
  }
}
