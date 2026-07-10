import {
  AccountType,
  AssistantMode,
  AssistantPendingActionType,
  PrismaClient,
  Role,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import { DraftTransactionSummary, PendingAction } from '@zenit/assistant-contracts';
import { z } from 'zod';
import CreditCardInvoiceService from './credit-card-invoice.service';
import FinancialAccountService from './financial-account.service';
import FinancialTransactionService from './financial-transaction.service';
import PendingActionService, { DraftTransactionPayload } from './pending-action.service';
import UserService from './user.service';
import UserFinancialAccountAccessService from './user-financial-account-access.service';
import {
  CATEGORY_ICON_NAMES,
  DEFAULT_CATEGORY_ICON
} from '../constants/category-icons';
import { buildOperationalTransactionWhere } from '../utils/financial-transaction-query';

const prisma = new PrismaClient();

const createTransactionDraftArgsSchema = z.object({
  description: z.string().trim().min(1).max(255),
  amount: z.coerce.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  date: z.string().min(1).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'COMPLETED']).nullable().optional(),
  notes: z.string().nullable().optional(),
  installmentCount: z.coerce.number().int().min(1).max(120).nullable().optional(),
  accountHint: z.string().nullable().optional(),
  fromAccountHint: z.string().nullable().optional(),
  toAccountHint: z.string().nullable().optional(),
  categoryHint: z.string().nullable().optional(),
  fromAccountId: z.coerce.number().int().positive().nullable().optional(),
  toAccountId: z.coerce.number().int().positive().nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional()
});

const getPendingActionArgsSchema = z.object({
  pendingActionId: z.coerce.number().int().positive().nullable().optional()
});

const updateTransactionDraftArgsSchema = z.object({
  pendingActionId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(255).nullable().optional(),
  amount: z.coerce.number().positive().nullable().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).nullable().optional(),
  date: z.string().min(1).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'COMPLETED']).nullable().optional(),
  notes: z.string().nullable().optional(),
  installmentCount: z.coerce.number().int().min(1).max(120).nullable().optional(),
  accountHint: z.string().nullable().optional(),
  fromAccountHint: z.string().nullable().optional(),
  toAccountHint: z.string().nullable().optional(),
  categoryHint: z.string().nullable().optional(),
  fromAccountId: z.coerce.number().int().positive().nullable().optional(),
  toAccountId: z.coerce.number().int().positive().nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional()
});

const searchCategoriesArgsSchema = z.object({
  query: z.string().trim().min(1).nullable().optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).nullable().optional(),
  limit: z.coerce.number().int().nullable().optional()
});

const createCategoryArgsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  color: z.string().trim().nullable().optional(),
  icon: z.string().trim().nullable().optional(),
  parentCategoryId: z.coerce.number().int().positive().nullable().optional(),
  parentCategoryHint: z.string().trim().min(1).nullable().optional(),
  accountingCode: z.string().trim().nullable().optional()
});

const searchAccountsArgsSchema = z.object({
  query: z.string().trim().min(1).nullable().optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH']).nullable().optional(),
  limit: z.coerce.number().int().nullable().optional()
});

const getFinancialOverviewArgsSchema = z.object({});

const getCreditCardOverviewArgsSchema = z.object({
  accountId: z.coerce.number().int().positive().nullable().optional(),
  accountHint: z.string().trim().min(1).nullable().optional()
});

const getDueObligationsArgsSchema = z.object({
  window: z.enum(['TODAY', 'THIS_WEEK', 'NEXT_7_DAYS', 'REST_OF_MONTH', 'CUSTOM']),
  startDate: z.string().min(1).nullable().optional(),
  endDate: z.string().min(1).nullable().optional(),
  limit: z.coerce.number().int().nullable().optional()
});

const cancelPendingActionArgsSchema = z.object({
  pendingActionId: z.coerce.number().int().positive().nullable().optional()
});

const getRecentTransactionsArgsSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).nullable().optional(),
  limit: z.coerce.number().int().nullable().optional()
});

const CATEGORY_DEFAULT_COLORS: Record<TransactionType, string> = {
  [TransactionType.EXPENSE]: '#DC2626',
  [TransactionType.INCOME]: '#16A34A',
  [TransactionType.TRANSFER]: '#64748B'
};

const CATEGORY_ICON_HINTS: Array<{
  icon: (typeof CATEGORY_ICON_NAMES)[number];
  keywords: string[];
}> = [
  { icon: 'scissors', keywords: ['beleza', 'salao', 'cabeleireiro', 'barbearia'] },
  { icon: 'fuel', keywords: ['combustivel', 'gasolina', 'etanol', 'posto'] },
  { icon: 'utensilsCrossed', keywords: ['restaurante', 'alimentacao', 'mercado', 'supermercado', 'ifood'] },
  { icon: 'coffee', keywords: ['cafe', 'cafeteria', 'lanche', 'lanches'] },
  { icon: 'stethoscope', keywords: ['saude', 'farmacia', 'medico', 'medicina'] },
  { icon: 'graduationCap', keywords: ['educacao', 'curso', 'faculdade', 'escola'] },
  { icon: 'car', keywords: ['carro', 'veiculo', 'uber', 'transporte'] },
  { icon: 'briefcaseBusiness', keywords: ['trabalho', 'servico', 'consultoria', 'honorario'] },
  { icon: 'building2', keywords: ['aluguel', 'moradia', 'casa', 'condominio'] },
  { icon: 'banknote', keywords: ['salario', 'renda', 'receita', 'recebimento'] },
  { icon: 'piggyBank', keywords: ['reserva', 'poupanca', 'investimento'] },
  { icon: 'creditCard', keywords: ['cartao', 'credito', 'fatura'] }
];

