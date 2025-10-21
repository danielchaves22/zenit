import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { requireAccountAccess } from '../middlewares/financial-access.middleware';
import {
  createCreditCardConfigSchema,
  updateCreditCardConfigSchema,
  generateInvoiceSchema,
  listInvoicesSchema,
  addTransactionToInvoiceSchema,
  createInstallmentPurchaseSchema,
  payInvoiceFullSchema,
  payInvoiceMinimumSchema,
  payInvoicePartialSchema,
  paymentHistorySchema
} from '../validators/credit-card.validator';

import {
  // Config controllers
  createConfig,
  getConfig,
  updateConfig,
  deleteConfig,
  getAvailableLimit,
  listCompanyCards,

  // Invoice controllers
  generateInvoice,
  listInvoices,
  getCurrentInvoice,
  getInvoiceById,
  closeInvoice,
  getInvoiceTransactions,
  addTransactionToInvoice,

  // Installment controllers
  createInstallment,
  listInstallments,
  getInstallmentById,
  cancelInstallment,

  // Payment controllers
  payInvoiceFull,
  payInvoiceMinimum,
  payInvoicePartial,
  getInvoicePayments,
  getPaymentHistory
} from '../controllers/credit-card.controller';

const router = Router();

// ============================================
// CREDIT CARD CONFIG ROUTES
// ============================================

// Config CRUD
router.post(
  '/accounts/:accountId/credit-card/config',
  requireAccountAccess(),
  validate(createCreditCardConfigSchema),
  createConfig
);

router.get(
  '/accounts/:accountId/credit-card/config',
  requireAccountAccess(),
  getConfig
);

router.put(
  '/accounts/:accountId/credit-card/config',
  requireAccountAccess(),
  validate(updateCreditCardConfigSchema),
  updateConfig
);

router.delete(
  '/accounts/:accountId/credit-card/config',
  requireAccountAccess(),
  deleteConfig
);

// Config utilities
router.get(
  '/accounts/:accountId/credit-card/available-limit',
  requireAccountAccess(),
  getAvailableLimit
);

router.get(
  '/credit-cards/company/all',
  listCompanyCards
);

// ============================================
// INVOICE ROUTES
// ============================================

// Invoice operations
router.post(
  '/credit-cards/:accountId/invoices/generate',
  requireAccountAccess(),
  validate(generateInvoiceSchema),
  generateInvoice
);

router.get(
  '/credit-cards/:accountId/invoices',
  requireAccountAccess(),
  validate(listInvoicesSchema),
  listInvoices
);

router.get(
  '/credit-cards/:accountId/invoices/current',
  requireAccountAccess(),
  getCurrentInvoice
);

router.get(
  '/credit-cards/invoices/:invoiceId',
  getInvoiceById
);

router.post(
  '/credit-cards/invoices/:invoiceId/close',
  closeInvoice
);

router.get(
  '/credit-cards/invoices/:invoiceId/transactions',
  getInvoiceTransactions
);

router.post(
  '/credit-cards/invoices/:invoiceId/transactions',
  validate(addTransactionToInvoiceSchema),
  addTransactionToInvoice
);

// ============================================
// INSTALLMENT ROUTES
// ============================================

router.post(
  '/credit-cards/:accountId/installments',
  requireAccountAccess(),
  validate(createInstallmentPurchaseSchema),
  createInstallment
);

router.get(
  '/credit-cards/:accountId/installments',
  requireAccountAccess(),
  listInstallments
);

router.get(
  '/credit-cards/installments/:installmentId',
  getInstallmentById
);

router.delete(
  '/credit-cards/installments/:installmentId',
  cancelInstallment
);

// ============================================
// PAYMENT ROUTES
// ============================================

router.post(
  '/credit-cards/invoices/:invoiceId/payments/full',
  validate(payInvoiceFullSchema),
  payInvoiceFull
);

router.post(
  '/credit-cards/invoices/:invoiceId/payments/minimum',
  validate(payInvoiceMinimumSchema),
  payInvoiceMinimum
);

router.post(
  '/credit-cards/invoices/:invoiceId/payments/partial',
  validate(payInvoicePartialSchema),
  payInvoicePartial
);

router.get(
  '/credit-cards/invoices/:invoiceId/payments',
  getInvoicePayments
);

router.get(
  '/credit-cards/:accountId/payment-history',
  requireAccountAccess(),
  validate(paymentHistorySchema),
  getPaymentHistory
);

export default router;
