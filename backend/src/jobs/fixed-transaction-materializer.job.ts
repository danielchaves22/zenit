import FixedTransactionService from '../services/fixed-transaction.service';
import SystemJobRunService from '../services/system-job-run.service';
import { logger } from '../utils/logger';

let intervalHandle: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runMaterializationForCurrentDay(): Promise<void> {
  const now = new Date();
  const dateKey = getDateKey(now);

  if (lastRunDate === dateKey) {
    return;
  }

  const jobRun = await SystemJobRunService.start('fixed-transaction-materializer', {
    dateKey
  });

  try {
    const result = await FixedTransactionService.materializeDueOccurrencesForDate(now);
    lastRunDate = dateKey;
    await SystemJobRunService.finish({
      runId: jobRun?.id,
      status: result.failed > 0 ? 'PARTIAL' : 'SUCCESS',
      processedCount: result.processed,
      createdCount: result.created,
      failedCount: result.failed,
      skippedCount: Math.max(0, result.processed - result.created - result.failed),
      errorDetails: result.errors.length > 0 ? result.errors : undefined,
      metadata: { dateKey }
    });

    logger.info('Daily fixed transaction materialization executed', {
      dateKey,
      processedTemplates: result.processed,
      createdTransactions: result.created,
      failedTemplates: result.failed
    });
  } catch (error: any) {
    await SystemJobRunService.finish({
      runId: jobRun?.id,
      status: 'FAILED',
      errorMessage: error?.message ?? String(error),
      errorDetails: {
        stack: error?.stack
      },
      metadata: { dateKey }
    });

    logger.error('Error running daily fixed materialization job', {
      error: error.message,
      stack: error.stack
    });
  }
}

export function startFixedTransactionMaterializerJob(): void {
  if (intervalHandle) {
    return;
  }

  // Run once on startup and then hourly.
  void runMaterializationForCurrentDay();

  intervalHandle = setInterval(() => {
    void runMaterializationForCurrentDay();
  }, 60 * 60 * 1000);

  logger.info('Fixed transaction materializer job started (hourly)');
}

export function stopFixedTransactionMaterializerJob(): void {
  if (!intervalHandle) {
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
  logger.info('Fixed transaction materializer job stopped');
}