export type AssistantToolExecutionContext = {
  sessionId: number;
  turnId: number;
  userId: number;
  companyId: number;
  role: Role;
  mode: AssistantMode;
};

export type ToolExecutionResult = {
  data: Record<string, unknown>;
  pendingAction?: PendingAction;
};

type AccountCandidate = Awaited<ReturnType<typeof FinancialAccountService.listAccounts>>[number];
type AccountLike = Pick<AccountCandidate, 'name' | 'bankName' | 'type'>;
type CategoryLike = {
  id: number;
  name: string;
  isDefault: boolean;
  parent?: { id: number; name: string } | null;
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
    matchers: ['combustivel', 'posto'],
    aliases: ['posto', 'gasolina', 'etanol', 'diesel', 'abastecimento', 'combustivel']
  },
  {
    matchers: ['farmacia'],
    aliases: ['farmacia', 'remedio', 'medicamento']
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
  }
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeDateString(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data invalida para o rascunho de transacao');
  }

  return date.toISOString().slice(0, 10);
}

function normalizeHexColor(value: string | null | undefined, type: TransactionType) {
  if (value && /^#([0-9A-F]{3}){1,2}$/i.test(value)) {
    return value.toUpperCase();
  }

  return CATEGORY_DEFAULT_COLORS[type];
}

function suggestCategoryIcon(
  name: string,
  type: TransactionType,
  requestedIcon?: string | null
): (typeof CATEGORY_ICON_NAMES)[number] {
  if (
    requestedIcon &&
    CATEGORY_ICON_NAMES.includes(requestedIcon as (typeof CATEGORY_ICON_NAMES)[number])
  ) {
    return requestedIcon as (typeof CATEGORY_ICON_NAMES)[number];
  }

  const normalizedName = normalizeText(name);
  const matchedGroup = CATEGORY_ICON_HINTS.find((group) =>
    group.keywords.some((keyword) => normalizedName.includes(keyword))
  );

  if (matchedGroup) {
    return matchedGroup.icon;
  }

  if (type === TransactionType.INCOME) {
    return 'banknote';
  }

  if (type === TransactionType.TRANSFER) {
    return 'creditCard';
  }

  return DEFAULT_CATEGORY_ICON;
}

function getTodayDateString(timeZone = 'America/Sao_Paulo'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

function clampLimit(value: number | null | undefined, fallback: number, max: number): number {
  const normalized = Number(value ?? fallback);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, normalized));
}

