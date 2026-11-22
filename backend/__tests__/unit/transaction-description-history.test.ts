jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  financialTransaction: { groupBy: jest.fn() }
} }));
import prisma from '../../src/lib/prisma';
import { rankHistoricalCategories, suggestHistoricalCategories } from '../../src/services/transaction-description-history.service';

const row = (description: string, categoryId: number, frequency = 1) => ({
  description, categoryId, _count: { description: frequency }
});

it('counts matching merchants across source descriptions, not neighboring businesses or generic purchases', () => {
  const rows = [
    row('Compra em Padaria Aurora', 8), row('Padaria Aurora', 8),
    row('Farmácia Aurora', 2, 100), row('Padaria Alameda', 3, 80), row('Compra', 4, 30)
  ];
  expect(rankHistoricalCategories('Compra na padaria Aurora', rows)).toEqual([8]);
  expect(rankHistoricalCategories('Compra', rows)).toEqual([]);
  expect(rankHistoricalCategories('Padaria', rows)).toEqual([]);
  expect(rankHistoricalCategories('Aurora Boreal', rows)).toEqual([]);
});

it('preserves competing historical choices and requires corroboration for a single one', () => {
  const rows = [row('Supermercado Conquista', 3, 2), row('Mercado Conquista', 9)];
  expect(rankHistoricalCategories('Conquista supermercado', rows)).toEqual([3, 9]);
  expect(rankHistoricalCategories('Depieri', [row('DEPÍERI', 5)])).toEqual([]);
  expect(rankHistoricalCategories('Depieri', [row('DEPÍERI', 5, 2)])).toEqual([5]);
});

it('finds distinctive merchants and both accented and unaccented spellings among unrelated labels', async () => {
  const groupBy = prisma.financialTransaction.groupBy as jest.Mock;
  const noise = Array.from({ length: 121 }, (_, i) => row('Irrelevante ' + i, 17));
  const data = [...noise, row('CACAU', 6, 3), row('Padaria Cafe', 2, 3), row('Padaria Café', 7, 2)];
  groupBy.mockImplementation(async ({ where, take }) => {
    const patterns = where.AND[1].AND[0].OR.map((entry: { description: { contains: string } }) =>
      new RegExp(entry.description.contains.replace(/_/g, '.'), 'iu'));
    return data.filter(record => patterns.some((pattern: RegExp) => pattern.test(record.description))).slice(0, take);
  });
  await expect(suggestHistoricalCategories({ companyId: 2, type: 'EXPENSE', description: 'Compra Cacau' })).resolves.toEqual([6]);
  await expect(suggestHistoricalCategories({ companyId: 2, type: 'EXPENSE', description: 'Padaria Cafe' })).resolves.toEqual([2, 7]);
});

it('falls back without querying a partial set of spellings for a long description', async () => {
  const groupBy = prisma.financialTransaction.groupBy as jest.Mock;
  groupBy.mockClear();
  const description = ['aaa', 'aae', 'aao', 'aea', 'aee', 'aeo', 'eaa', 'eae', 'eao', 'eee'].join(' ');
  await expect(suggestHistoricalCategories({ companyId: 2, type: 'EXPENSE', description })).resolves.toEqual([]);
  expect(groupBy).not.toHaveBeenCalled();
});
