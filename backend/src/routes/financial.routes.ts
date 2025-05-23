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
  updateTransactionStatusSchema
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
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  updateTransactionStatus,
  deleteTransaction,
  getFinancialSummary
} from '../controllers/financial-transaction.controller';

const router = Router();

// Rotas de Contas Financeiras
router.post('/accounts', validate(createAccountSchema), createAccount);
router.get('/accounts', validate(listAccountsSchema), getAccounts);
router.get('/accounts/:id', getAccountById);
router.put('/accounts/:id', validate(updateAccountSchema), updateAccount);
router.delete('/accounts/:id', deleteAccount);
router.post('/accounts/:id/adjust-balance', adjustBalance);

// Rotas de Categorias Financeiras
router.post('/categories', validate(createCategorySchema), createCategory);
router.get('/categories', validate(listCategoriesSchema), getCategories);
router.get('/categories/:id', getCategoryById);
router.put('/categories/:id', validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', deleteCategory);

// Rotas de Transações Financeiras
router.post('/transactions', validate(createTransactionSchema), createTransaction);
router.get('/transactions', validate(listTransactionsSchema), getTransactions);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id', validate(updateTransactionSchema), updateTransaction);
router.patch('/transactions/:id/status', validate(updateTransactionStatusSchema), updateTransactionStatus);
router.delete('/transactions/:id', deleteTransaction);

// Rotas de Relatórios/Dashboard
router.get('/summary', getFinancialSummary);

export default router;