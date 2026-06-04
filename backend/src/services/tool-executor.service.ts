import { AssistantMode, AssistantPendingActionType, PrismaClient, Role, TransactionStatus, TransactionType } from '@prisma/client';
import { DraftTransactionSummary, PendingAction } from '@zenit/assistant-contracts';
import { z } from 'zod';
import FinancialAccountService from './financial-account.service';
import PendingActionService, { DraftTransactionPayload } from './pending-action.service';
import UserFinancialAccountAccessService from './user-financial-account-access.service';

const prisma = new PrismaClient();

const createTransactionDraftArgsSchema = z.object({
  description: z.string().trim().min(1).max(255),
  amount: z.coerce.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  date: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
  notes: z.string().nullable().optional(),
  installmentCount: z.coerce.number().int().min(1).max(120).nullable().optional(),
  accountHint: z.string().nullable().optional(),
  fromAccountHint: z.string().nullable().optional(),
  toAccountHint: z.string().nullable().optional(),
  categoryHint: z.string().nullable().optional()
});

const cancelPendingActionArgsSchema = z.object({
  pendingActionId: z.coerce.number().int().positive()
});

const getRecentTransactionsArgsSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(10).nullable().optional()
});

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

function scoreCandidate(value: string, candidate: string): number {
  if (!value || !candidate) {
    return -1;
  }

  if (candidate === value) {
    return 100;
  }

  if (candidate.startsWith(value)) {
    return 75;
  }

  if (candidate.includes(value)) {
    return 50;
  }

  if (value.includes(candidate)) {
    return 25;
  }

  return -1;
}

function chooseBestAccountMatch(accounts: AccountCandidate[], hint?: string | null) {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) {
    return null;
  }

  const ranked = accounts
    .map((account) => {
      const nameScore = scoreCandidate(normalizedHint, normalizeText(account.name));
      const bankScore = scoreCandidate(normalizedHint, normalizeText(account.bankName));
      return {
        account,
        score: Math.max(nameScore, bankScore)
      };
    })
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.account ?? null;
}

function chooseBestCategoryMatch(
  categories: Array<{ id: number; name: string; isDefault: boolean }>,
  hint?: string | null
) {
  const normalizedHint = normalizeText(hint);
  if (normalizedHint) {
    const ranked = categories
      .map((category) => ({
        category,
        score: scoreCandidate(normalizedHint, normalizeText(category.name))
      }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score);

    if (ranked[0]) {
      return ranked[0].category;
    }
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
    return activeAccounts[0] ?? null;
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
      case 'cancel_pending_action':
        return this.cancelPendingAction(argumentsJson, context);
      case 'get_recent_transactions':
        return this.getRecentTransactions(argumentsJson, context);
      default:
        throw new Error(`Tool nao suportada: ${toolName}`);
    }
  }

  private static async createTransactionDraft(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = createTransactionDraftArgsSchema.parse(rawArguments);
    const normalizedType = args.type as TransactionType;
    const normalizedStatus = (args.status ?? 'COMPLETED') as TransactionStatus;
    const normalizedDate = normalizeDateString(args.date);
    const normalizedDueDate =
      normalizedStatus === TransactionStatus.PENDING
        ? normalizeDateString(args.dueDate ?? normalizedDate)
        : args.dueDate
          ? normalizeDateString(args.dueDate)
          : null;
    const normalizedEffectiveDate =
      normalizedStatus === TransactionStatus.COMPLETED
        ? normalizeDateString(args.effectiveDate ?? normalizedDate)
        : args.effectiveDate
          ? normalizeDateString(args.effectiveDate)
          : null;

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
              isDefault: true
            },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
          })
    ]);

    const fromHint = args.fromAccountHint ?? args.accountHint ?? null;
    const toHint = args.toAccountHint ?? args.accountHint ?? null;

    let fromAccount: AccountCandidate | null = null;
    let toAccount: AccountCandidate | null = null;
    const missingFields: string[] = [];

    if (normalizedType === TransactionType.EXPENSE || normalizedType === TransactionType.TRANSFER) {
      fromAccount = chooseBestAccountMatch(accounts, fromHint) ?? pickDefaultAccount(accounts, normalizedType);
      if (!fromAccount) {
        missingFields.push('fromAccount');
      }
    }

    if (normalizedType === TransactionType.INCOME || normalizedType === TransactionType.TRANSFER) {
      const accountPool =
        normalizedType === TransactionType.TRANSFER && fromAccount
          ? accounts.filter((account) => account.id !== fromAccount?.id)
          : accounts;
      toAccount = chooseBestAccountMatch(accountPool, toHint) ?? pickDefaultAccount(accountPool, normalizedType);
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

    const matchedCategory =
      normalizedType === TransactionType.TRANSFER
        ? null
        : chooseBestCategoryMatch(categories, args.categoryHint ?? args.description);

    if (normalizedType !== TransactionType.TRANSFER && !matchedCategory) {
      missingFields.push('category');
    }

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

    const payload: DraftTransactionPayload = {
      description: args.description,
      amount: args.amount,
      type: normalizedType,
      status: normalizedStatus,
      date: normalizedDate,
      dueDate: normalizedDueDate,
      effectiveDate: normalizedEffectiveDate,
      notes: args.notes ?? null,
      installmentCount: args.installmentCount ?? 1,
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

  private static async cancelPendingAction(
    rawArguments: Record<string, unknown>,
    context: AssistantToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const args = cancelPendingActionArgsSchema.parse(rawArguments);
    const pendingAction = await PendingActionService.cancelPendingAction({
      pendingActionId: args.pendingActionId,
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
    const accountIds =
      context.role === 'ADMIN' || context.role === 'SUPERUSER'
        ? undefined
        : await UserFinancialAccountAccessService.getUserAccessibleAccounts(
            context.userId,
            context.role,
            context.companyId
          );

    const recentTransactions = await prisma.financialTransaction.findMany({
      where: {
        companyId: context.companyId,
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
      take: args.limit ?? 5
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
