import { Router } from 'express';
import { getSystemOperationsOverview } from '../controllers/system-operations.controller';

const router = Router();

router.get('/overview', getSystemOperationsOverview);

export default router;
