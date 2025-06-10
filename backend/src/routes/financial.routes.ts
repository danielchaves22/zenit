import { requireAccountAccess, requireTransactionAccountAccess } from '../middlewares/financial-access.middleware';
import { requireFeaturePermission } from '../middlewares/feature-permission.middleware';
import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsSchema
} from '../validators/financial-account.validator';
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema
} from '../validators/financial-category.validator';
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  updateTransactionStatusSchema,
  autocompleteQuerySchema
} from '../validators/financial-transaction.validator';

import {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  adjustBalance
} from '../controllers/financial-account.controller';

import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/financial-category.controller';

import {
  setDefaultAccount,
  unsetDefaultAccount,
  setDefaultCategory,
  unsetDefaultCategory,
  getCompanyDefaults
} from '../controllers/default.controller';

import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  updateTransactionStatus,
  deleteTransaction,
  getFinancialSummary,
  getTransactionAutocomplete
} from '../controllers/financial-transaction.controller';

// ✅ IMPORTAR ROTAS RECORRENTES E RELATÓRIOS
import recurringRoutes from './financial-recurring.routes';
import financialAccountMovementRoutes from './financial-account-movement-report.routes';

const router = Router();

// Rotas de padrões da empresa
router.get('/defaults', getCompanyDefaults);

// Rotas de Contas Financeiras
router.post('/accounts', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(createAccountSchema), createAccount);
router.get('/accounts', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(listAccountsSchema), getAccounts);
router.get('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), getAccountById); // ✅ MIDDLEWARE
router.put('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), validate(updateAccountSchema), updateAccount); // ✅ MIDDLEWARE
router.delete('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), deleteAccount); // ✅ MIDDLEWARE
router.post('/accounts/:id/adjust-balance', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), adjustBalance); // ✅ MIDDLEWARE

// Gerenciar conta padrão
router.post('/accounts/:id/set-default', requireAccountAccess(), setDefaultAccount); // ✅ MIDDLEWARE
router.delete('/accounts/:id/set-default', requireAccountAccess(), unsetDefaultAccount); // ✅ MIDDLEWARE

// Rotas de Categorias Financeiras
router.post('/categories', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(createCategorySchema), createCategory);
router.get('/categories', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(listCategoriesSchema), getCategories);
router.get('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), getCategoryById);
router.put('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), deleteCategory);

// Gerenciar categoria padrão
router.post('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), setDefaultCategory);
router.delete('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), unsetDefaultCategory);

// ✅ ROTA DE AUTOCOMPLETE - DEVE VIR ANTES DAS ROTAS COM :id
router.get('/transactions/autocomplete', validate(autocompleteQuerySchema), getTransactionAutocomplete);

// Rotas de Transações Financeiras
router.post('/transactions', requireTransactionAccountAccess(), validate(createTransactionSchema), createTransaction); // ✅ MIDDLEWARE
router.get('/transactions', validate(listTransactionsSchema), getTransactions);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id', requireTransactionAccountAccess(), validate(updateTransactionSchema), updateTransaction); // ✅ MIDDLEWARE
router.patch('/transactions/:id/status', validate(updateTransactionStatusSchema), updateTransactionStatus);
router.delete('/transactions/:id', deleteTransaction);

// ✅ ROTAS DE RELATÓRIOS - ORDEM IMPORTA!
router.use('/reports/financial-account-movement', financialAccountMovementRoutes);

// ✅ ROTAS RECORRENTES
router.use('/recurring', recurringRoutes);

// Rotas de Relatórios/Dashboard
router.get('/summary', getFinancialSummary);

export default router;