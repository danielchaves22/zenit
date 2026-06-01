import { Decimal } from '@prisma/client/runtime/library';
import { multiplyDecimal, parseDecimal, sumDecimal } from '../../src/utils/money';

describe('Utils money', () => {
  it('preserves dot-decimal strings', () => {
    const value = parseDecimal('1786.91');
    expect(value.toNumber()).toBeCloseTo(1786.91, 2);
  });

  it('preserves formatted Brazilian currency strings', () => {
    const value = parseDecimal('R$ 1.786,91');
    expect(value.toNumber()).toBeCloseTo(1786.91, 2);
  });

  it('sumDecimal adds values with precision', () => {
    const total = sumDecimal(1.2, '2,3', new Decimal(3));
    expect(total.toNumber()).toBeCloseTo(6.5, 2);
  });

  it('multiplyDecimal multiplies values with precision', () => {
    const result = multiplyDecimal(2, '3', new Decimal(1.5));
    expect(result.toNumber()).toBeCloseTo(9, 2);
  });
});
