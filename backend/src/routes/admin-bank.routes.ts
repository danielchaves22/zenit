import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  createAdminBank,
  deleteAdminBank,
  getAdminBank,
  listAdminBankIconOptions,
  listAdminBanks,
  updateAdminBank
} from '../controllers/bank.controller';
import { createBankSchema, updateBankSchema } from '../validators/bank.validator';

const router = Router();

router.get('/icon-options', listAdminBankIconOptions);
router.get('/', listAdminBanks);
router.get('/:id', getAdminBank);
router.post('/', validate(createBankSchema), createAdminBank);
router.put('/:id', validate(updateBankSchema), updateAdminBank);
router.delete('/:id', deleteAdminBank);

export default router;
