import { AssistantMessageRole, AssistantMode, AssistantTurnStatus, PrismaClient } from '@prisma/client';
import { AssistantAction, AssistantCard, AssistantStreamEvent, AssistantTurnResponse, PendingAction } from '@zenit/assistant-contracts';
import AssistantMessageService from './assistant-message.service';
import AssistantSessionService from './assistant-session.service';
import LlmRuntimeService from './llm-runtime.service';

const prisma = new PrismaClient();

function splitMessageIntoDeltas(message: string): string[] {
  const normalized = message.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += 32) {
    chunks.push(normalized.slice(index, index + 32));
  }

  return chunks;
}

function buildCards(pendingAction?: PendingAction): AssistantCard[] {
  if (!pendingAction) {
    return [];
  }

  return [
    {
      id: `draft-transaction-${pendingAction.id}`,
      kind: 'draft_transaction',
      title: 'Rascunho de lancamento',
      body: 'Confirme para gravar a transacao.',
      draft: pendingAction.summary
    }
  ];
}

function buildActions(pendingAction?: PendingAction): AssistantAction[] {
  if (!pendingAction) {
    return [];
  }

  return [
    {
      id: `confirm-${pendingAction.id}`,
      kind: 'confirm_pending_action',
      label: 'Confirmar',
      pendingActionId: pendingAction.id
    },
    {
      id: `cancel-${pendingAction.id}`,
      kind: 'cancel_pending_action',
      label: 'Cancelar',
      pendingActionId: pendingAction.id
    }
  ];
}

async function emitEvent(
  event: AssistantStreamEvent,
  onEvent: (event: AssistantStreamEvent) => Promise<void> | void
) {
  await onEvent(event);
}

export default class AssistantOrchestratorService {
  static async processTurn(params: {
    sessionId: number;
    userId: number;
    companyId: number;
    role: any;
    message: string;
    onEvent: (event: AssistantStreamEvent) => Promise<void> | void;
  }): Promise<AssistantTurnResponse> {
    await AssistantSessionService.getOwnedSessionOrThrow({
      sessionId: params.sessionId,
      userId: params.userId,
      companyId: params.companyId
    });

    const turn = await prisma.assistantTurn.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        companyId: params.companyId,
        mode: AssistantMode.OPERATOR,
        status: AssistantTurnStatus.STARTED
      }
    });

    try {
      await AssistantMessageService.createMessage({
        sessionId: params.sessionId,
        turnId: turn.id,
        userId: params.userId,
        companyId: params.companyId,
        role: AssistantMessageRole.USER,
        text: params.message
      });

      await emitEvent(
        {
          type: 'turn.started',
          sessionId: params.sessionId,
          assistantTurnId: turn.id
        },
        params.onEvent
      );

      const conversation = await AssistantMessageService.listConversationContext(params.sessionId);
      const llmResult = await LlmRuntimeService.runOperatorTurn({
        context: {
          sessionId: params.sessionId,
          turnId: turn.id,
          userId: params.userId,
          companyId: params.companyId,
          role: params.role,
          mode: AssistantMode.OPERATOR
        },
        conversation
      });

      const cards = buildCards(llmResult.pendingAction);
      const actions = buildActions(llmResult.pendingAction);

      const finalResponse: AssistantTurnResponse = {
        sessionId: params.sessionId,
        assistantTurnId: turn.id,
        mode: llmResult.mode,
        message: llmResult.message,
        cards,
        actions,
        pendingAction: llmResult.pendingAction ?? null,
        telemetry: llmResult.telemetry
      };

      await AssistantMessageService.createMessage({
        sessionId: params.sessionId,
        turnId: turn.id,
        userId: params.userId,
        companyId: params.companyId,
        role: AssistantMessageRole.ASSISTANT,
        text: llmResult.message,
        content: finalResponse as unknown as Record<string, unknown>
      });

      await prisma.assistantTurn.update({
        where: { id: turn.id },
        data: {
          mode: AssistantMode.OPERATOR,
          status: AssistantTurnStatus.COMPLETED,
          telemetry: llmResult.telemetry,
          completedAt: new Date()
        }
      });

      for (const delta of splitMessageIntoDeltas(llmResult.message)) {
        await emitEvent(
          {
            type: 'message.delta',
            sessionId: params.sessionId,
            assistantTurnId: turn.id,
            delta
          },
          params.onEvent
        );
      }

      await emitEvent(
        {
          type: 'message.completed',
          sessionId: params.sessionId,
          assistantTurnId: turn.id,
          response: finalResponse
        },
        params.onEvent
      );

      if (llmResult.pendingAction) {
        await emitEvent(
          {
            type: 'pending_action.created',
            sessionId: params.sessionId,
            assistantTurnId: turn.id,
            pendingAction: llmResult.pendingAction
          },
          params.onEvent
        );
      }

      await emitEvent(
        {
          type: 'turn.completed',
          sessionId: params.sessionId,
          assistantTurnId: turn.id,
          response: finalResponse
        },
        params.onEvent
      );

      return finalResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await prisma.assistantTurn.update({
        where: {
          id: turn.id
        },
        data: {
          status: AssistantTurnStatus.FAILED,
          errorMessage: message,
          completedAt: new Date()
        }
      });

      await emitEvent(
        {
          type: 'turn.error',
          sessionId: params.sessionId,
          assistantTurnId: turn.id,
          error: message
        },
        params.onEvent
      );

      throw error;
    }
  }
}
