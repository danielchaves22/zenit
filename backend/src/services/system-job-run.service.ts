import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export type SystemJobRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';

type SafeJson = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;

function normalizeJson(value: unknown): SafeJson {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch (error) {
    return {
      serializationError: error instanceof Error ? error.message : String(error)
    };
  }
}

export default class SystemJobRunService {
  static async start(jobName: string, metadata?: unknown) {
    try {
      return await prisma.systemJobRun.create({
        data: {
          jobName,
          status: 'RUNNING',
          startedAt: new Date(),
          metadata: normalizeJson(metadata)
        }
      });
    } catch (error: any) {
      logger.warn('Unable to persist system job start', {
        jobName,
        error: error?.message ?? String(error)
      });
      return null;
    }
  }

  static async finish(params: {
    runId: number | null | undefined;
    status: Exclude<SystemJobRunStatus, 'RUNNING'>;
    processedCount?: number;
    createdCount?: number;
    skippedCount?: number;
    failedCount?: number;
    errorMessage?: string | null;
    errorDetails?: unknown;
    metadata?: unknown;
  }) {
    if (!params.runId) {
      return null;
    }

    try {
      const existing = await prisma.systemJobRun.findUnique({
        where: { id: params.runId },
        select: { startedAt: true }
      });
      const finishedAt = new Date();

      return await prisma.systemJobRun.update({
        where: { id: params.runId },
        data: {
          status: params.status,
          finishedAt,
          durationMs: existing
            ? Math.max(0, finishedAt.getTime() - existing.startedAt.getTime())
            : null,
          processedCount: params.processedCount ?? 0,
          createdCount: params.createdCount ?? 0,
          skippedCount: params.skippedCount ?? 0,
          failedCount: params.failedCount ?? 0,
          errorMessage: params.errorMessage ?? null,
          errorDetails: normalizeJson(params.errorDetails),
          metadata: normalizeJson(params.metadata)
        }
      });
    } catch (error: any) {
      logger.warn('Unable to persist system job finish', {
        runId: params.runId,
        status: params.status,
        error: error?.message ?? String(error)
      });
      return null;
    }
  }

  static async listRecent(jobName?: string, limit = 20) {
    return prisma.systemJobRun.findMany({
      where: jobName ? { jobName } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit
    });
  }
}
