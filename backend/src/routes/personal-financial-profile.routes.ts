import { Router } from 'express';
import {
  getPersonalFinancialProfile,
  savePersonalFinancialProfile
} from '../controllers/personal-financial-profile.controller';
import { validate } from '../middlewares/validate.middleware';
import { savePersonalFinancialProfileSchema } from '../validators/personal-financial-profile.validator';
import { requireWorkspacePlanningAccess } from '../middlewares/workspace-planning-access.middleware';

const router = Router();

router.get(
  '/financial-profile',
  requireWorkspacePlanningAccess('READ'),
  getPersonalFinancialProfile
);
router.put(
  '/financial-profile',
  requireWorkspacePlanningAccess('MANAGE'),
  validate(savePersonalFinancialProfileSchema, { source: 'body' }),
  savePersonalFinancialProfile
);

export default router;
