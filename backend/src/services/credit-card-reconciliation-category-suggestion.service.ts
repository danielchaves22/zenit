import { PrismaClient, TransactionStatus, TransactionType } from '@prisma/client';
import {
  LEGACY_OPENAI_MODEL_FALLBACK,
  resolveOpenAiModel,
  shouldRetryWithLegacyOpenAiModel
} from '../constants/openai';
import OpenAiIntegrationService from './openai-integration.service';

const prisma = new PrismaClient();

type SuggestibleStatementItem = {
  id: string;
  kind: string;
  amount: string;
  installmentNumber: number | null;
  totalInstallments: number | null;
  sourceDescription: string;
  sourceSection: string;
  canImport: boolean;
};

type ExpenseCategoryRecord = {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  isDefault: boolean;
  parent: {
    id: number;
    name: string;
  } | null;
};

type HistoryTransactionRecord = {
  id: number;
  description: string;
  notes: string | null;
  importSourceDescription: string | null;
  date: Date;
  category: ExpenseCategoryRecord;
};

type AiSuggestionPayload = {
  itemId: string;
  categoryId: number | null;
  reason?: string | null;
};

export type CreditCardReconciliationCategorySuggestionSource = 'RULE' | 'HISTORY' | 'AI';

export type CreditCardReconciliationCategorySuggestion = {
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  source: CreditCardReconciliationCategorySuggestionSource | null;
  reason: string | null;
};

const CATEGORY_SEMANTIC_ALIASES: Array<{
  matchers: string[];
  aliases: string[];
}> = [
  {
    matchers: ['vestuario', 'moda', 'calcado', 'roupa'],
    aliases: [
      'roupa',
      'roupas',
      'tenis',
      'sapato',
      'calcado',
      'camisa',
      'camiseta',
      'calca',
      'bermuda',
      'short',
      'vestido',
      'blusa',
      'jaqueta',
      'moletom',
      'bolsa',
      'acessorio'
    ]
  },
  {
    matchers: ['beleza', 'salao', 'cabeleireiro', 'barbearia'],
    aliases: [
      'cabeleireiro',
      'salao',
      'barbeiro',
      'barba',
      'cabelo',
      'unha',
      'manicure',
      'pedicure',
      'maquiagem',
      'estetica'
    ]
  },
  {
    matchers: ['combustivel', 'posto', 'transporte'],
    aliases: ['posto', 'gasolina', 'etanol', 'diesel', 'abastecimento', 'combustivel']
  },
  {
    matchers: ['farmacia', 'saude'],
    aliases: ['farmacia', 'remedio', 'medicamento', 'saude']
  },
  {
    matchers: ['educacao'],
    aliases: ['curso', 'faculdade', 'escola', 'mensalidade', 'livro']
  },
  {
    matchers: ['esporte', 'academia'],
    aliases: ['academia', 'treino', 'esporte', 'pilates', 'musculacao']
  },
  {
    matchers: ['alimentacao'],
    aliases: ['restaurante', 'lanche', 'almoco', 'jantar', 'ifood', 'mercado', 'supermercado']
  },
  {
    matchers: ['lanche', 'lanches', 'sorvete', 'sorvetes', 'burger', 'hamburguer', 'hamburger'],
    aliases: [
      'lanche',
      'lanches',
      'sorvete',
      'sorvetes',
      'burger',
      'hamburguer',
      'hamburger',
      'fast food',
      'milkshake',
      'acai',
      'pastel',
      'cafeteria'
    ]
  },
  {
    matchers: ['anuidade', 'cartao', 'tarifa', 'taxa', 'encargo', 'juros'],
    aliases: [
      'anuidade',
      'tarifa',
      'taxa',
      'cartao',
      'encargo',
      'encargos',
      'juros',
      'multa',
      'mora',
      'financeiro',
      'bancario',
      'bancaria',
      'iof',
      'imposto'
    ]
  },
  {
    matchers: ['imposto', 'tributo', 'fiscal'],
    aliases: ['iof', 'imposto', 'tributo', 'taxa']
  }
];

