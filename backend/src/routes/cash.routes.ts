import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { getBudgets, syncBudgets } from '../controllers/budget.controller';
import { budgetSyncSchema } from '../validators/budget.validator';

const router = Router();

router.get('/budgets', getBudgets);
router.put('/budgets/sync', validate(budgetSyncSchema), syncBudgets);

export default router;