function parseDateOnly(value: string): Date {
  const normalized = normalizeDateString(value);
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function startOfDayLocal(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDayLocal(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

function endOfWeekLocal(date: Date): Date {
  const normalized = startOfDayLocal(date);
  const dayOfWeek = normalized.getDay();
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  normalized.setDate(normalized.getDate() + daysUntilSunday);
  return endOfDayLocal(normalized);
}

function endOfMonthLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDaysLocal(date: Date, days: number): Date {
  const normalized = new Date(date);
  normalized.setDate(normalized.getDate() + days);
  return normalized;
}

function formatCreditCardReference(referenceYear?: number | null, referenceMonth?: number | null) {
  if (!referenceYear || !referenceMonth) {
    return null;
  }

  return `${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
}

function toMoneyNumber(value: unknown): number {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
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
    candidateTokens.some((candidateToken) => candidateToken.startsWith(token) || token.startsWith(candidateToken))
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

function hasExplicitHint(value?: string | null): boolean {
  return Boolean(normalizeText(value));
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

function scoreCategoryCandidate(category: CategoryLike, hint?: string | null): number {
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
  const bestParentAliasScore = parentAliasScores.reduce((best, score) => Math.max(best, score), -1);
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

function inferAccountTypePreference(hint?: string | null) {
  const normalizedHint = normalizeText(hint);
  const availabilitySignals = [
    'pix',
    'dinheiro',
    'debito',
    'conta',
    'conta corrente',
    'saldo',
    'disponibilidade',
    'corrente'
  ];
  const creditSignals = [
    'cartao',
    'credito',
    'fatura',
    'visa',
    'master',
    'mastercard',
    'amex',
    'elo',
    'parcela',
    'parcelado',
    'parcelada'
  ];

  const hasAvailabilitySignal = availabilitySignals.some((signal) => normalizedHint.includes(signal));
  const hasCreditSignal = creditSignals.some((signal) => normalizedHint.includes(signal));

  return {
    prefersAvailability: hasAvailabilitySignal || !hasCreditSignal,
    prefersCreditCard: hasCreditSignal
  };
}

function scoreAccountCandidate(account: AccountLike, hint?: string | null): number {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) {
    return 0;
  }

  const baseScore = Math.max(
    scoreCandidate(normalizedHint, normalizeText(account.name)),
    scoreCandidate(normalizedHint, normalizeText(account.bankName))
  );

  if (baseScore < 0) {
    return baseScore;
  }

  const { prefersAvailability, prefersCreditCard } = inferAccountTypePreference(normalizedHint);
  let adjustedScore = baseScore;
  const isAvailabilityAccount = account.type === 'CHECKING' || account.type === 'SAVINGS' || account.type === 'CASH';
  const isCreditCard = account.type === 'CREDIT_CARD';

  if (prefersAvailability) {
    if (isAvailabilityAccount) {
      adjustedScore += 35;
    } else if (isCreditCard) {
      adjustedScore -= 40;
    }
  }

  if (prefersCreditCard) {
    if (isCreditCard) {
      adjustedScore += 35;
    } else if (isAvailabilityAccount) {
      adjustedScore -= 10;
    }
  }

  if (normalizedHint.includes('conta') && isAvailabilityAccount) {
    adjustedScore += 10;
  }

  if (normalizedHint.includes('cartao') && isCreditCard) {
    adjustedScore += 10;
  }

  return adjustedScore;
}

function inferDraftStatus(
  draftInput: Pick<
    z.infer<typeof createTransactionDraftArgsSchema>,
    | 'status'
    | 'description'
    | 'notes'
    | 'accountHint'
    | 'fromAccountHint'
    | 'toAccountHint'
    | 'dueDate'
    | 'effectiveDate'
  >
): TransactionStatus {
  const joinedContext = normalizeText(
    [
      draftInput.description,
      draftInput.notes,
      draftInput.accountHint,
      draftInput.fromAccountHint,
      draftInput.toAccountHint
    ]
      .filter(Boolean)
      .join(' ')
  );

  const immediateSignals = [
    'pix',
    'debito',
    'credito',
    'cartao',
    'dinheiro',
    'gastei',
    'paguei',
    'recebi',
    'transferi',
    'pago',
    'recebido',
    'hoje',
    'agora'
  ];
  const futureSignals = [
    'amanha',
    'vencimento',
    'vence',
    'vencer',
    'a pagar',
    'boleto',
    'fatura',
    'pendente',
    'devo',
    'vou pagar',
    'a receber'
  ];

  const hasImmediateSignal = immediateSignals.some((signal) => joinedContext.includes(signal));
  const hasFutureSignal = futureSignals.some((signal) => joinedContext.includes(signal));

  if (draftInput.status === 'COMPLETED') {
    return TransactionStatus.COMPLETED;
  }

  if (draftInput.status === 'PENDING') {
    return hasImmediateSignal && !hasFutureSignal
      ? TransactionStatus.COMPLETED
      : TransactionStatus.PENDING;
  }

  if (draftInput.effectiveDate) {
    return TransactionStatus.COMPLETED;
  }

  if (draftInput.dueDate && !draftInput.effectiveDate && hasFutureSignal) {
    return TransactionStatus.PENDING;
  }

  return hasFutureSignal && !hasImmediateSignal
    ? TransactionStatus.PENDING
    : TransactionStatus.COMPLETED;
}

function chooseBestAccountMatch(accounts: AccountCandidate[], hint?: string | null) {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) {
    return null;
  }

  const ranked = accounts
    .map((account) => {
      return {
        account,
        score: scoreAccountCandidate(account, normalizedHint)
      };
    })
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0] && ranked[0].score >= 60 ? ranked[0].account : null;
}

function chooseBestCategoryMatch(
  categories: CategoryLike[],
  hint?: string | null
) {
  const normalizedHint = normalizeText(hint);
  if (normalizedHint) {
    const ranked = categories
      .map((category) => ({
        category,
        score: scoreCategoryCandidate(category, normalizedHint)
      }))
      .filter((entry) => entry.score >= 0)
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

        return left.category.name.localeCompare(right.category.name);
      });

    if (ranked[0] && ranked[0].score >= 60) {
      return ranked[0].category;
    }

    return null;
  }

  return categories.find((category) => category.isDefault) ?? categories[0] ?? null;
}

function pickDefaultAccount(accounts: AccountCandidate[], type: TransactionType) {
  const activeAccounts = accounts.filter((account) => account.isActive);
  const preferred = activeAccounts.find((account) => account.isDefault);
  if (preferred) {
    return preferred;
  }

  if (type === TransactionType.INCOME) {
    return (
      activeAccounts.find((account) => account.type !== 'CREDIT_CARD') ??
      activeAccounts[0] ??
      null
    );
  }

  if (type === TransactionType.EXPENSE) {
    return (
      activeAccounts.find((account) => account.type !== 'CREDIT_CARD') ??
      activeAccounts[0] ??
      null
    );
  }

  return activeAccounts.find((account) => account.type !== 'CREDIT_CARD') ?? activeAccounts[0] ?? null;
}

async function getAccessibleAccounts(params: {
  userId: number;
  role: Role;
  companyId: number;
}) {
  const accountIds =
    params.role === 'ADMIN' || params.role === 'SUPERUSER'
      ? undefined
      : await UserFinancialAccountAccessService.getUserAccessibleAccounts(
          params.userId,
          params.role,
          params.companyId
        );

  return FinancialAccountService.listAccounts({
    companyId: params.companyId,
    isActive: true,
    accountIds
  });
}

async function getAccessibleAccountIds(params: {
  userId: number;
  role: Role;
  companyId: number;
}) {
  return params.role === 'ADMIN' || params.role === 'SUPERUSER'
    ? undefined
    : UserFinancialAccountAccessService.getUserAccessibleAccounts(
        params.userId,
        params.role,
        params.companyId
      );
}

async function getAccessibleTransactionFilter(params: {
  userId: number;
  role: Role;
  companyId: number;
}) {
  return params.role === 'ADMIN' || params.role === 'SUPERUSER'
    ? undefined
    : UserFinancialAccountAccessService.getAccessibleTransactionFilter(
        params.userId,
        params.role,
        params.companyId
      );
}

async function getSearchableCategories(params: {
  companyId: number;
  type?: TransactionType | null;
}) {
  return prisma.financialCategory.findMany({
    where: {
      companyId: params.companyId,
      ...(params.type ? { type: params.type } : {})
    },
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
      icon: true,
      isDefault: true,
      parent: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
  });
}

async function getSearchableAccounts(params: {
  userId: number;
  role: Role;
  companyId: number;
  type?: AccountType | null;
}) {
  const accessibleAccountIds = await getAccessibleAccountIds(params);
  const accounts = await FinancialAccountService.listAccounts({
    companyId: params.companyId,
    isActive: true,
    accountIds: accessibleAccountIds,
    ...(params.type ? { type: params.type } : {})
  });

  const creditCardIds = accounts
    .filter((account) => account.type === AccountType.CREDIT_CARD)
    .map((account) => account.id);
  const creditCards = await CreditCardInvoiceService.listCreditCards({
    companyId: params.companyId,
    accountIds: creditCardIds
  });
  const creditCardsById = new Map(creditCards.map((card) => [card.id, card]));

  return accounts.map((account) => {
    const card = creditCardsById.get(account.id);
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      bankName: account.bankName,
      isDefault: account.isDefault,
      allowNegativeBalance: account.allowNegativeBalance,
      balance: Number(account.balance),
      creditLimit: account.creditLimit ? Number(account.creditLimit) : null,
      statementClosingDay: account.statementClosingDay,
      statementDueDay: account.statementDueDay,
      availableLimit:
        card && typeof card.availableLimit === 'number' ? card.availableLimit : null,
      usedLimit: card && typeof card.usedLimit === 'number' ? card.usedLimit : null,
      nextInvoice: card?.nextInvoice
        ? {
            referenceYear: card.nextInvoice.referenceYear,
            referenceMonth: card.nextInvoice.referenceMonth,
            dueDate: card.nextInvoice.dueDate instanceof Date
              ? card.nextInvoice.dueDate.toISOString()
              : String(card.nextInvoice.dueDate),
            totalAmount: card.nextInvoice.totalAmount,
            displayStatus: card.nextInvoice.displayStatus
      }
        : null
    };
  });
}

type SearchableAccount = Awaited<ReturnType<typeof getSearchableAccounts>>[number];

function rankSearchableAccounts(accounts: SearchableAccount[], hint?: string | null) {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) {
    return [];
  }

  return accounts
    .map((account) => ({
      account,
      score: scoreAccountCandidate(account, normalizedHint)
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);
}

function buildDueWindow(args: z.infer<typeof getDueObligationsArgsSchema>) {
  const today = startOfDayLocal(parseDateOnly(getTodayDateString()));

  switch (args.window) {
    case 'TODAY':
      return {
        label: 'today',
        startDate: today,
        endDate: endOfDayLocal(today)
      };
    case 'THIS_WEEK':
      return {
        label: 'this_week',
        startDate: today,
        endDate: endOfWeekLocal(today)
      };
    case 'NEXT_7_DAYS':
      return {
        label: 'next_7_days',
        startDate: today,
        endDate: endOfDayLocal(addDaysLocal(today, 6))
      };
    case 'REST_OF_MONTH':
      return {
        label: 'rest_of_month',
        startDate: today,
        endDate: endOfMonthLocal(today)
      };
    case 'CUSTOM':
      if (!args.startDate || !args.endDate) {
        throw new Error('startDate e endDate sao obrigatorios quando window = CUSTOM');
      }

      return {
        label: 'custom',
        startDate: startOfDayLocal(parseDateOnly(args.startDate)),
        endDate: endOfDayLocal(parseDateOnly(args.endDate))
      };
    default:
      throw new Error('Janela de vencimento nao suportada');
  }
}

function getPendingActionIdLabel(value?: number | null) {
  return value ? String(value) : 'mais recente';
}

function buildDraftSummary(params: {
  description: string;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
  date: string;
  dueDate?: string | null;
  effectiveDate?: string | null;
  notes?: string | null;
  installmentCount?: number;
  fromAccount?: AccountCandidate | null;
  toAccount?: AccountCandidate | null;
  category?: { id: number; name: string } | null;
}): DraftTransactionSummary {
  return {
    description: params.description,
    amount: params.amount,
    type: params.type,
    status: params.status,
    date: params.date,
    dueDate: params.dueDate ?? null,
    effectiveDate: params.effectiveDate ?? null,
    notes: params.notes ?? null,
    installmentCount: params.installmentCount ?? 1,
    fromAccount: params.fromAccount
      ? { id: params.fromAccount.id, name: params.fromAccount.name }
      : null,
    toAccount: params.toAccount ? { id: params.toAccount.id, name: params.toAccount.name } : null,
    category: params.category ? { id: params.category.id, name: params.category.name } : null
  };
}

export default class ToolExecutorService {
  static async executeTool(
    toolName: string,
    argumentsJson: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'create_transaction_draft':
        return this.createTransactionDraft(argumentsJson, context);
      case 'get_pending_action':
        return this.getPendingAction(argumentsJson, context);
      case 'update_transaction_draft':
        return this.updateTransactionDraft(argumentsJson, context);
      case 'confirm_pending_action':
        return this.confirmPendingAction(argumentsJson, context);
      case 'search_categories':
        return this.searchCategories(argumentsJson, context);
      case 'create_category':
        return this.createCategory(argumentsJson, context);
      case 'search_accounts':
        return this.searchAccounts(argumentsJson, context);
      case 'get_financial_overview':
        return this.getFinancialOverview(argumentsJson, context);
      case 'get_credit_card_overview':
        return this.getCreditCardOverview(argumentsJson, context);
      case 'get_due_obligations':
        return this.getDueObligations(argumentsJson, context);
      case 'cancel_pending_action':
        return this.cancelPendingAction(argumentsJson, context);
      case 'get_recent_transactions':
        return this.getRecentTransactions(argumentsJson, context);
      default:
        throw new Error(`Tool nao suportada: ${toolName}`);
    }
  }

  private static async resolvePendingActionRecord(
    context: AssistantToolExecutionContext,
    pendingActionId?: number | null
  ) {
    if (pendingActionId) {
      return PendingActionService.getOwnedPendingActionOrThrow({
        pendingActionId,
        userId: context.userId,
        companyId: context.companyId
      });
    }

    const pendingAction = await prisma.assistantPendingAction.findFirst({
      where: {
        sessionId: context.sessionId,
        userId: context.userId,
        companyId: context.companyId,
        status: 'PENDING'
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    if (!pendingAction) {
      throw new Error('Nenhum rascunho pendente encontrado na sessao atual');
    }

    return pendingAction;
  }

  private static async buildDraftResolution(
    draftInput: z.infer<typeof createTransactionDraftArgsSchema>,
    context: AssistantToolExecutionContext
  ) {
    const normalizedType = draftInput.type as TransactionType;
    const normalizedStatus = inferDraftStatus(draftInput);
    const normalizedDate = normalizeDateString(draftInput.date ?? getTodayDateString());
    const normalizedEffectiveDate =
      normalizedStatus === TransactionStatus.COMPLETED
        ? normalizeDateString(draftInput.effectiveDate ?? normalizedDate)
        : draftInput.effectiveDate
          ? normalizeDateString(draftInput.effectiveDate)
          : null;
    const normalizedDueDate = normalizeDateString(
      draftInput.dueDate ??
        (normalizedStatus === TransactionStatus.COMPLETED
          ? normalizedEffectiveDate ?? normalizedDate
          : normalizedDate)
    );

    const [accounts, categories] = await Promise.all([
      getAccessibleAccounts(context),
      normalizedType === TransactionType.TRANSFER
        ? Promise.resolve([])
        : prisma.financialCategory.findMany({
            where: {
              companyId: context.companyId,
              type: normalizedType
            },
            select: {
              id: true,
              name: true,
              isDefault: true,
              parent: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
          })
    ]);

    const fromHint = draftInput.fromAccountHint ?? draftInput.accountHint ?? null;
    const toHint = draftInput.toAccountHint ?? draftInput.accountHint ?? null;
    const explicitFromSelection = draftInput.fromAccountId != null || hasExplicitHint(fromHint);
    const explicitToSelection = draftInput.toAccountId != null || hasExplicitHint(toHint);
    const explicitCategorySelection =
      draftInput.categoryId != null || hasExplicitHint(draftInput.categoryHint);

    let fromAccount: AccountCandidate | null = null;
    let toAccount: AccountCandidate | null = null;
    const missingFields: string[] = [];

    if (normalizedType === TransactionType.EXPENSE || normalizedType === TransactionType.TRANSFER) {
      if (draftInput.fromAccountId != null) {
        fromAccount = accounts.find((account) => account.id === draftInput.fromAccountId) ?? null;
      } else if (hasExplicitHint(fromHint)) {
        fromAccount = chooseBestAccountMatch(accounts, fromHint);
      } else {
        fromAccount = pickDefaultAccount(accounts, normalizedType);
      }

      if (!fromAccount) {
        missingFields.push('fromAccount');
      }
    }

    if (normalizedType === TransactionType.INCOME || normalizedType === TransactionType.TRANSFER) {
      const accountPool =
        normalizedType === TransactionType.TRANSFER && fromAccount
          ? accounts.filter((account) => account.id !== fromAccount.id)
          : accounts;

      if (draftInput.toAccountId != null) {
        toAccount = accountPool.find((account) => account.id === draftInput.toAccountId) ?? null;
      } else if (hasExplicitHint(toHint)) {
        toAccount = chooseBestAccountMatch(accountPool, toHint);
      } else {
        toAccount = pickDefaultAccount(accountPool, normalizedType);
      }

      if (!toAccount) {
        missingFields.push('toAccount');
      }
    }

    if (
      normalizedType === TransactionType.TRANSFER &&
      fromAccount &&
      toAccount &&
      fromAccount.id === toAccount.id
    ) {
      missingFields.push('toAccount');
      toAccount = null;
    }

    let matchedCategory: { id: number; name: string } | null = null;
    if (normalizedType !== TransactionType.TRANSFER) {
      if (draftInput.categoryId != null) {
        matchedCategory =
          categories.find((category) => category.id === draftInput.categoryId) ?? null;
      } else if (hasExplicitHint(draftInput.categoryHint)) {
        matchedCategory = chooseBestCategoryMatch(categories, draftInput.categoryHint);
      } else {
        matchedCategory =
          chooseBestCategoryMatch(categories, draftInput.description) ??
          categories.find((category) => category.isDefault) ??
          categories[0] ??
          null;
      }

      if (!matchedCategory) {
        missingFields.push('category');
      }
    }

    const payload: DraftTransactionPayload = {
      description: draftInput.description,
      amount: draftInput.amount,
      type: normalizedType,
      status: normalizedStatus,
      date: normalizedDate,
      dueDate: normalizedDueDate,
      effectiveDate: normalizedEffectiveDate,
      notes: draftInput.notes ?? null,
      installmentCount: draftInput.installmentCount ?? 1,
      fromAccountId: fromAccount?.id ?? null,
      toAccountId: toAccount?.id ?? null,
      categoryId: matchedCategory?.id ?? null
    };

    const summary = buildDraftSummary({
      description: payload.description,
      amount: payload.amount,
      type: payload.type,
      status: payload.status,
      date: payload.date,
      dueDate: payload.dueDate,
      effectiveDate: payload.effectiveDate,
      notes: payload.notes,
      installmentCount: payload.installmentCount ?? 1,
      fromAccount,
      toAccount,
      category: matchedCategory
    });

    return {
      explicitFromSelection,
      explicitToSelection,
      explicitCategorySelection,
      missingFields,
      payload,
      summary,
      fromAccount,
      toAccount,
      matchedCategory
    };
  }

  private static async createTransactionDraft(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = createTransactionDraftArgsSchema.parse(rawArguments);
    const { missingFields, payload, summary, fromAccount, toAccount, matchedCategory } =
      await this.buildDraftResolution(args, context);

    if (missingFields.length > 0) {
      return {
        data: {
          ok: false,
          type: AssistantPendingActionType.CREATE_TRANSACTION_DRAFT,
          missingFields,
          resolved: {
            fromAccount: fromAccount ? { id: fromAccount.id, name: fromAccount.name } : null,
            toAccount: toAccount ? { id: toAccount.id, name: toAccount.name } : null,
            category: matchedCategory
          }
        }
      };
    }

    const pendingAction = await PendingActionService.createTransactionDraftAction({
      sessionId: context.sessionId,
      turnId: context.turnId,
      userId: context.userId,
      companyId: context.companyId,
      summary,
      payload
    });

    return {
      pendingAction,
      data: {
        ok: true,
        type: AssistantPendingActionType.CREATE_TRANSACTION_DRAFT,
        pendingAction,
        summary
      }
    };
  }

  private static async getPendingAction(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = getPendingActionArgsSchema.parse(rawArguments);
    const pendingAction = args.pendingActionId
      ? await PendingActionService.getPendingAction({
          pendingActionId: args.pendingActionId,
          userId: context.userId,
          companyId: context.companyId
        })
      : await PendingActionService.getLatestPendingActionForSession({
          sessionId: context.sessionId,
          userId: context.userId,
          companyId: context.companyId
        });

    return {
      pendingAction: pendingAction ?? undefined,
      data: {
        ok: Boolean(pendingAction),
        pendingAction
      }
    };
  }

  private static async updateTransactionDraft(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = updateTransactionDraftArgsSchema.parse(rawArguments);
    const record = await this.resolvePendingActionRecord(context, args.pendingActionId);
    const existingPayload = record.payload as unknown as DraftTransactionPayload;

    const mergedDraft = createTransactionDraftArgsSchema.parse({
      description: args.description ?? existingPayload.description,
      amount: args.amount ?? existingPayload.amount,
      type: args.type ?? existingPayload.type,
      date: args.date ?? existingPayload.date,
      dueDate:
        args.dueDate !== undefined ? args.dueDate : (existingPayload.dueDate ?? null),
      effectiveDate:
        args.effectiveDate !== undefined
          ? args.effectiveDate
          : (existingPayload.effectiveDate ?? null),
      status: args.status ?? existingPayload.status,
      notes: args.notes !== undefined ? args.notes : (existingPayload.notes ?? null),
      installmentCount: args.installmentCount ?? existingPayload.installmentCount ?? 1,
      accountHint: args.accountHint ?? null,
      fromAccountHint: args.fromAccountHint ?? null,
      toAccountHint: args.toAccountHint ?? null,
      categoryHint: args.categoryHint ?? null,
      fromAccountId:
        args.fromAccountId !== undefined
          ? args.fromAccountId
          : args.fromAccountHint !== undefined || args.accountHint !== undefined
            ? null
            : existingPayload.fromAccountId ?? null,
      toAccountId:
        args.toAccountId !== undefined
          ? args.toAccountId
          : args.toAccountHint !== undefined || args.accountHint !== undefined
            ? null
            : existingPayload.toAccountId ?? null,
      categoryId:
        args.categoryId !== undefined
          ? args.categoryId
          : args.categoryHint !== undefined
            ? null
            : existingPayload.categoryId ?? null
    });

    const { missingFields, payload, summary, fromAccount, toAccount, matchedCategory } =
      await this.buildDraftResolution(mergedDraft, context);

    if (missingFields.length > 0) {
      const pendingAction = await PendingActionService.getPendingAction({
        pendingActionId: record.id,
        userId: context.userId,
        companyId: context.companyId
      });

      return {
        pendingAction,
        data: {
          ok: false,
          type: AssistantPendingActionType.CREATE_TRANSACTION_DRAFT,
          pendingAction,
          missingFields,
          requestedPendingActionId: record.id,
          resolved: {
            fromAccount: fromAccount ? { id: fromAccount.id, name: fromAccount.name } : null,
            toAccount: toAccount ? { id: toAccount.id, name: toAccount.name } : null,
            category: matchedCategory
          }
        }
      };
    }

    const pendingAction = await PendingActionService.updateTransactionDraftAction({
      pendingActionId: record.id,
      userId: context.userId,
      companyId: context.companyId,
      summary,
      payload
    });

    return {
      pendingAction,
      data: {
        ok: true,
        type: AssistantPendingActionType.CREATE_TRANSACTION_DRAFT,
        pendingAction,
        summary
      }
    };
  }

  private static async confirmPendingAction(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = getPendingActionArgsSchema.parse(rawArguments);
    const record = await this.resolvePendingActionRecord(context, args.pendingActionId);
    const result = await PendingActionService.confirmTransactionDraft({
      pendingActionId: record.id,
      userId: context.userId,
      companyId: context.companyId,
      role: context.role
    });

    return {
      pendingAction: result.pendingAction,
      data: {
        ok: true,
        pendingAction: result.pendingAction,
        transaction: result.transaction
      }
    };
  }

  private static async searchCategories(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = searchCategoriesArgsSchema.parse(rawArguments);
    const limit = clampLimit(args.limit, 10, 20);
    const categories = await getSearchableCategories({
      companyId: context.companyId,
      type: (args.type as TransactionType | null | undefined) ?? null
    });
    const query = normalizeText(args.query);

    const scored = categories
      .map((category) => ({
        category,
        score: query ? scoreCategoryCandidate(category, query) : 0
      }));

    const positiveMatches = scored.filter((entry) => !query || entry.score >= 0);
    const fallbackPool = positiveMatches.length > 0 ? positiveMatches : scored;

    const ranked = fallbackPool
      .sort((left, right) => {
        if (query && right.score !== left.score) {
          return right.score - left.score;
        }

        if (left.category.isDefault !== right.category.isDefault) {
          return Number(right.category.isDefault) - Number(left.category.isDefault);
        }

        return left.category.name.localeCompare(right.category.name);
      })
      .slice(0, limit);

    return {
      data: {
        ok: true,
        categories: ranked.map(({ category, score }) => ({
          id: category.id,
          name: category.name,
          type: category.type,
          isDefault: category.isDefault,
          color: category.color,
          icon: category.icon,
          parent: category.parent,
          matchScore: query && score >= 0 ? score : null
        })),
        usedFallback: Boolean(query) && positiveMatches.length === 0
      }
    };
  }

  private static async createCategory(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = createCategoryArgsSchema.parse(rawArguments);

    if (context.role === 'USER') {
      const companyContext = await UserService.getUserCompanyContext(
        context.userId,
        context.companyId
      );

      if (!companyContext?.manageFinancialCategories) {
        throw new Error('Usuario sem permissao para gerenciar categorias financeiras');
      }
    }

    const type = args.type as TransactionType;
    const categories = await getSearchableCategories({
      companyId: context.companyId,
      type
    });

    let parentCategory: (typeof categories)[number] | null =
      args.parentCategoryId != null
        ? categories.find((category) => category.id === args.parentCategoryId) ?? null
        : null;

    if (!parentCategory && args.parentCategoryHint) {
      parentCategory =
        (chooseBestCategoryMatch(categories, args.parentCategoryHint) as
          | (typeof categories)[number]
          | null) ?? null;
    }

    if (args.parentCategoryHint && !parentCategory) {
      return {
        data: {
          ok: false,
          error: 'Categoria pai nao encontrada',
          suggestedParents: categories.slice(0, 5).map((category) => ({
            id: category.id,
            name: category.name
          }))
        }
      };
    }

    const existingCategory = await prisma.financialCategory.findFirst({
      where: {
        companyId: context.companyId,
        name: {
          equals: args.name.trim(),
          mode: 'insensitive'
        },
        parentId: parentCategory?.id ?? null,
        type
      },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        icon: true,
        parent: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (existingCategory) {
      return {
        data: {
          ok: true,
          created: false,
          category: existingCategory,
          reason: 'already_exists'
        }
      };
    }

    const category = await prisma.financialCategory.create({
      data: {
        accountingCode: args.accountingCode ?? null,
        color: normalizeHexColor(args.color, type),
        companyId: context.companyId,
        icon: suggestCategoryIcon(args.name, type, args.icon),
        name: args.name.trim(),
        parentId: parentCategory?.id ?? null,
        type
      },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        icon: true,
        parent: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return {
      data: {
        ok: true,
        created: true,
        category
      }
    };
  }

  private static async searchAccounts(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = searchAccountsArgsSchema.parse(rawArguments);
    const limit = clampLimit(args.limit, 10, 20);
    const accounts = await getSearchableAccounts({
      userId: context.userId,
      role: context.role,
      companyId: context.companyId,
      type: (args.type as AccountType | null | undefined) ?? null
    });
    const query = normalizeText(args.query);

    const ranked = accounts
      .map((account) => ({
        account,
        score: query ? scoreAccountCandidate(account, query) : 0
      }))
      .filter((entry) => !query || entry.score >= 0)
      .sort((left, right) => {
        if (query && right.score !== left.score) {
          return right.score - left.score;
        }

        if (left.account.isDefault !== right.account.isDefault) {
          return Number(right.account.isDefault) - Number(left.account.isDefault);
        }

        return left.account.name.localeCompare(right.account.name);
      })
      .slice(0, limit);

    return {
      data: {
        ok: true,
        accounts: ranked.map(({ account, score }) => ({
          ...account,
          matchScore: query ? score : null
        }))
      }
    };
  }

  private static async getFinancialOverview(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    getFinancialOverviewArgsSchema.parse(rawArguments);

    const accounts = await getSearchableAccounts(context);
    const nonCreditAccounts = accounts.filter((account) => account.type !== AccountType.CREDIT_CARD);
    const creditCards = accounts.filter((account) => account.type === AccountType.CREDIT_CARD);

    const currentBalanceTotal = nonCreditAccounts.reduce(
      (total, account) => total + toMoneyNumber(account.balance),
      0
    );
    const creditCardsSummary = creditCards.reduce(
      (summary, card) => ({
        totalLimit: summary.totalLimit + toMoneyNumber(card.creditLimit),
        usedLimit: summary.usedLimit + toMoneyNumber(card.usedLimit),
        availableLimit: summary.availableLimit + toMoneyNumber(card.availableLimit)
      }),
      {
        totalLimit: 0,
        usedLimit: 0,
        availableLimit: 0
      }
    );

    return {
      data: {
        ok: true,
        referenceDate: getTodayDateString(),
        totalCurrentBalance: currentBalanceTotal,
        totalCurrentBalanceIncludesCreditCards: false,
        accounts: nonCreditAccounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          bankName: account.bankName,
          balance: toMoneyNumber(account.balance),
          isDefault: account.isDefault
        })),
        creditCardsSummary
      }
    };
  }

  private static async getCreditCardOverview(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = getCreditCardOverviewArgsSchema.parse(rawArguments);
    const creditCards = await getSearchableAccounts({
      userId: context.userId,
      role: context.role,
      companyId: context.companyId,
      type: AccountType.CREDIT_CARD
    });

    let selectedCards = creditCards;

    if (args.accountId != null) {
      selectedCards = creditCards.filter((card) => card.id === args.accountId);
    } else if (hasExplicitHint(args.accountHint)) {
      const rankedMatches = rankSearchableAccounts(creditCards, args.accountHint);
      const bestMatch = rankedMatches[0]?.score >= 60 ? rankedMatches[0].account : null;

      if (bestMatch) {
        selectedCards = creditCards.filter((card) => card.id === bestMatch.id);
      } else {
        return {
          data: {
            ok: false,
            error: 'Cartao de credito nao encontrado para o criterio informado.',
            matches: rankedMatches.slice(0, 5).map(({ account, score }) => ({
              id: account.id,
              name: account.name,
              bankName: account.bankName,
              matchScore: score
            }))
          }
        };
      }
    }

    if (selectedCards.length === 0) {
      return {
        data: {
          ok: false,
          error: 'Nenhum cartao de credito acessivel encontrado.'
        }
      };
    }

    const summary = selectedCards.reduce(
      (totals, card) => ({
        totalLimit: totals.totalLimit + toMoneyNumber(card.creditLimit),
        usedLimit: totals.usedLimit + toMoneyNumber(card.usedLimit),
        availableLimit: totals.availableLimit + toMoneyNumber(card.availableLimit)
      }),
      {
        totalLimit: 0,
        usedLimit: 0,
        availableLimit: 0
      }
    );

    return {
      data: {
        ok: true,
        referenceDate: getTodayDateString(),
        summary,
        cards: selectedCards.map((card) => ({
          id: card.id,
          name: card.name,
          bankName: card.bankName,
          balance: toMoneyNumber(card.balance),
          creditLimit: toMoneyNumber(card.creditLimit),
          usedLimit: toMoneyNumber(card.usedLimit),
          availableLimit: toMoneyNumber(card.availableLimit),
          statementClosingDay: card.statementClosingDay,
          statementDueDay: card.statementDueDay,
          currentInvoice: card.nextInvoice
            ? {
                reference: formatCreditCardReference(
                  card.nextInvoice.referenceYear,
                  card.nextInvoice.referenceMonth
                ),
                referenceYear: card.nextInvoice.referenceYear,
                referenceMonth: card.nextInvoice.referenceMonth,
                dueDate: card.nextInvoice.dueDate,
                totalAmount: toMoneyNumber(card.nextInvoice.totalAmount),
                displayStatus: card.nextInvoice.displayStatus
              }
            : null
        }))
      }
    };
  }

  private static async getDueObligations(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = getDueObligationsArgsSchema.parse(rawArguments);
    const limit = clampLimit(args.limit, 10, 20);
    const { startDate, endDate, label } = buildDueWindow(args);
    const [accessibleAccountIds, accessFilter] = await Promise.all([
      getAccessibleAccountIds(context),
      getAccessibleTransactionFilter(context)
    ]);

    const result = await FinancialTransactionService.listTransactions({
      companyId: context.companyId,
      startDate,
      endDate,
      dateField: 'dueDate',
      includeCreditCardTransactions: true,
      includeVirtualFixed: true,
      ignoredState: 'ACTIVE',
      types: [TransactionType.EXPENSE],
      status: TransactionStatus.PENDING,
      page: 1,
      pageSize: limit,
      accessFilter,
      accessibleAccountIds
    });

    return {
      data: {
        ok: true,
        window: label,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalItems: result.total,
        totalAmount: toMoneyNumber(result.summary.expenseTotal),
        items: result.data.map((item: any) => ({
          id: item.id ?? null,
          description: item.description,
          amount: toMoneyNumber(item.amount),
          dueDate: item.dueDate instanceof Date
            ? item.dueDate.toISOString()
            : item.dueDate
              ? String(item.dueDate)
              : null,
          status: item.status,
          accountName: item.fromAccount?.name || item.toAccount?.name || null,
          categoryName: item.category?.name || null,
          isProjected: Boolean(item.isProjected),
          isCreditCardInvoiceSummary: Boolean(item.isCreditCardInvoiceSummary),
          invoiceReference: formatCreditCardReference(
            item.creditCardInvoice?.referenceYear,
            item.creditCardInvoice?.referenceMonth
          )
        }))
      }
    };
  }

  private static async cancelPendingAction(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = cancelPendingActionArgsSchema.parse(rawArguments);
    const pendingActionId =
      args.pendingActionId ??
      (
        await this.resolvePendingActionRecord(context, null)
      ).id;
    const pendingAction = await PendingActionService.cancelPendingAction({
      pendingActionId,
      userId: context.userId,
      companyId: context.companyId
    });

    return {
      pendingAction,
      data: {
        ok: true,
        pendingAction
      }
    };
  }

  private static async getRecentTransactions(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = getRecentTransactionsArgsSchema.parse(rawArguments);
    const accountIds = await getAccessibleAccountIds(context);
    const limit = clampLimit(args.limit, 5, 10);

    const recentTransactions = await prisma.financialTransaction.findMany({
      where: {
        companyId: context.companyId,
        ...buildOperationalTransactionWhere(),
        ...(args.type ? { type: args.type } : {}),
        ...(accountIds && accountIds.length > 0
          ? {
              OR: [{ fromAccountId: { in: accountIds } }, { toAccountId: { in: accountIds } }]
            }
          : {})
      },
      select: {
        id: true,
        description: true,
        amount: true,
        type: true,
        status: true,
        date: true,
        category: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: limit
    });

    return {
      data: {
        ok: true,
        transactions: recentTransactions.map((transaction) => ({
          id: transaction.id,
          description: transaction.description,
          amount: Number(transaction.amount),
          type: transaction.type,
          status: transaction.status,
          date: transaction.date.toISOString(),
          category: transaction.category
        }))
      }
    };
  }
}