function parseJsonSafe(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () =>
    new Array(right.length + 1).fill(0)
  );

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function scoreCandidate(value: string, candidate: string): number {
  if (!value || !candidate) {
    return -1;
  }

  if (candidate === value) {
    return 100;
  }

  const valueTokens = value.split(/\s+/).filter(Boolean);
  const candidateTokens = candidate.split(/\s+/).filter(Boolean);
  const exactTokenOverlap = valueTokens.filter((token) => candidateTokens.includes(token)).length;
  if (exactTokenOverlap > 0) {
    return Math.min(95, 70 + exactTokenOverlap * 10);
  }

  const partialTokenOverlap = valueTokens.filter((token) =>
    candidateTokens.some(
      (candidateToken) =>
        candidateToken.startsWith(token) || token.startsWith(candidateToken)
    )
  ).length;
  if (partialTokenOverlap > 0) {
    return Math.min(85, 55 + partialTokenOverlap * 10);
  }

  if (candidate.startsWith(value)) {
    return 75;
  }

  if (candidate.includes(value)) {
    return 50;
  }

  if (value.includes(candidate)) {
    return 45;
  }

  const distance = levenshteinDistance(value, candidate);
  const maxLength = Math.max(value.length, candidate.length);
  const similarity = maxLength === 0 ? 0 : (1 - distance / maxLength) * 100;

  if (similarity >= 88) {
    return Math.round(similarity);
  }

  const tokenBaseScore = (left: string, right: string) => {
    if (left === right) {
      return 100;
    }

    if (right.startsWith(left)) {
      return 75;
    }

    if (right.includes(left) || left.includes(right)) {
      return 50;
    }

    const tokenDistance = levenshteinDistance(left, right);
    const tokenMaxLength = Math.max(left.length, right.length);
    const tokenSimilarity =
      tokenMaxLength === 0 ? 0 : (1 - tokenDistance / tokenMaxLength) * 100;

    return tokenSimilarity >= 80 ? Math.round(tokenSimilarity) : -1;
  };
  const tokenMatches = valueTokens.filter((token) =>
    candidateTokens.some((candidateToken) => tokenBaseScore(token, candidateToken) >= 80)
  ).length;

  if (tokenMatches > 0) {
    return 40 + tokenMatches * 10;
  }

  return similarity >= 72 ? Math.round(similarity) : -1;
}

function getCategorySemanticAliases(categoryName: string): string[] {
  const normalizedName = normalizeText(categoryName);
  const aliases = new Set<string>();

  for (const group of CATEGORY_SEMANTIC_ALIASES) {
    if (group.matchers.some((matcher) => normalizedName.includes(matcher))) {
      for (const alias of group.aliases) {
        aliases.add(alias);
      }
    }
  }

  return Array.from(aliases);
}

function getCategoryFullName(category: ExpenseCategoryRecord) {
  return category.parent ? `${category.parent.name} / ${category.name}` : category.name;
}

function scoreCategoryCandidate(category: ExpenseCategoryRecord, hint?: string | null): number {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) {
    return 0;
  }

  const normalizedName = normalizeText(category.name);
  const normalizedParentName = normalizeText(category.parent?.name);
  const directScore = scoreCandidate(normalizedHint, normalizedName);
  const parentScore = normalizedParentName ? scoreCandidate(normalizedHint, normalizedParentName) : -1;
  const aliasScores = getCategorySemanticAliases(category.name).map((alias) =>
    scoreCandidate(normalizedHint, alias)
  );
  const parentAliasScores = category.parent
    ? getCategorySemanticAliases(category.parent.name).map((alias) =>
        scoreCandidate(normalizedHint, alias)
      )
    : [];
  const bestAliasScore = aliasScores.reduce((best, score) => Math.max(best, score), -1);
  const bestParentAliasScore = parentAliasScores.reduce(
    (best, score) => Math.max(best, score),
    -1
  );
  const bestParentSignal = Math.max(parentScore, bestParentAliasScore);
  const baseBestScore = Math.max(directScore, bestAliasScore, bestParentSignal);

  if (bestAliasScore >= 0 && directScore < 0 && bestParentSignal < 0) {
    return Math.max(60, bestAliasScore);
  }

  let adjustedScore = baseBestScore;
  const isSpecificSubcategory = Boolean(category.parent);

  if (isSpecificSubcategory && baseBestScore >= 0) {
    adjustedScore += 8;
    if (bestAliasScore >= 0 || directScore >= 0) {
      adjustedScore += 6;
    }
  }

  return adjustedScore;
}

