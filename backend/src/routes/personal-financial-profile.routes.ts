import { Router } from 'express';
import {
  getPersonalFinancialProfile,
  savePersonalFinancialProfile
} from '../controllers/personal-financial-profile.controller';
import { validate } from '../middlewares/validate.middleware';
import { savePersonalFinancialProfileSchema } from '../validators/personal-financial-profile.validator';

const router = Router();

router.get('/financial-profile', getPersonalFinancialProfile);
router.put(
  '/financial-profile',
  validate(savePersonalFinancialProfileSchema, { source: 'body' }),
  savePersonalFinancialProfile
);

export default router;
