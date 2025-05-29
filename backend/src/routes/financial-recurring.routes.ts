// backend/src/routes/financial-recurring.routes.ts
import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  createRecurringTransactionSchema,
  updateRecurringTransactionSchema,
  generateTransactionsSchema
} from '../validators/financial-recurring.validator';

import {
  createRecurringTransaction,
  getRecurringTransactions,
  getRecurringTransactionById,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  generateScheduledTransactions,
  getProjectedTransactions
} from '../controllers/financial-recurring.controller';

const router = Router();

// Rotas de Transações Recorrentes
router.post('/', validate(createRecurringTransactionSchema), createRecurringTransaction);
router.get('/', getRecurringTransactions);
router.get('/projections', getProjectedTransactions);
router.get('/:id', getRecurringTransactionById);
router.put('/:id', validate(updateRecurringTransactionSchema), updateRecurringTransaction);
router.delete('/:id', deleteRecurringTransaction);
router.post('/:id/generate', validate(generateTransactionsSchema), generateScheduledTransactions);

export default router;