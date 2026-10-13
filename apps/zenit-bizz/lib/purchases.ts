export interface PurchaseInstallment {
  id: number;
  number: number;
  amount: string;
  paidAmount: string | null;
  dueDate: string;
  effectiveDate: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  updatedAt: string;
  account: { id: number; name: string } | null;
  canSettle: boolean;
}
export interface Purchase {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  date: string;
  total: string;
  notes: string | null;
  status: 'PENDING' | 'PAID' | 'CANCELED';
  nextDueDate: string | null;
  paidCount: number;
  installmentCount: number;
  canCancel: boolean;
  items: {
    id: string;
    catalogItemId: string;
    name: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    total: string;
  }[];
  installments: PurchaseInstallment[];
}
export interface PurchaseOptions {
  enabled: boolean;
  accounts: { id: number; name: string; isDefault: boolean }[];
  categories: { id: number; name: string; isDefault: boolean }[];
}
export function purchaseFilters(query: Record<string, string | string[] | undefined>) {
  const page = Number(query.page);
  return {
    q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
    status: ['pending', 'paid', 'canceled'].includes(String(query.status))
      ? String(query.status)
      : 'all',
    page: String(Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1)
  };
}
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const displayDate = (value: string | null) =>
  value ? value.split('-').reverse().join('/') : '—';
export const statusLabel = (value: string) =>
  ({ PENDING: 'A pagar', PAID: 'Pago', COMPLETED: 'Pago', CANCELED: 'Cancelado' })[value] ?? value;
export function decimalInput(value: string, places: number, digits: number) {
  const input = value.trim();
  const text = input.includes(',')
    ? new RegExp(`^(?:\\d+|\\d{1,3}(?:\\.\\d{3})+)(?:,\\d{1,${places}})?$`).test(input)
      ? input.replace(/\./g, '').replace(',', '.')
      : ''
    : input;
  if (!new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,${places}})?$`).test(text))
    throw new Error(`Informe um valor positivo com até ${places} casas decimais.`);
  const [whole, part = ''] = text.split('.');
  const scaled = BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(part.padEnd(places, '0'));
  if (scaled <= BigInt(0)) throw new Error('Informe um valor maior que zero.');
  return { scaled, text: `${BigInt(whole)}.${part.padEnd(places, '0')}` };
}
export const moneyFromCents = (value: bigint) =>
  `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, '0')}`;
export function lineTotal(quantity: string, unitPrice: string) {
  const qty = decimalInput(quantity, 3, 8).scaled;
  const price = decimalInput(unitPrice, 2, 10).scaled;
  return (qty * price + BigInt(500)) / BigInt(1000);
}
export function installmentPreview(total: bigint, count: number, firstDueDate: string) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 60 ||
    total < BigInt(count) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)
  )
    return [];
  const [year, month, day] = firstDueDate.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(Date.UTC(year, month + index, 0)).getUTCDate();
    const dueDate = new Date(Date.UTC(year, month - 1 + index, Math.min(day, end)))
      .toISOString()
      .slice(0, 10);
    return {
      number: index + 1,
      dueDate,
      amount: moneyFromCents(
        index === count - 1
          ? total - (total / BigInt(count)) * BigInt(count - 1)
          : total / BigInt(count)
      )
    };
  });
}