function toSuggestion(
  category: ExpenseCategoryRecord,
  source: CreditCardReconciliationCategorySuggestionSource,
  reason: string
): CreditCardReconciliationCategorySuggestion {
  return {
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    source,
    reason
  };
}

function createEmptySuggestion(): CreditCardReconciliationCategorySuggestion {
  return {
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    source: null,
    reason: null
  };
}

function findBestCategoryByHint(categories: ExpenseCategoryRecord[], hint: string) {
  const ranked = categories
    .map((category) => ({
      category,
      score: scoreCategoryCandidate(category, hint)
    }))
    .filter((entry) => entry.score >= 60)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (Boolean(left.category.parent) !== Boolean(right.category.parent)) {
        return Number(Boolean(right.category.parent)) - Number(Boolean(left.category.parent));
      }

      if (left.category.isDefault !== right.category.isDefault) {
        return Number(left.category.isDefault) - Number(right.category.isDefault);
      }

      return left.category.name.localeCompare(right.category.name, 'pt-BR', {
        sensitivity: 'base'
      });
    });

  return ranked[0] || null;
}

function suggestByRule(
  item: SuggestibleStatementItem,
  categories: ExpenseCategoryRecord[]
): CreditCardReconciliationCategorySuggestion | null {
  const normalizedDescription = normalizeText(item.sourceDescription);
  const hints: Array<{ hint: string; reason: string }> = [];

  if (
    item.kind === 'ANNUITY' ||
    normalizedDescription.includes('anuidade')
  ) {
    hints.push({
      hint: 'anuidade tarifa cartao taxa',
      reason: 'Lancamento identificado como anuidade ou tarifa do cartao.'
    });
  }

  if (
    item.kind === 'INTEREST' ||
    normalizedDescription.includes('juros') ||
    normalizedDescription.includes('mora') ||
    normalizedDescription.includes('multa') ||
    normalizedDescription.includes('rotativo') ||
    normalizedDescription.includes('encargo')
  ) {
    hints.push({
      hint: 'juros encargo cartao multa mora taxa',
      reason: 'Lancamento identificado como juros ou encargo financeiro.'
    });
  }

  if (
    item.kind === 'TAX' ||
    normalizedDescription.includes('iof') ||
    normalizedDescription.includes('imposto') ||
    normalizedDescription.includes('tributo')
  ) {
    hints.push({
      hint: 'iof imposto taxa tributo',
      reason: 'Lancamento identificado como imposto ou taxa financeira.'
    });
  }

  if (
    item.kind === 'FEE' ||
    normalizedDescription.includes('taxa') ||
    normalizedDescription.includes('tarifa')
  ) {
    hints.push({
      hint: 'taxa tarifa servico bancario cartao',
      reason: 'Lancamento identificado como taxa ou tarifa.'
    });
  }

  for (const hint of hints) {
    const match = findBestCategoryByHint(categories, hint.hint);
    if (match) {
      return toSuggestion(match.category, 'RULE', hint.reason);
    }
  }

  return null;
}

