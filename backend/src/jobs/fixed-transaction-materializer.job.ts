import FixedTransactionService from '../services/fixed-transaction.service';
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

  try {
    const result = await FixedTransactionService.materializeDueOccurrencesForDate(now);
    lastRunDate = dateKey;

    logger.info('Daily fixed transaction materialization executed', {
      dateKey,
      processedTemplates: result.processed,
      createdTransactions: result.created
    });
  } catch (error: any) {
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
