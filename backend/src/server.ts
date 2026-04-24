import { startServer } from './app';
import { PORT } from './config';
import { logger } from './utils/logger';
import { startFixedTransactionMaterializerJob } from './jobs/fixed-transaction-materializer.job';

startServer(PORT);
startFixedTransactionMaterializerJob();

logger.info(`Servidor rodando na porta ${PORT}`);
