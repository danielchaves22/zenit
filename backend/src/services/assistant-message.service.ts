import { AssistantMessageRole, AssistantMode, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type ConversationMessage = {
  id: number;
  role: AssistantMessageRole;
  text: string;
  createdAt: Date;
  mode: AssistantMode | null;
};

export default class AssistantMessageService {
  static async createMessage(params: {
    sessionId: number;
    turnId?: number | null;
    userId: number;
    companyId: number;
    role: AssistantMessageRole;
    text: string;
    content?: Record<string, unknown> | null;
  }) {
    const currentCount = await prisma.assistantMessage.count({
      where: { sessionId: params.sessionId }
    });

    return prisma.assistantMessage.create({
      data: {
        sessionId: params.sessionId,
        turnId: params.turnId ?? null,
        userId: params.userId,
        companyId: params.companyId,
        role: params.role,
        text: params.text,
        content: (params.content ?? undefined) as Prisma.InputJsonValue | undefined,
        sequence: currentCount + 1
      }
    });
  }

  static async listConversationContext(
    sessionId: number,
    limit = 12
  ): Promise<ConversationMessage[]> {
    const messages = await prisma.assistantMessage.findMany({
      where: { sessionId },
      include: {
        turn: {
          select: {
            mode: true
          }
        }
      },
      orderBy: {
        sequence: 'desc'
      },
      take: limit
    });

    return messages
      .reverse()
      .map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
        mode: message.turn?.mode ?? null
      }));
  }
}