function extractStatementDescriptionFromNotes(notes: string | null) {
  if (!notes) {
    return null;
  }

  const match = notes.match(/descricao original:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function buildHistorySearchText(transaction: HistoryTransactionRecord) {
  return (
    transaction.importSourceDescription ||
    extractStatementDescriptionFromNotes(transaction.notes) ||
    transaction.description
  );
}

function suggestByHistory(
  item: SuggestibleStatementItem,
  historyTransactions: HistoryTransactionRecord[]
): CreditCardReconciliationCategorySuggestion | null {
  const normalizedTarget = normalizeText(item.sourceDescription);
  if (!normalizedTarget) {
    return null;
  }

  const buckets = new Map<
    number,
    {
      category: ExpenseCategoryRecord;
      totalScore: number;
      bestScore: number;
      count: number;
      sampleText: string;
    }
  >();

  for (const transaction of historyTransactions) {
    const historyText = buildHistorySearchText(transaction);
    const score = scoreCandidate(normalizedTarget, normalizeText(historyText));
    if (score < 80) {
      continue;
    }

    const bucket = buckets.get(transaction.category.id) || {
      category: transaction.category,
      totalScore: 0,
      bestScore: -1,
      count: 0,
      sampleText: historyText
    };
    bucket.totalScore += score;
    bucket.bestScore = Math.max(bucket.bestScore, score);
    bucket.count += 1;
    if (score >= bucket.bestScore) {
      bucket.sampleText = historyText;
    }
    buckets.set(transaction.category.id, bucket);
  }

  const ranked = Array.from(buckets.values()).sort((left, right) => {
    if (right.bestScore !== left.bestScore) {
      return right.bestScore - left.bestScore;
    }

    if (right.totalScore !== left.totalScore) {
      return right.totalScore - left.totalScore;
    }

    return right.count - left.count;
  });

  const best = ranked[0];
  if (!best || best.bestScore < 80) {
    return null;
  }

  const second = ranked[1];
  if (second && best.bestScore === second.bestScore && Math.abs(best.totalScore - second.totalScore) < 8) {
    return null;
  }

  return toSuggestion(
    best.category,
    'HISTORY',
    `Historico no cartao sugere esta categoria a partir de "${best.sampleText}".`
  );
}

async function requestAiSuggestions(params: {
  apiKey: string;
  model: string;
  items: SuggestibleStatementItem[];
  categories: ExpenseCategoryRecord[];
}) {
  const categoriesPayload = params.categories.map((category) => ({
    id: category.id,
    name: getCategoryFullName(category)
  }));
  const itemsPayload = params.items.map((item) => ({
    itemId: item.id,
    description: item.sourceDescription,
    kind: item.kind,
    section: item.sourceSection,
    amount: item.amount,
    installment:
      item.installmentNumber && item.totalInstallments
        ? `${item.installmentNumber}/${item.totalInstallments}`
        : null
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: 'system',
          content:
            'Voce classifica lancamentos de cartao de credito em categorias financeiras brasileiras. Escolha apenas IDs da lista recebida. Quando houver duvida real, retorne null. Responda apenas JSON valido.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            instructions: [
              'Use somente os categoryId informados.',
              'Considere descricao, tipo do lancamento, secao da fatura, valor e parcela.',
              'Priorize categorias especificas quando houver sinal suficiente.',
              'Se nao houver confianca razoavel, use null.'
            ],
            categories: categoriesPayload,
            items: itemsPayload,
            responseShape: {
              assignments: [
                {
                  itemId: 'string',
                  categoryId: 'number|null',
                  reason: 'string'
                }
              ]
            }
          })
        }
      ],
      temperature: 0.1,
      max_tokens: 1800,
      response_format: { type: 'json_object' }
    })
  });

  const raw = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    raw,
    parsed: parseJsonSafe(raw)
  };
}

