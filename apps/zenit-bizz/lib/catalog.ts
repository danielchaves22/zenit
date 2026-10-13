export const CATALOG_PATH = '/produtos-servicos';
export type CatalogKind = 'PRODUCT' | 'SERVICE';
export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  canPurchase: boolean;
  canSell: boolean;
  salePrice: string | null;
  active: boolean;
  version: number;
}
export interface CatalogList {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}
export function catalogFilters(query: Record<string, string | string[] | undefined>) {
  const kind = query.kind === 'PRODUCT' || query.kind === 'SERVICE' ? query.kind : 'all';
  const usage =
    query.usage === 'purchase' || query.usage === 'sale' || query.usage === 'both'
      ? query.usage
      : 'all';
  const status = query.status === 'inactive' || query.status === 'all' ? query.status : 'active';
  const page = Number(query.page);
  return {
    q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
    kind,
    usage,
    status,
    page: String(Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1)
  };
}
export function parseSalePrice(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const normalized = text.includes(',')
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)
      ? text.replace(/\./g, '').replace(',', '.')
      : ''
    : text;
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized))
    throw new Error('Informe um preço válido, positivo ou zero, com até duas casas decimais.');
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${decimals.padEnd(2, '0')}`;
}
export function formatSalePrice(value: string | null) {
  if (value === null) return '—';
  const [integer, decimals = '00'] = value.split('.');
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals.padEnd(2, '0')}`;
}
export const usageLabel = (item: Pick<CatalogItem, 'canPurchase' | 'canSell'>) =>
  item.canPurchase && item.canSell ? 'Compra e venda' : item.canPurchase ? 'Compra' : 'Venda';
