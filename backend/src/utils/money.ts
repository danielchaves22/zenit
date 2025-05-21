import { Decimal } from '@prisma/client/runtime/library';

/**
 * Formata valor para exibição no formato da moeda brasileira
 */
export function formatCurrency(value: number | string | Decimal): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numericValue);
}

/**
 * Converte para o tipo Decimal
 * Este helper garante que teremos sempre um Decimal de volta
 */
export function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  // Se for string, limpa formatação e converte vírgula para ponto
  if (typeof value === 'string') {
    value = value
      .replace(/[^\d,-]/g, '') // Remove tudo exceto números, vírgulas e hífens
      .replace(',', '.'); // Substitui vírgula por ponto
  }
  
  return new Decimal(value);
}

/**
 * Arredonda para 2 casas decimais
 * Utiliza toFixed e depois reconverte para Decimal
 */
export function roundTo2Decimals(value: Decimal): Decimal {
  // Arredonda para 2 casas e depois reconverte para garantir Decimal
  return new Decimal(value.toFixed(2));
}

/**
 * Converte string/number para decimal com 2 casas, adequado para armazenamento
 */
export function parseDecimal(value: string | number | Decimal): Decimal {
  // Garantir que temos um Decimal e depois fixar 2 casas
  const decimal = toDecimal(value);
  // Retorna um decimal com 2 casas
  return roundTo2Decimals(decimal);
}

/**
 * Soma valores decimais com precisão
 */
export function sumDecimal(...values: (number | string | Decimal)[]): Decimal {
  if (values.length === 0) {
    return new Decimal(0);
  }
  
  // Começamos com zero
  let result = new Decimal(0);
  
  // Iteramos sobre cada valor para evitar problemas com reduce e tipagem
  for (const value of values) {
    result = result.plus(toDecimal(value));
  }
  
  return roundTo2Decimals(result);
}

/**
 * Subtrai valores decimais com precisão
 */
export function subtractDecimal(from: number | string | Decimal, ...values: (number | string | Decimal)[]): Decimal {
  if (values.length === 0) {
    return toDecimal(from);
  }
  
  // Começamos com o valor inicial
  let result = toDecimal(from);
  
  // Iteramos sobre os valores a subtrair para evitar problemas com reduce
  for (const value of values) {
    result = result.minus(toDecimal(value));
  }
  
  return roundTo2Decimals(result);
}

/**
 * Multiplica valores decimais com precisão
 */
export function multiplyDecimal(...values: (number | string | Decimal)[]): Decimal {
  if (values.length === 0) {
    return new Decimal(1);
  }
  
  // Começamos com um
  let result = new Decimal(1);
  
  // Iteramos sobre cada valor para evitar problemas com reduce e tipagem
  for (const value of values) {
    result = result.times(toDecimal(value));
  }
  
  return roundTo2Decimals(result);
}

/**
 * Divide valores decimais com precisão
 */
export function divideDecimal(dividend: number | string | Decimal, divisor: number | string | Decimal): Decimal {
  const decimalDivisor = toDecimal(divisor);
  if (decimalDivisor.equals(0)) {
    throw new Error('Divisão por zero não permitida');
  }
  const division = toDecimal(dividend).div(decimalDivisor);
  return roundTo2Decimals(division);
}