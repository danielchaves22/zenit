import { Router } from 'express';
import {
  requireAccountAccess,
  requireExistingTransactionAccountAccess,
  requireTransactionAccountAccess
} from '../middlewares/financial-access.middleware';
import {
  requireCompanyOwner,
  requireCompanyOwnerOrAdmin
} from '../middlewares/company-ownership.middleware';
import { requireFeaturePermission } from '../middlewares/feature-permission.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsSchema,
  adjustBalanceSchema
} from '../validators/financial-account.validator';
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema
} from '../validators/financial-category.validator';
import { listFinancialTagsSchema } from '../validators/financial-tag.validator';
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  listCreditCardPurchasesSchema,
  updateTransactionStatusSchema,
  autocompleteQuerySchema
} from '../validators/financial-transaction.validator';
import { executeFinancialResetSchema } from '../validators/financial-reset.validator';
import {
  getCreditCardInvoiceSchema,
  getProjectedCreditCardInvoiceSchema,
  listCreditCardInvoicesSchema,
  payCreditCardInvoiceSchema,
  reopenCreditCardInvoiceSchema
} from '../validators/credit-card-invoice.validator';
import {
  commitCreditCardReconciliationSchema,
  previewCreditCardReconciliationSchema
} from '../validators/credit-card-reconciliation.validator';
import {
  createFixedTransactionSchema,
  listFixedTransactionsSchema,
  materializeFixedTransactionSchema,
  updateFixedTransactionSchema
} from '../validators/fixed-transaction.validator';
import {
  getFinancialDashboardHistorySchema,
  getFinancialDashboardMonthlySchema
} from '../validators/financial-dashboard.validator';
import { updateVariableProjectionPreferenceSchema } from '../validators/variable-projection-preference.validator';
import {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  adjustBalance
} from '../controllers/financial-account.controller';
import { listFinancialBanks } from '../controllers/bank.controller';
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/financial-category.controller';
import { listFinancialTags } from '../controllers/financial-tag.controller';
import {
  setDefaultAccount,
  unsetDefaultAccount,
  setDefaultCategory,
  unsetDefaultCategory,
  getCompanyDefaults
} from '../controllers/default.controller';
import {
  createTransaction,
  archiveTransaction,
  getCreditCardPurchases,
  getTransactions,
  getTransactionById,
  updateTransaction,
  updateTransactionStatus,
  unarchiveTransaction,
  deleteTransaction,
  getFinancialSummary,
  getTransactionAutocomplete
} from '../controllers/financial-transaction.controller';
import {
  executeCreditCardReset,
  previewCreditCardReset
} from '../controllers/credit-card-reset.controller';
import {
  executeFinancialReset,
  previewFinancialReset
} from '../controllers/financial-reset.controller';
import {
  archiveFixedTransactionOccurrence,
  cancelFixedTransaction,
  createFixedTransaction,
  deleteFixedTransaction,
  listFixedTransactions,
  materializeFixedTransactionOccurrence,
  updateFixedTransaction
} from '../controllers/fixed-transaction.controller';
import {
  getCreditCardInvoice,
  getProjectedCreditCardInvoice,
  listCreditCardInvoices,
  listCreditCards,
  payCreditCardInvoice,
  reopenCreditCardInvoice
} from '../controllers/credit-card-invoice.controller';
import {
  getFinancialDashboardStructural,
  getFinancialDashboardHistory,
  getFinancialDashboardMonthly
} from '../controllers/financial-dashboard.controller';
import {
  getVariableProjectionPreference,
  updateVariableProjectionPreference
} from '../controllers/user-variable-projection-preference.controller';
import {
  commitCreditCardReconciliation,
  previewCreditCardReconciliation
} from '../controllers/credit-card-reconciliation.controller';
import financialAccountMovementRoutes from './financial-account-movement-report.routes';

const router = Router();

router.get('/defaults', getCompanyDefaults);
router.get('/banks', requireFeaturePermission('FINANCIAL_ACCOUNTS'), listFinancialBanks);
router.get('/reset/preview', requireCompanyOwnerOrAdmin, previewFinancialReset);
router.post('/reset', requireCompanyOwnerOrAdmin, validate(executeFinancialResetSchema), executeFinancialReset);

