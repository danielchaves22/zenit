import dotenv from 'dotenv';
import EmailIngestionService from '../services/email-ingestion.service';
import { logger } from '../utils/logger';

dotenv.config();

const intervalMs = Number(process.env.GMAIL_WORKER_INTERVAL_MS || 60000);

let running = false;

async function runCycle() {
  if (running) {
    logger.info('gmail-worker cycle skipped: previous cycle still running');
    return;
  }

  running = true;

  try {
    const summary = await EmailIngestionService.pollEnabledCompanies();
    logger.info('gmail-worker cycle completed', {
      companies: summary.length,
      ok: summary.filter((item) => item.ok).length,
      failed: summary.filter((item) => !item.ok).length
    });
  } catch (error: any) {
    logger.error('gmail-worker cycle failed', {
      error: error.message || String(error)
    });
  } finally {
    running = false;
  }
}

async function start() {
  logger.info('gmail-worker started', { intervalMs });

  await runCycle();

  setInterval(() => {
    void runCycle();
  }, Math.max(intervalMs, 10000));
}

void start();

