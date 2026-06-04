import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default class AssistantTraceService {
  static async recordToolTrace(params: {
    turnId: number;
    userId: number;
    companyId: number;
    toolName: string;
    toolCallId?: string | null;
    status: 'success' | 'error';
    input: Record<string, unknown>;
    output?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }) {
    return prisma.assistantToolTrace.create({
      data: {
        turnId: params.turnId,
        userId: params.userId,
        companyId: params.companyId,
        toolName: params.toolName,
        toolCallId: params.toolCallId ?? null,
        status: params.status,
        input: params.input as Prisma.InputJsonValue,
        output: (params.output ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: params.errorMessage ?? null
      }
    });
  }
}
