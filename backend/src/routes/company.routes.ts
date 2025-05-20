import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { tenantMiddleware } from '../middlewares/tenant.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCompany,
  listCompanies,
  updateCompany,
  deleteCompany
} from '../controllers/company.controller';
import {
  createCompanySchema,
  updateCompanySchema
} from '../validators/company.validator';

const router = Router();

router.post(
  '/',
  validate(createCompanySchema),
  authorize('create', 'company'),
  createCompany
);
router.get('/', authorize('read', 'company'), listCompanies);
router.put(
  '/:id',
  validate(updateCompanySchema),
  authorize('update', 'company'),
  updateCompany
);
router.delete('/:id', authorize('delete', 'company'), deleteCompany);

export default router;
