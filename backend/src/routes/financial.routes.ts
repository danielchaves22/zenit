// backend/src/routes/financial.routes.ts - VERSÃO CORRIGIDA COM RELATÓRIOS

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
router.post('/accounts', validate(createAccountSchema), createAccount);
router.get('/accounts', validate(listAccountsSchema), getAccounts);
router.get('/accounts/:id', getAccountById);
router.put('/accounts/:id', validate(updateAccountSchema), updateAccount);
router.delete('/accounts/:id', deleteAccount);
router.post('/accounts/:id/adjust-balance', adjustBalance);

// Gerenciar conta padrão
router.post('/accounts/:id/set-default', setDefaultAccount);
router.delete('/accounts/:id/set-default', unsetDefaultAccount);

// Rotas de Categorias Financeiras
router.post('/categories', validate(createCategorySchema), createCategory);
router.get('/categories', validate(listCategoriesSchema), getCategories);
router.get('/categories/:id', getCategoryById);
router.put('/categories/:id', validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', deleteCategory);

// Gerenciar categoria padrão
router.post('/categories/:id/set-default', setDefaultCategory);
router.delete('/categories/:id/set-default', unsetDefaultCategory);

// ✅ ROTA DE AUTOCOMPLETE - DEVE VIR ANTES DAS ROTAS COM :id
router.get('/transactions/autocomplete', validate(autocompleteQuerySchema), getTransactionAutocomplete);

// Rotas de Transações Financeiras
router.post('/transactions', validate(createTransactionSchema), createTransaction);
router.get('/transactions', validate(listTransactionsSchema), getTransactions);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id', validate(updateTransactionSchema), updateTransaction);
router.patch('/transactions/:id/status', validate(updateTransactionStatusSchema), updateTransactionStatus);
router.delete('/transactions/:id', deleteTransaction);

// ✅ ROTAS DE RELATÓRIOS - ORDEM IMPORTA!
router.use('/reports/financial-account-movement', financialAccountMovementRoutes);

// ✅ ROTAS RECORRENTES
router.use('/recurring', recurringRoutes);

// Rotas de Relatórios/Dashboard
router.get('/summary', getFinancialSummary);

export default router;