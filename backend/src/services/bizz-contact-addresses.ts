import { createHash } from 'crypto';
import { BizzContact, Prisma } from '@prisma/client';
import { BizzContactAddressInput } from '../validators/bizz-contact.validator';
import GeographyService, { BrazilLocation } from './geography.service';
import { contactAddress } from './bizz-contact-address';
import { BizzError } from './bizz-error';

export const addressKeys = [
  'postalCode',
  'street',
  'addressNumber',
  'complement',
  'neighborhood',
  'city',
  'cityIbgeCode',
  'state',
  'country'
] as const;
type Fields = Pick<BizzContact, (typeof addressKeys)[number]>;
export const addressSelect = {
  id: true,
  label: true,
  position: true,
  postalCode: true,
  street: true,
  addressNumber: true,
  complement: true,
  neighborhood: true,
  city: true,
  cityIbgeCode: true,
  state: true,
  country: true
} satisfies Prisma.BizzContactAddressSelect;
type StoredAddress = Prisma.BizzContactAddressGetPayload<{ select: typeof addressSelect }>;
type Address = Fields & { id?: string; label: string | null; position: number };
type Legacy = Fields & { id: string; addresses: StoredAddress[] };
export function addressFields(value?: Partial<Fields>): Fields {
  return Object.fromEntries(
    addressKeys.map((field) => [field, value?.[field] ?? null])
  ) as Fields;
}
function hasAddress(value: Partial<Fields>) {
  return addressKeys.some((field) => Boolean(value[field]));
}
export function existingAddresses(contact: Legacy): StoredAddress[] {
  if (contact.addresses.length) return contact.addresses;
  if (!hasAddress(contact)) return [];
  // Same ID as the migration, including records written by an older server after migration.
  const hex = createHash('md5').update(`${contact.id}:ADDRESS`).digest('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return [{ ...addressFields(contact), id, label: null, position: 0 }];
}
export function presentAddresses(contact: Legacy) {
  return existingAddresses(contact).map(({ position: _position, ...address }) => ({
    ...address,
    location: GeographyService.match(address)
  }));
}
export function prepareAddresses(
  supplied: BizzContactAddressInput[] | undefined,
  input: Partial<Fields>,
  location?: BrazilLocation,
  existing?: Legacy
): Address[] {
  const current = existing ? existingAddresses(existing) : [];
  if (supplied !== undefined) {
    return supplied.map((value, position) => {
      const previous = value.id ? current.find((item) => item.id === value.id) : undefined;
      if (value.id && !previous)
        throw new BizzError(
          400,
          'Endereço não encontrado neste cadastro. Reabra a página e tente novamente.'
        );
      const raw = Object.fromEntries(
        addressKeys
          .filter((field) => field in value)
          .map((field) => [field, value[field as keyof BizzContactAddressInput]])
      );
      const fields = {
        ...addressFields(previous),
        ...raw,
        ...contactAddress(value, value.location, previous)
      } as Fields;
      if (!hasAddress(fields))
        throw new BizzError(400, `Preencha ou remova o endereço ${position + 1}.`);
      return {
        ...fields,
        id: value.id,
        label: value.label === undefined ? (previous?.label ?? null) : value.label,
        position
      };
    });
  }
  // Legacy editors change only the primary address; additional addresses and their IDs survive.
  if (
    existing &&
    location === undefined &&
    addressKeys.every((field) => input[field] === undefined)
  )
    return current;
  const previous = current[0];
  const fields = {
    ...addressFields(previous),
    ...input,
    ...contactAddress(input, location, previous)
  };
  const primary = {
    ...addressFields(fields),
    id: previous?.id,
    label: previous?.label ?? null,
    position: 0
  };
  return [...(hasAddress(primary) ? [primary] : []), ...current.slice(1)].map(
    (address, position) => ({ ...address, position })
  );
}
export async function saveAddresses(
  tx: Prisma.TransactionClient,
  contactId: string,
  rows: Address[],
  stored: StoredAddress[]
) {
  const keptIds = rows.flatMap((row) => (row.id ? [row.id] : []));
  await tx.bizzContactAddress.deleteMany({ where: { contactId, id: { notIn: keptIds } } });
  // Move existing positions out of the target range before changing order, preserving stable IDs.
  const offset = Math.max(0, ...stored.map((row) => row.position)) + rows.length + 1;
  await tx.bizzContactAddress.updateMany({
    where: { contactId },
    data: { position: { increment: offset } }
  });
  for (const row of rows) {
    const { id, ...data } = row;
    if (id && stored.some((address) => address.id === id))
      await tx.bizzContactAddress.update({ where: { id, contactId }, data });
    else
      await tx.bizzContactAddress.create({
        data: { ...data, ...(id ? { id } : {}), contactId }
      });
  }
}
