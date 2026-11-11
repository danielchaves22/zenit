import prisma from '../lib/prisma';
import { draftCutoff } from '../utils/whatsapp-draft-lifecycle';
import { AssistantMessageRole, AssistantMode, Prisma } from '@prisma/client';


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
    limit = 12,
    whatsappDraft = false
  ): Promise<ConversationMessage[]> {
    const closed = whatsappDraft && await prisma.assistantPendingAction.findFirst({
      where: { sessionId, type: 'CREATE_TRANSACTION_DRAFT', status: { in: ['EXPIRED', 'CANCELED', 'CONFIRMED'] } },
      orderBy: { updatedAt: 'desc' }, select: { updatedAt: true }
    });
    const since = new Date(Math.max(draftCutoff().getTime(), closed ? closed.updatedAt.getTime() : 0));
    const messages = await prisma.assistantMessage.findMany({
      where: { sessionId, ...(whatsappDraft ? { createdAt: { gte: since } } : {}) },
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

    const start = whatsappDraft ? messages.findIndex(m => m.role === AssistantMessageRole.USER && m.content &&
      typeof m.content === 'object' && !Array.isArray(m.content) && m.content.whatsappDraftStart === true) : -1;
    return (start >= 0 ? messages.slice(0, start + 1) : messages)
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
