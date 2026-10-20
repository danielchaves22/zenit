export type AttributeType = 'SELECT' | 'TEXT' | 'NUMBER';
export interface AttributeOption {
  id: string;
  label: string;
  active: boolean;
  scope: 'global' | 'company';
}
export interface ProductAttribute {
  id: string;
  name: string;
  description: string;
  type: AttributeType;
  unit: string;
  active: boolean;
  version: number;
  scope: 'global' | 'company';
  revision: string;
  options: AttributeOption[];
}
export interface AttributeValue {
  attributeId: string;
  optionId?: string | null;
  textValue?: string | null;
  numberValue?: string | null;
  attribute?: Pick<ProductAttribute, 'id' | 'name' | 'type' | 'unit' | 'active'>;
  option?: Pick<AttributeOption, 'id' | 'label' | 'active'> | null;
}
export interface AttributeListResult {
  items: ProductAttribute[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AttributeFilters {
  q: string;
  status: string;
  scope: string;
  page: string;
}
export const attributeFilters = (
  query: Record<string, string | string[] | undefined>
): AttributeFilters => ({
  q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
  status: query.status === 'all' || query.status === 'inactive' ? query.status : 'active',
  scope: query.scope === 'global' || query.scope === 'company' ? query.scope : 'all',
  page:
    /^\d+$/.test(String(query.page)) && Number(query.page) > 0 && Number(query.page) <= 100000
      ? String(query.page)
      : '1'
});
export type AttributeApi = <T>(
  path: string,
  options?: {
    method?: string;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<T>;
export const typeLabel: Record<AttributeType, string> = {
  SELECT: 'Lista',
  TEXT: 'Texto',
  NUMBER: 'Número'
};
export const attributeError = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
