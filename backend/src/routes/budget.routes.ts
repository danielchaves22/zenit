import { Router } from 'express';
import { createOrUpdateBudget, listBudgets, addTransaction } from '../controllers/budget.controller';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

router.get('/budgets', listBudgets);
router.post('/budgets', createOrUpdateBudget);
router.post('/budgets/:id/transactions', addTransaction);

export default router;

