import { Contact, ContactAddress } from './types';

export type AddressDraft = ContactAddress & { key: string };
export const addressFields = [
  'postalCode',
  'street',
  'addressNumber',
  'complement',
  'neighborhood',
  'city',
  'state',
  'country'
] as const;
export function emptyAddress(): AddressDraft {
  return {
    key: crypto.randomUUID(),
    label: '',
    postalCode: '',
    street: '',
    addressNumber: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    country: '',
    location: { stateCode: null, cityCode: null }
  };
}
export function initialAddresses(contact: Contact | null): AddressDraft[] {
  if (!contact) return [];
  const addresses =
    contact.addresses ??
    (addressFields.some((field) => contact[field])
      ? [
          {
            ...Object.fromEntries(addressFields.map((field) => [field, contact[field] ?? ''])),
            label: null,
            location: contact.location ?? null
          } as ContactAddress
        ]
      : []);
  return addresses.map(
    (address, index) =>
      ({
        key: address.id ?? `legacy-${index}`,
        ...(address.id ? { id: address.id } : {}),
        label: address.label ?? '',
        ...Object.fromEntries(addressFields.map((field) => [field, address[field] ?? ''])),
        location: address.location ?? null
      }) as AddressDraft
  );
}
export function hasAddressData(address: ContactAddress) {
  return Boolean(
    address.label?.trim() ||
      address.location?.stateCode ||
      address.location?.cityCode ||
      addressFields.some((field) => address[field]?.trim())
  );
}
export function addressPayload(address: AddressDraft) {
  const { key: _key, location, ...data } = address;
  return { ...data, location: location ?? undefined };
}
