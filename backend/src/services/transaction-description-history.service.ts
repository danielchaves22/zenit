import { Prisma, TransactionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { buildOperationalTransactionWhere } from '../utils/financial-transaction-query';

/** The same description/category frequency used by the web autocomplete. */
export function getDescriptionFrequencies(companyId: number, type: TransactionType, match: Prisma.FinancialTransactionWhereInput, limit: number) {
  return prisma.financialTransaction.groupBy({
    by: ['description', 'categoryId'],
    where: { companyId, type, AND: [buildOperationalTransactionWhere(), match] },
    _count: { description: true },
    orderBy: [{ _count: { description: 'desc' } }, { categoryId: 'asc' }, { description: 'asc' }],
    take: limit
  });
}

// A shared payment method or line of business is insufficient to identify a merchant.
const commonWords = new Set((
  'uma uns umas para pela pelo pelos pelas com das dos que sem hoje ontem ' +
  'compra compras comprei paguei pagamento pagamentos gastei gasto gastos despesa despesas ' +
  'receita receitas recebi recebimento pix debito credito cartao dinheiro reais real parcela parcelas mensal mensalidade ' +
  'loja lojas unidade ltda limitada comercio comercial servico servicos'
).split(' '));
const businessKinds = new Map<string, string>();
for (const group of ['padaria panificadora', 'frutaria hortifruti sacolao varejao', 'restaurante', 'lanchonete',
  'pizzaria', 'cafeteria', 'mercado supermercado hipermercado', 'drogaria farmacia', 'posto', 'livraria', 'papelaria', 'oficina', 'hotel']) {
  for (const word of group.split(' ')) businessKinds.set(word, group);
}

function descriptionWords(description: string) {
  return description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
}

function merchantWords(words: string[]) {
  return [...new Set(words.filter(word =>
    word.length >= 3 && !/^\d+$/.test(word) && !commonWords.has(word) && !businessKinds.has(word)))];
}

type DescriptionFrequency = { description: string; categoryId: number | null; _count: { description: number } };

// ILIKE is case-insensitive but accent-sensitive in Postgres. Preserve consonants and
// at least three literal positions per word; expand accented forms at the cheapest
// positions and use a single-character wildcard for the rest. The whole-word check
// below discards unrelated candidates. "cacau", for example, never becomes "_____".
const accentForms: Record<string, string> = { a: 'aáàâãä', e: 'eéêèë', i: 'iíï', o: 'oóôõö', u: 'uúü', c: 'cç', n: 'nñ' };
function merchantPatterns(word: string): string[] {
  const letters = Array.from(word);
  const variable = letters.map((letter, index) => ({ forms: accentForms[letter] ?? '', index }))
    .filter(item => item.forms).sort((a, b) => a.forms.length - b.forms.length);
  const fixed = letters.length - variable.length;
  const expand = new Set(variable.slice(0, Math.max(0, 3 - fixed)).map(item => item.index));
  let patterns = [''];
  for (const [i, letter] of letters.entries()) {
    const forms = expand.has(i) ? accentForms[letter]! : (accentForms[letter] ? '_' : letter);
    patterns = patterns.flatMap(prefix => Array.from(forms, char => prefix + char));
  }
  return patterns;
}

export function rankHistoricalCategories(description: string, rows: DescriptionFrequency[]): number[] {
  const words = descriptionWords(description);
  const target = merchantWords(words);
  if (!target.length) return [];
  const kinds = words.flatMap(word => businessKinds.get(word) ?? []);
  const counts = new Map<number, number>();
  let bestSimilarity = 0;
  for (const row of rows) {
    if (row.categoryId === null) continue;
    const historyWords = descriptionWords(row.description);
    const historyKinds = historyWords.flatMap(word => businessKinds.get(word) ?? []);
    if (kinds.length && historyKinds.length && !kinds.some(kind => historyKinds.includes(kind))) continue;
    const candidate = merchantWords(historyWords);
    const shared = target.filter(word => candidate.includes(word)).length;
    const similarity = shared / Math.max(target.length, candidate.length);
    // Require a whole name, allowing extra descriptive words in longer transaction labels.
    if (shared !== Math.min(target.length, candidate.length) || similarity < 2 / 3 || similarity < bestSimilarity) continue;
    if (similarity > bestSimilarity) {
      counts.clear();
      bestSimilarity = similarity;
    }
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + row._count.description);
  }
  const ranked = [...counts].sort(([idA, a], [idB, b]) => b - a || idA - idB);
  if (ranked.length === 1 && ranked[0][1] < 2) return [];
  return ranked.slice(0, 10).map(([id]) => id);
}

export async function suggestHistoricalCategories(params: {
  companyId: number; type: TransactionType; description: string; accessibleAccountIds?: number[];
}) {
  const tokens = merchantWords(descriptionWords(params.description));
  if (!tokens.length || params.accessibleAccountIds?.length === 0) return [];
  // A matching description can omit at most one third of the target words (see
  // rankHistoricalCategories). Searching one more anchor than it can omit covers
  // every eligible match without sending thousands of ILIKE branches to Postgres.
  const anchors = tokens.map(token => ({ token, patterns: merchantPatterns(token) }))
    .sort((a, b) => a.patterns.length - b.patterns.length || b.token.length - a.token.length)
    .slice(0, Math.floor(tokens.length / 3) + 1);
  const patterns = anchors.flatMap(anchor => anchor.patterns);
  if (patterns.length > 64) return [];
  const limit = 120;
  const rows = await getDescriptionFrequencies(params.companyId, params.type, {
    status: 'COMPLETED', categoryId: { not: null },
    AND: [
      { OR: patterns.map(contains => ({ description: { contains, mode: 'insensitive' } })) },
      { OR: [{ installmentNumber: null }, { installmentNumber: 1 }] },
      ...(params.accessibleAccountIds ? [{ OR: [
        { fromAccountId: { in: params.accessibleAccountIds } }, { toAccountId: { in: params.accessibleAccountIds } }
      ] }] : [])
    ]
  }, limit + 1);
  // A truncated sample cannot establish that a merchant has a single historical category.
  if (rows.length > limit) return [];
  return rankHistoricalCategories(params.description, rows);
}
