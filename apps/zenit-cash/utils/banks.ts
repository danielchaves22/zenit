import { buildPublicAssetUrl } from '@/utils/assets';

export interface FinancialBank {
  id: number;
  code: string;
  name: string;
  iconSlug: string;
  iconPath?: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface FinancialBankReference {
  id?: number | null;
  code?: string | null;
  name?: string | null;
  iconSlug?: string | null;
  iconPath?: string | null;
}

export type CreditCardReconciliationSourceType =
  | 'CAIXA_PDF'
  | 'BRADESCO_CSV'
  | 'NUBANK_CSV';

export function normalizeBankText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function getBankIconUrl(bank?: FinancialBankReference | null) {
  return buildPublicAssetUrl(bank?.iconPath || null);
}

export function getBankDisplayName(
  bank?: FinancialBankReference | null,
  fallbackName?: string | null
) {
  return bank?.name || fallbackName?.trim() || null;
}

export function findBankById(banks: FinancialBank[], bankId?: number | null) {
  if (!bankId) {
    return null;
  }

  return banks.find((bank) => bank.id === bankId) || null;
}

export function findBankByLegacyFields(
  banks: FinancialBank[],
  bankId?: number | null,
  bankCode?: string | null,
  bankName?: string | null
) {
  const byId = findBankById(banks, bankId);
  if (byId) {
    return byId;
  }

  if (bankCode?.trim()) {
    const normalizedCode = normalizeBankText(bankCode);
    const byCode = banks.find((bank) => normalizeBankText(bank.code) === normalizedCode);

    if (byCode) {
      return byCode;
    }
  }

  if (bankName?.trim()) {
    const normalizedName = normalizeBankText(bankName);
    return (
      banks.find((bank) => normalizeBankText(bank.name) === normalizedName) || null
    );
  }

  return null;
}

export function getBankBySelectValue(banks: FinancialBank[], value: string) {
  if (!value) {
    return null;
  }

  const bankId = Number(value);
  if (Number.isNaN(bankId)) {
    return null;
  }

  return findBankById(banks, bankId);
}

export function getBankInitials(name?: string | null) {
  if (!name?.trim()) {
    return 'BK';
  }

  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

export function isCaixaBankReference(
  bank?: FinancialBankReference | null,
  fallbackCode?: string | null,
  fallbackName?: string | null
) {
  const normalizedCode = normalizeBankText(bank?.code || fallbackCode || '');
  const normalizedName = normalizeBankText(bank?.name || fallbackName || '');

  return (
    normalizedCode === normalizeBankText('CAIXA_ECONOMICA_FEDERAL') ||
    normalizedName === normalizeBankText('Caixa Economica Federal')
  );
}

export function isBradescoBankReference(
  bank?: FinancialBankReference | null,
  fallbackCode?: string | null,
  fallbackName?: string | null
) {
  const normalizedCode = normalizeBankText(bank?.code || fallbackCode || '');
  const normalizedName = normalizeBankText(bank?.name || fallbackName || '');

  return (
    normalizedCode === normalizeBankText('BRADESCO') ||
    normalizedName === normalizeBankText('Bradesco')
  );
}

export function isNubankBankReference(
  bank?: FinancialBankReference | null,
  fallbackCode?: string | null,
  fallbackName?: string | null
) {
  const normalizedCode = normalizeBankText(bank?.code || fallbackCode || '');
  const normalizedName = normalizeBankText(bank?.name || fallbackName || '');

  return (
    normalizedCode === normalizeBankText('NUBANK') ||
    normalizedName === normalizeBankText('Nubank')
  );
}

export function getCreditCardReconciliationSourceType(
  bank?: FinancialBankReference | null,
  fallbackCode?: string | null,
  fallbackName?: string | null
): CreditCardReconciliationSourceType | null {
  if (isCaixaBankReference(bank, fallbackCode, fallbackName)) {
    return 'CAIXA_PDF';
  }

  if (isBradescoBankReference(bank, fallbackCode, fallbackName)) {
    return 'BRADESCO_CSV';
  }

  if (isNubankBankReference(bank, fallbackCode, fallbackName)) {
    return 'NUBANK_CSV';
  }

  return null;
}
