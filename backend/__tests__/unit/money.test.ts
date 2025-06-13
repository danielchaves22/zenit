import { sumDecimal, multiplyDecimal } from '../../src/utils/money';
import { Decimal } from '@prisma/client/runtime/library';

describe('Utils money', () => {
  it('sumDecimal deve somar valores com precisão', () => {
    const total = sumDecimal(1.2, '2,3', new Decimal(3));
    expect(total.toNumber()).toBeCloseTo(6.5, 2);
  });

  it('multiplyDecimal deve multiplicar valores com precisão', () => {
    const result = multiplyDecimal(2, '3', new Decimal(1.5));
    expect(result.toNumber()).toBeCloseTo(9, 2);
  });
});
