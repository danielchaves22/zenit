export const CONTACTS_PATH = '/pessoas';
export type Relationship = 'all' | 'customer' | 'supplier' | 'both' | 'none';

export function contactFilters(query: Record<string, string | string[] | undefined>) {
  const role =
    typeof query.role === 'string' && ['customer', 'supplier', 'both', 'none'].includes(query.role)
      ? (query.role as Relationship)
      : 'all';
  const personType =
    typeof query.personType === 'string' && ['PERSON', 'BUSINESS'].includes(query.personType)
      ? query.personType
      : 'all';
  const status =
    typeof query.status === 'string' && ['inactive', 'all'].includes(query.status)
      ? query.status
      : 'active';
  const parsedPage = Number(query.page);
  return {
    q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
    role,
    personType,
    status,
    page: String(Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1)
  };
}