router.post('/accounts', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(createAccountSchema), createAccount);
router.get('/accounts', validate(listAccountsSchema), getAccounts);
router.get('/accounts/:id', requireAccountAccess(), getAccountById);
router.put('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), validate(updateAccountSchema), updateAccount);
router.delete('/accounts/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), deleteAccount);
router.post('/accounts/:id/adjust-balance', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess(), validate(adjustBalanceSchema), adjustBalance);

router.post('/accounts/:id/set-default', requireAccountAccess(), setDefaultAccount);
router.delete('/accounts/:id/set-default', requireAccountAccess(), unsetDefaultAccount);

router.get('/credit-cards', requireFeaturePermission('FINANCIAL_ACCOUNTS'), listCreditCards);
router.get('/credit-cards/:accountId/reset/preview', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireCompanyOwner, previewCreditCardReset);
router.post('/credit-cards/:accountId/reset', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireCompanyOwner, validate(executeFinancialResetSchema), executeCreditCardReset);
router.get('/credit-card-purchases', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(listCreditCardPurchasesSchema), getCreditCardPurchases);
router.get('/credit-cards/:accountId/invoices', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess('accountId'), validate(listCreditCardInvoicesSchema), listCreditCardInvoices);
router.get('/credit-cards/:accountId/invoices/projected/:projectionKey', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess('accountId'), validate(getProjectedCreditCardInvoiceSchema), getProjectedCreditCardInvoice);
router.post('/credit-cards/:accountId/reconciliation/preview', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess('accountId'), validate(previewCreditCardReconciliationSchema), previewCreditCardReconciliation);
router.post('/credit-cards/:accountId/reconciliation/commit', requireFeaturePermission('FINANCIAL_ACCOUNTS'), requireAccountAccess('accountId'), validate(commitCreditCardReconciliationSchema), commitCreditCardReconciliation);
router.get('/credit-card-invoices/:id', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(getCreditCardInvoiceSchema), getCreditCardInvoice);
router.post('/credit-card-invoices/:id/pay', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(payCreditCardInvoiceSchema), payCreditCardInvoice);
router.post('/credit-card-invoices/:id/reopen', requireFeaturePermission('FINANCIAL_ACCOUNTS'), validate(reopenCreditCardInvoiceSchema), reopenCreditCardInvoice);

router.post('/categories', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(createCategorySchema), createCategory);
router.get('/categories', validate(listCategoriesSchema), getCategories);
router.get('/categories/:id', getCategoryById);
router.put('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), validate(updateCategorySchema), updateCategory);
router.delete('/categories/:id', requireFeaturePermission('FINANCIAL_CATEGORIES'), deleteCategory);

router.post('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), setDefaultCategory);
router.delete('/categories/:id/set-default', requireFeaturePermission('FINANCIAL_CATEGORIES'), unsetDefaultCategory);

router.get('/tags', validate(listFinancialTagsSchema), listFinancialTags);

router.get('/preferences/variable-projection', getVariableProjectionPreference);
router.put(
  '/preferences/variable-projection',
  validate(updateVariableProjectionPreferenceSchema),
  updateVariableProjectionPreference
);

router.get(
  '/dashboard/monthly',
  validate(getFinancialDashboardMonthlySchema, { source: 'query' }),
  getFinancialDashboardMonthly
);
router.get('/dashboard/structural', getFinancialDashboardStructural);
router.get(
  '/dashboard/history',
  validate(getFinancialDashboardHistorySchema, { source: 'query' }),
  getFinancialDashboardHistory
);

router.get('/transactions/autocomplete', validate(autocompleteQuerySchema), getTransactionAutocomplete);
router.post('/transactions', validate(createTransactionSchema), requireTransactionAccountAccess(), createTransaction);
router.get('/transactions', validate(listTransactionsSchema), getTransactions);
router.get('/transactions/:id', requireExistingTransactionAccountAccess(), getTransactionById);
router.put('/transactions/:id', requireExistingTransactionAccountAccess(), validate(updateTransactionSchema), requireTransactionAccountAccess(), updateTransaction);
router.patch('/transactions/:id/status', requireExistingTransactionAccountAccess(), validate(updateTransactionStatusSchema), updateTransactionStatus);
router.patch('/transactions/:id/archive', requireExistingTransactionAccountAccess(), archiveTransaction);
router.patch('/transactions/:id/unarchive', requireExistingTransactionAccountAccess(), unarchiveTransaction);
router.delete('/transactions/:id', requireExistingTransactionAccountAccess(), deleteTransaction);

router.post('/fixed-transactions', requireTransactionAccountAccess(), validate(createFixedTransactionSchema), createFixedTransaction);
router.get('/fixed-transactions', validate(listFixedTransactionsSchema), listFixedTransactions);
router.put('/fixed-transactions/:id', validate(updateFixedTransactionSchema), updateFixedTransaction);
router.delete('/fixed-transactions/:id', deleteFixedTransaction);
router.patch('/fixed-transactions/:id/cancel', cancelFixedTransaction);
router.post('/fixed-transactions/:id/materialize', validate(materializeFixedTransactionSchema), materializeFixedTransactionOccurrence);
router.post('/fixed-transactions/:id/archive', validate(materializeFixedTransactionSchema), archiveFixedTransactionOccurrence);

router.use('/reports/financial-account-movement', financialAccountMovementRoutes);
router.get('/summary', getFinancialSummary);

export default router;
