-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FULL_PAYMENT', 'MINIMUM_PAYMENT', 'PARTIAL_PAYMENT');

-- CreateTable
CREATE TABLE "CreditCardConfig" (
    "id" SERIAL NOT NULL,
    "financialAccountId" INTEGER NOT NULL,
    "creditLimit" DECIMAL(15,2) NOT NULL,
    "usedLimit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "availableLimit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "dueDaysAfterClosing" INTEGER NOT NULL DEFAULT 10,
    "annualFee" DECIMAL(15,2),
    "annualFeeMonthlyCharge" DECIMAL(15,2),
    "interestRate" DECIMAL(5,2),
    "latePaymentFee" DECIMAL(15,2),
    "minimumPaymentPercent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "alertLimitPercent" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
    "enableLimitAlerts" BOOLEAN NOT NULL DEFAULT true,
    "enableDueAlerts" BOOLEAN NOT NULL DEFAULT true,
    "dueDaysBeforeAlert" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastInvoiceGenerated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInvoice" (
    "id" SERIAL NOT NULL,
    "financialAccountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "previousBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "purchasesAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentsAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "feesAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "minimumPayment" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInvoiceTransaction" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "installmentId" INTEGER,
    "isInstallment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInvoiceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInstallment" (
    "id" SERIAL NOT NULL,
    "financialAccountId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "numberOfInstallments" INTEGER NOT NULL,
    "installmentAmount" DECIMAL(15,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInstallmentPayment" (
    "id" SERIAL NOT NULL,
    "installmentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInvoicePayment" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentType" "PaymentType" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardConfig_financialAccountId_key" ON "CreditCardConfig"("financialAccountId");

-- CreateIndex
CREATE INDEX "CreditCardConfig_financialAccountId_idx" ON "CreditCardConfig"("financialAccountId");

-- CreateIndex
CREATE INDEX "CreditCardConfig_isActive_idx" ON "CreditCardConfig"("isActive");

-- CreateIndex
CREATE INDEX "CreditCardInvoice_financialAccountId_status_idx" ON "CreditCardInvoice"("financialAccountId", "status");

-- CreateIndex
CREATE INDEX "CreditCardInvoice_companyId_dueDate_idx" ON "CreditCardInvoice"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "CreditCardInvoice_dueDate_status_idx" ON "CreditCardInvoice"("dueDate", "status");

-- CreateIndex
CREATE INDEX "CreditCardInvoice_status_idx" ON "CreditCardInvoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardInvoice_financialAccountId_referenceYear_referenc_key" ON "CreditCardInvoice"("financialAccountId", "referenceYear", "referenceMonth");

-- CreateIndex
CREATE INDEX "CreditCardInvoiceTransaction_invoiceId_idx" ON "CreditCardInvoiceTransaction"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditCardInvoiceTransaction_transactionId_idx" ON "CreditCardInvoiceTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "CreditCardInvoiceTransaction_installmentId_idx" ON "CreditCardInvoiceTransaction"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardInvoiceTransaction_invoiceId_transactionId_key" ON "CreditCardInvoiceTransaction"("invoiceId", "transactionId");

-- CreateIndex
CREATE INDEX "CreditCardInstallment_financialAccountId_idx" ON "CreditCardInstallment"("financialAccountId");

-- CreateIndex
CREATE INDEX "CreditCardInstallment_companyId_idx" ON "CreditCardInstallment"("companyId");

-- CreateIndex
CREATE INDEX "CreditCardInstallment_categoryId_idx" ON "CreditCardInstallment"("categoryId");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPayment_installmentId_idx" ON "CreditCardInstallmentPayment"("installmentId");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPayment_invoiceId_idx" ON "CreditCardInstallmentPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPayment_dueDate_idx" ON "CreditCardInstallmentPayment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardInstallmentPayment_installmentId_installmentNumbe_key" ON "CreditCardInstallmentPayment"("installmentId", "installmentNumber");

-- CreateIndex
CREATE INDEX "CreditCardInvoicePayment_invoiceId_idx" ON "CreditCardInvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditCardInvoicePayment_transactionId_idx" ON "CreditCardInvoicePayment"("transactionId");

-- CreateIndex
CREATE INDEX "CreditCardInvoicePayment_paymentDate_idx" ON "CreditCardInvoicePayment"("paymentDate");

-- AddForeignKey
ALTER TABLE "CreditCardConfig" ADD CONSTRAINT "CreditCardConfig_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoiceTransaction" ADD CONSTRAINT "CreditCardInvoiceTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoiceTransaction" ADD CONSTRAINT "CreditCardInvoiceTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoiceTransaction" ADD CONSTRAINT "CreditCardInvoiceTransaction_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "CreditCardInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallment" ADD CONSTRAINT "CreditCardInstallment_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallment" ADD CONSTRAINT "CreditCardInstallment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallment" ADD CONSTRAINT "CreditCardInstallment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallment" ADD CONSTRAINT "CreditCardInstallment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallmentPayment" ADD CONSTRAINT "CreditCardInstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "CreditCardInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallmentPayment" ADD CONSTRAINT "CreditCardInstallmentPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoicePayment" ADD CONSTRAINT "CreditCardInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoicePayment" ADD CONSTRAINT "CreditCardInvoicePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoicePayment" ADD CONSTRAINT "CreditCardInvoicePayment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