async function suggestByAi(params: {
  companyId: number;
  items: SuggestibleStatementItem[];
  categories: ExpenseCategoryRecord[];
}) {
  if (params.items.length === 0 || params.categories.length === 0) {
    return new Map<string, CreditCardReconciliationCategorySuggestion>();
  }

  try {
    const credential = await OpenAiIntegrationService.getDecryptedCredential(params.companyId, true);
    const primaryModel = resolveOpenAiModel(credential.model);
    let completion = await requestAiSuggestions({
      apiKey: credential.apiKey,
      model: primaryModel,
      items: params.items,
      categories: params.categories
    });

    if (
      !completion.ok &&
      shouldRetryWithLegacyOpenAiModel(primaryModel, completion.status, completion.raw)
    ) {
      completion = await requestAiSuggestions({
        apiKey: credential.apiKey,
        model: LEGACY_OPENAI_MODEL_FALLBACK,
        items: params.items,
        categories: params.categories
      });
    }

    if (!completion.ok) {
      return new Map<string, CreditCardReconciliationCategorySuggestion>();
    }

    const content = completion.parsed?.choices?.[0]?.message?.content || null;
    const data = parseJsonSafe(content);
    const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
    const categoriesById = new Map(params.categories.map((category) => [category.id, category]));
    const suggestions = new Map<string, CreditCardReconciliationCategorySuggestion>();

    assignments.forEach((assignment: AiSuggestionPayload) => {
      if (!assignment?.itemId || typeof assignment.itemId !== 'string') {
        return;
      }

      const categoryId =
        typeof assignment.categoryId === 'number' && Number.isFinite(assignment.categoryId)
          ? assignment.categoryId
          : null;
      if (!categoryId) {
        return;
      }

      const category = categoriesById.get(categoryId);
      if (!category) {
        return;
      }

      suggestions.set(
        assignment.itemId,
        toSuggestion(
          category,
          'AI',
          assignment.reason?.trim() ||
            'Sugestao automatica baseada na descricao da fatura.'
        )
      );
    });

    return suggestions;
  } catch {
    return new Map<string, CreditCardReconciliationCategorySuggestion>();
  }
}

async function loadExpenseCategories(companyId: number) {
  return prisma.financialCategory.findMany({
    where: {
      companyId,
      type: TransactionType.EXPENSE
    },
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
      parentId: true,
      isDefault: true,
      parent: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ name: 'asc' }]
  }) as Promise<ExpenseCategoryRecord[]>;
}

async function loadHistoryTransactions(params: {
  companyId: number;
  accountId: number;
}) {
  return prisma.financialTransaction.findMany({
    where: {
      companyId: params.companyId,
      fromAccountId: params.accountId,
      type: TransactionType.EXPENSE,
      status: {
        not: TransactionStatus.CANCELED
      },
      categoryId: {
        not: null
      }
    },
    select: {
      id: true,
      description: true,
      notes: true,
      importSourceDescription: true,
      date: true,
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          parentId: true,
          isDefault: true,
          parent: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 400
  }) as Promise<HistoryTransactionRecord[]>;
}

export default class CreditCardReconciliationCategorySuggestionService {
  static async suggestForItems(params: {
    companyId: number;
    accountId: number;
    items: SuggestibleStatementItem[];
  }) {
    const categories = await loadExpenseCategories(params.companyId);
    const historyTransactions = await loadHistoryTransactions({
      companyId: params.companyId,
      accountId: params.accountId
    });

    const suggestions = new Map<string, CreditCardReconciliationCategorySuggestion>();
    const unresolvedItems: SuggestibleStatementItem[] = [];

    params.items.forEach((item) => {
      if (!item.canImport) {
        suggestions.set(item.id, createEmptySuggestion());
        return;
      }

      const ruleSuggestion = suggestByRule(item, categories);
      if (ruleSuggestion) {
        suggestions.set(item.id, ruleSuggestion);
        return;
      }

      const historySuggestion = suggestByHistory(item, historyTransactions);
      if (historySuggestion) {
        suggestions.set(item.id, historySuggestion);
        return;
      }

      unresolvedItems.push(item);
      suggestions.set(item.id, createEmptySuggestion());
    });

    const aiSuggestions = await suggestByAi({
      companyId: params.companyId,
      items: unresolvedItems,
      categories
    });

    aiSuggestions.forEach((suggestion, itemId) => {
      suggestions.set(itemId, suggestion);
    });

    return suggestions;
  }
}

export const __private__ = {
  suggestByRule,
  suggestByHistory,
  findBestCategoryByHint,
  extractStatementDescriptionFromNotes
};
