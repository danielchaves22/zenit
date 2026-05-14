import { toIsoDateString } from '@/utils/financialStatus';

type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';
type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELED';

type IdValue = string | number | null | undefined;
type TagInput = string | { name: string };

export interface TransactionPayloadSource {
  description: string;
  amount: string | number;
  date: string;
  dueDate?: string | null;
  effectiveDate?: string | null;
  liquidationDate?: string | null;
  type: TransactionKind;
  status: TransactionStatus;
  notes?: string | null;
  fromAccountId?: IdValue;
  toAccountId?: IdValue;
  categoryId?: IdValue;
  fromAccount?: { id?: number | null } | null;
  toAccount?: { id?: number | null } | null;
  category?: { id?: number | null } | null;
  tags?: TagInput[] | string;
  repeatTimes?: string | number | null;
}

function toNullableInt(value: IdValue): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTags(tags?: TagInput[] | string): string[] {
  if (!tags) {
    return [];
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : tag.name.trim()))
    .filter(Boolean);
}

export function buildTransactionUpsertPayload(
  source: TransactionPayloadSource,
  overrides: Partial<TransactionPayloadSource> = {}
): Record<string, unknown> {
  const merged = { ...source, ...overrides };
  const liquidationDate = merged.liquidationDate ?? merged.effectiveDate ?? null;
  const repeatTimesValue = merged.repeatTimes;

  return {
    description: merged.description,
    amount: typeof merged.amount === 'number' ? merged.amount : parseFloat(merged.amount || '0'),
    date: toIsoDateString(merged.date),
    dueDate: toIsoDateString(merged.dueDate ?? null),
    effectiveDate: toIsoDateString(liquidationDate),
    type: merged.type,
    status: merged.status,
    notes: merged.notes || '',
    fromAccountId: toNullableInt(merged.fromAccountId ?? merged.fromAccount?.id),
    toAccountId: toNullableInt(merged.toAccountId ?? merged.toAccount?.id),
    categoryId: toNullableInt(merged.categoryId ?? merged.category?.id),
    tags: normalizeTags(merged.tags),
    repeatTimes:
      repeatTimesValue === '' || repeatTimesValue === null || repeatTimesValue === undefined
        ? 0
        : Number(repeatTimesValue)
  };
}
