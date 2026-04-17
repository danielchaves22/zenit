import { logger } from './logger';

type AuditDetails = Record<string, unknown>;

export function logAuditEvent(action: string, details: AuditDetails): void {
  logger.info(`[AUDIT] ${action} ${JSON.stringify(details)}`);
}
