import { AssistantPendingActionStatus, AssistantPendingActionType, PrismaClient, Role } from '@prisma/client';
import { DraftTransactionSummary, PendingAction, pendingActionSchema } from '@zenit/assistant-contracts';
import { z } from 'zod';
import FinancialTransactionService from './financial-transaction.service';
import UserFinancialAccountAccessService from './user-financial-account-access.service';

const prisma = new PrismaClient();

const draftTransactionPayloadSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED']).default('COMPLETED'),
  date: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  installmentCount: z.number().int().min(1).max(120).optional(),
  fromAccountId: z.number().int().positive().nullable().optional(),
  toAccountId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional()
});

export type DraftTransactionPayload = z.infer<typeof draftTransactionPayloadSchema>;

function toIso(value: Date): string {
  return value.toISOString();
}

function assistantPendingActionToContract(record: {
  id: number;
  type: AssistantPendingActionType;
  status: AssistantPendingActionStatus;
  summary: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PendingAction {
  return pendingActionSchema.parse({
    id: record.id,
    type: record.type,
    status: record.status,
    summary: record.summary,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt)
  });
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  return new Date(value);
}

export default class PendingActionService {
  static async createTransactionDraftAction(params: {
    sessionId: number;
    turnId: number;
    userId: number;
    companyId: number;
    summary: DraftTransactionSummary;
    payload: DraftTransactionPayload;
  }): Promise<PendingAction> {
    const parsedPayload = draftTransactionPayloadSchema.parse(params.payload);

    const record = await prisma.assistantPendingAction.create({
      data: {
        sessionId: params.sessionId,
        turnId: params.turnId,
        userId: params.userId,
        companyId: params.companyId,
        type: AssistantPendingActionType.CREATE_TRANSACTION_DRAFT,
        status: AssistantPendingActionStatus.PENDING,
        summary: params.summary,
        payload: parsedPayload
      }
    });

    return assistantPendingActionToContract(record);
  }

  static async getOwnedPendingActionOrThrow(params: {
    pendingActionId: number;
    userId: number;
    companyId: number;
  }) {
    const pendingAction = await prisma.assistantPendingAction.findFirst({
      where: {
        id: params.pendingActionId,
        userId: params.userId,
        companyId: params.companyId
      }
    });

    if (!pendingAction) {
      throw new Error('Acao pendente nao encontrada');
    }

    return pendingAction;
  }

  static async getPendingAction(params: {
    pendingActionId: number;
    userId: number;
    companyId: number;
  }): Promise<PendingAction> {
    const pendingAction = await this.getOwnedPendingActionOrThrow(params);
    return assistantPendingActionToContract(pendingAction);
  }

  static async getLatestPendingActionForSession(params: {
    sessionId: number;
    userId: number;
    companyId: number;
  }): Promise<PendingAction | null> {
    const record = await prisma.assistantPendingAction.findFirst({
      where: {
        sessionId: params.sessionId,
        userId: params.userId,
        companyId: params.companyId,
        status: AssistantPendingActionStatus.PENDING
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    return record ? assistantPendingActionToContract(record) : null;
  }

  static async updateTransactionDraftAction(params: {
    pendingActionId: number;
    userId: number;
    companyId: number;
    summary: DraftTransactionSummary;
    payload: DraftTransactionPayload;
  }): Promise<PendingAction> {
    const pendingAction = await this.getOwnedPendingActionOrThrow({
      pendingActionId: params.pendingActionId,
      userId: params.userId,
      companyId: params.companyId
    });

    if (pendingAction.type !== AssistantPendingActionType.CREATE_TRANSACTION_DRAFT) {
      throw new Error('Tipo de acao pendente nao suportado para atualizacao');
    }

    if (pendingAction.status !== AssistantPendingActionStatus.PENDING) {
      throw new Error('Acao pendente nao pode mais ser atualizada');
    }

    const parsedPayload = draftTransactionPayloadSchema.parse(params.payload);

    const updated = await prisma.assistantPendingAction.update({
      where: {
        id: params.pendingActionId
      },
      data: {
        summary: params.summary,
        payload: parsedPayload
      }
    });

    return assistantPendingActionToContract(updated);
  }

  static async cancelPendingAction(params: {
    pendingActionId: number;
    userId: number;
    companyId: number;
  }): Promise<PendingAction> {
    await this.getOwnedPendingActionOrThrow(params);

    const updated = await prisma.assistantPendingAction.update({
      where: {
        id: params.pendingActionId
      },
      data: {
        status: AssistantPendingActionStatus.CANCELED,
        canceledAt: new Date()
      }
    });

    return assistantPendingActionToContract(updated);
  }

  static async confirmTransactionDraft(params: {
    pendingActionId: number;
    userId: number;
    companyId: number;
    role: Role;
  }) {
    const pendingAction = await this.getOwnedPendingActionOrThrow(params);

    if (pendingAction.type !== AssistantPendingActionType.CREATE_TRANSACTION_DRAFT) {
      throw new Error('Tipo de acao pendente nao suportado');
    }

    if (pendingAction.status !== AssistantPendingActionStatus.PENDING) {
      throw new Error('Acao pendente nao pode mais ser confirmada');
    }

    const payload = draftTransactionPayloadSchema.parse(pendingAction.payload);

    if (payload.fromAccountId) {
      const allowed = await UserFinancialAccountAccessService.checkUserAccountAccess(
        params.userId,
        payload.fromAccountId,
        params.role,
        params.companyId
      );
      if (!allowed) {
        throw new Error('Usuario sem acesso a conta de origem da acao pendente');
      }
    }

    if (payload.toAccountId) {
      const allowed = await UserFinancialAccountAccessService.checkUserAccountAccess(
        params.userId,
        payload.toAccountId,
        params.role,
        params.companyId
      );
      if (!allowed) {
        throw new Error('Usuario sem acesso a conta de destino da acao pendente');
      }
    }

    const created = await FinancialTransactionService.createTransaction({
      description: payload.description,
      amount: payload.amount,
      date: toDate(payload.date) as Date,
      dueDate: toDate(payload.dueDate),
      effectiveDate: toDate(payload.effectiveDate),
      type: payload.type,
      status: payload.status,
      notes: payload.notes ?? undefined,
      fromAccountId: payload.fromAccountId ?? undefined,
      toAccountId: payload.toAccountId ?? undefined,
      categoryId: payload.categoryId ?? undefined,
      companyId: params.companyId,
      createdBy: params.userId,
      installmentCount: payload.installmentCount ?? 1
    });

    const firstTransaction = Array.isArray(created) ? created[0] : created;

    const updatedAction = await prisma.assistantPendingAction.update({
      where: {
        id: params.pendingActionId
      },
      data: {
        status: AssistantPendingActionStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedTransactionId: firstTransaction.id
      }
    });

    return {
      pendingAction: assistantPendingActionToContract(updatedAction),
      transaction: created
    };
  }
}
