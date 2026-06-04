import { AssistantMessageRole, PrismaClient } from '@prisma/client';
import { AssistantSessionHistory, PendingAction, pendingActionSchema } from '@zenit/assistant-contracts';

const prisma = new PrismaClient();

function toIso(value: Date): string {
  return value.toISOString();
}

export default class AssistantSessionService {
  static async createSession(params: {
    userId: number;
    companyId: number;
    title?: string;
  }) {
    return prisma.assistantSession.create({
      data: {
        userId: params.userId,
        companyId: params.companyId,
        title: params.title ?? null
      }
    });
  }

  static async getOwnedSessionOrThrow(params: {
    sessionId: number;
    userId: number;
    companyId: number;
  }) {
    const session = await prisma.assistantSession.findFirst({
      where: {
        id: params.sessionId,
        userId: params.userId,
        companyId: params.companyId
      }
    });

    if (!session) {
      throw new Error('Sessao do assistente nao encontrada');
    }

    return session;
  }

  static async listHistory(params: {
    sessionId: number;
    userId: number;
    companyId: number;
  }): Promise<AssistantSessionHistory> {
    await this.getOwnedSessionOrThrow(params);

    const [messages, pendingActions] = await Promise.all([
      prisma.assistantMessage.findMany({
        where: {
          sessionId: params.sessionId,
          userId: params.userId,
          companyId: params.companyId
        },
        include: {
          turn: {
            select: {
              id: true,
              mode: true
            }
          }
        },
        orderBy: {
          sequence: 'asc'
        }
      }),
      prisma.assistantPendingAction.findMany({
        where: {
          sessionId: params.sessionId,
          userId: params.userId,
          companyId: params.companyId
        }
      })
    ]);

    const pendingActionByTurnId = new Map<number, PendingAction>();
    for (const pendingAction of pendingActions) {
      const parsed = pendingActionSchema.parse({
        id: pendingAction.id,
        type: pendingAction.type,
        status: pendingAction.status,
        summary: pendingAction.summary,
        createdAt: toIso(pendingAction.createdAt),
        updatedAt: toIso(pendingAction.updatedAt)
      });
      pendingActionByTurnId.set(pendingAction.turnId, parsed);
    }

    return {
      sessionId: params.sessionId,
      messages: messages
        .filter((message) => message.role !== AssistantMessageRole.TOOL)
        .map((message) => ({
          id: message.id,
          turnId: message.turnId,
          role: message.role,
          text: message.text,
          mode: message.turn?.mode ?? null,
          createdAt: toIso(message.createdAt),
          pendingAction:
            message.role === AssistantMessageRole.ASSISTANT && message.turnId
              ? pendingActionByTurnId.get(message.turnId) ?? null
              : null
        }))
    };
  }
}
