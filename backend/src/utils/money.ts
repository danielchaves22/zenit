import { Decimal } from '@prisma/client/runtime/library';

function normalizeDecimalString(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  const isNegative = trimmed.includes('-');
  const sanitized = trimmed.replace(/[^\d.,-]/g, '').replace(/-/g, '');

  if (!sanitized) {
    return isNegative ? '-0' : sanitized;
  }

  const normalizeWithSeparator = (separator: ',' | '.') => {
    const lastSeparatorIndex = sanitized.lastIndexOf(separator);
    const digitsAfterSeparator = sanitized.length - lastSeparatorIndex - 1;
    const hasDecimalPart = digitsAfterSeparator > 0 && digitsAfterSeparator <= 2;

    if (!hasDecimalPart) {
      return sanitized.replace(/[.,]/g, '');
    }

    const integerPart = sanitized.slice(0, lastSeparatorIndex).replace(/[.,]/g, '');
    const fractionalPart = sanitized.slice(lastSeparatorIndex + 1).replace(/[.,]/g, '');

    return `${integerPart || '0'}.${fractionalPart}`;
  };

  const commaIndex = sanitized.lastIndexOf(',');
  const dotIndex = sanitized.lastIndexOf('.');

  let normalized: string;

  if (commaIndex !== -1 && dotIndex !== -1) {
    normalized = normalizeWithSeparator(commaIndex > dotIndex ? ',' : '.');
  } else if (commaIndex !== -1) {
    normalized = normalizeWithSeparator(',');
  } else if (dotIndex !== -1) {
    normalized = normalizeWithSeparator('.');
  } else {
    normalized = sanitized;
  }

  if (!normalized) {
    normalized = '0';
  }

  return isNegative && normalized !== '0' ? `-${normalized}` : normalized;
}

export function formatCurrency(value: number | string | Decimal): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numericValue);
}

export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === 'string') {
    value = normalizeDecimalString(value);
  }

  return new Decimal(value);
}

export function roundTo2Decimals(value: Decimal): Decimal {
  return new Decimal(value.toFixed(2));
}

export function parseDecimal(value: string | number | Decimal): Decimal {
  return roundTo2Decimals(toDecimal(value));
}

export function sumDecimal(...values: (number | string | Decimal)[]): Decimal {
  if (values.length === 0) {
    return new Decimal(0);
  }

  let result = new Decimal(0);

  for (const value of values) {
    result = result.plus(toDecimal(value));
  }

  return roundTo2Decimals(result);
}

export function subtractDecimal(
  from: number | string | Decimal,
  ...values: (number | string | Decimal)[]
): Decimal {
  if (values.length === 0) {
    return toDecimal(from);
  }

  let result = toDecimal(from);

  for (const value of values) {
    result = result.minus(toDecimal(value));
  }

  return roundTo2Decimals(result);
}

export function multiplyDecimal(...values: (number | string | Decimal)[]): Decimal {
  if (values.length === 0) {
    return new Decimal(1);
  }

  let result = new Decimal(1);

  for (const value of values) {
    result = result.times(toDecimal(value));
  }

  return roundTo2Decimals(result);
}

export function divideDecimal(
  dividend: number | string | Decimal,
  divisor: number | string | Decimal
): Decimal {
  const decimalDivisor = toDecimal(divisor);

  if (decimalDivisor.equals(0)) {
    throw new Error('Divisao por zero nao permitida');
  }

  const division = toDecimal(dividend).div(decimalDivisor);
  return roundTo2Decimals(division);
}
