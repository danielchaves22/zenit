import { describe, expect, it } from 'vitest';
import { buildInstallmentPreview } from '@/utils/installmentPlans';

describe('buildInstallmentPreview', () => {
  it('divide o valor total e concentra o arredondamento na ultima parcela', () => {
    expect(buildInstallmentPreview(100, 3, '2026-09-10')).toEqual([
      { installmentNumber: 1, totalInstallments: 3, amount: 33.33, dueDate: '2026-09-10' },
      { installmentNumber: 2, totalInstallments: 3, amount: 33.33, dueDate: '2026-10-10' },
      { installmentNumber: 3, totalInstallments: 3, amount: 33.34, dueDate: '2026-11-10' }
    ]);
  });

  it('preserva o fim do mes usando o ultimo dia valido', () => {
    const preview = buildInstallmentPreview(300, 3, '2026-01-31');

    expect(preview.map((item) => item.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31'
    ]);
  });

  it('rejeita quantidade ou valor que nao formem parcelas validas', () => {
    expect(buildInstallmentPreview(10, 1, '2026-09-10')).toEqual([]);
    expect(buildInstallmentPreview(0.01, 2, '2026-09-10')).toEqual([]);
  });
});
