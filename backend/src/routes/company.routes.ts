// backend/src/routes/company.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { tenantMiddleware } from '../middlewares/tenant.middleware';
import { authorize } from '../middlewares/authorize.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCompany,
  createFinancialStructure,
  listCompanies,
  updateCompany,
  deleteCompany
} from '../controllers/company.controller';
import {
  createCompanySchema,
  updateCompanySchema,
  createFinancialStructureSchema
} from '../validators/company.validator';

const router = Router();

// Criar empresa (com estrutura financeira opcional)
router.post(
  '/',
  validate(createCompanySchema),
  authorize('create', 'company'),
  createCompany
);

// Criar estrutura financeira para empresa existente
router.post(
  '/:id/financial-structure',
  validate(createFinancialStructureSchema),
  authorize('create', 'company'),
  createFinancialStructure
);

// Listar empresas
router.get('/', authorize('read', 'company'), listCompanies);

// Atualizar empresa
router.put(
  '/:id',
  validate(updateCompanySchema),
  authorize('update', 'company'),
  updateCompany
);

// Excluir empresa
router.delete('/:id', authorize('delete', 'company'), deleteCompany);

export default router;