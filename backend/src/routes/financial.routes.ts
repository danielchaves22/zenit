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
  createFixedTransactionSchema,
  listFixedTransactionsSchema,
  materializeFixedTransactionSchema,
  updateFixedTransactionSchema
} from '../validators/fixed-transaction.validator';

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

import {
  cancelFixedTransaction,
  createFixedTransaction,
  listFixedTransactions,
  materializeFixedTransactionOccurrence,
  updateFixedTransaction
} from '../controllers/fixed-transaction.controller';

import financialAccountMovementRoutes from './financial-account-movement-report.routes';

const router = Router();

router.get('/defaults', getCompanyDefaults);

// Financial accounts
router.post('/accounts', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(createAccountSchema), createAccount);
router.get('/accounts', validate(listAccountsSchema), getAccounts);
router.get('/accounts/:id', requireAccountAccess(), getAccountById);
router.put('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), validate(updateAccountSchema), updateAccount);
router.delete('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), deleteAccount);
router.post('/accounts/:id/adjust-balance', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), adjustBalance);

router.post('/accounts/:id/set-default', requireAccountAccess(), setDefaultAccount);
router.delete('/accounts/:id/set-default', requireAccountAccess(), unsetDefaultAccount);

// Financial categories
router.post('/categories', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(createCategorySchema), createCategory);
router.get('/categories', validate(listCategoriesSchema), getCategories);
router.get('/categories/:id', getCategoryById);
router.put('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), deleteCategory);

router.post('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), setDefaultCategory);
router.delete('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), unsetDefaultCategory);

// Keep autocomplete before /transactions/:id
router.get('/transactions/autocomplete', validate(autocompleteQuerySchema), getTransactionAutocomplete);

// Materialized + projected transactions
router.post('/transactions', requireTransactionAccountAccess(), validate(createTransactionSchema), createTransaction);
router.get('/transactions', validate(listTransactionsSchema), getTransactions);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id', requireTransactionAccountAccess(), validate(updateTransactionSchema), updateTransaction);
router.patch('/transactions/:id/status', validate(updateTransactionStatusSchema), updateTransactionStatus);
router.delete('/transactions/:id', deleteTransaction);

// Fixed transaction templates
router.post('/fixed-transactions', requireTransactionAccountAccess(), validate(createFixedTransactionSchema), createFixedTransaction);
router.get('/fixed-transactions', validate(listFixedTransactionsSchema), listFixedTransactions);
router.put('/fixed-transactions/:id', validate(updateFixedTransactionSchema), updateFixedTransaction);
router.patch('/fixed-transactions/:id/cancel', cancelFixedTransaction);
router.post('/fixed-transactions/:id/materialize', validate(materializeFixedTransactionSchema), materializeFixedTransactionOccurrence);

// Reports
router.use('/reports/financial-account-movement', financialAccountMovementRoutes);
router.get('/summary', getFinancialSummary);

export default router;
