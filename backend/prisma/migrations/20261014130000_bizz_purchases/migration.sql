-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "bizzPurchaseId" UUID;

-- CreateTable
CREATE TABLE "BizzPurchase" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supplierId" UUID NOT NULL,
    "supplierName" VARCHAR(160) NOT NULL,
    "date" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" VARCHAR(2000),
    "canceledAt" TIMESTAMP(3),
    "requestKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BizzPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BizzPurchaseItem" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "catalogItemId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BizzPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BizzPurchasePayment" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BizzPurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BizzPurchase_number_key" ON "BizzPurchase"("number");

-- CreateIndex
CREATE INDEX "BizzPurchase_companyId_date_number_idx" ON "BizzPurchase"("companyId", "date", "number");

-- CreateIndex
CREATE INDEX "BizzPurchase_supplierId_idx" ON "BizzPurchase"("supplierId");

-- CreateIndex
CREATE INDEX "BizzPurchase_createdById_idx" ON "BizzPurchase"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "BizzPurchase_companyId_requestKey_key" ON "BizzPurchase"("companyId", "requestKey");

-- CreateIndex
CREATE INDEX "BizzPurchaseItem_catalogItemId_idx" ON "BizzPurchaseItem"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BizzPurchaseItem_purchaseId_position_key" ON "BizzPurchaseItem"("purchaseId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "BizzPurchasePayment_transactionId_key" ON "BizzPurchasePayment"("transactionId");

-- CreateIndex
CREATE INDEX "BizzPurchasePayment_createdById_idx" ON "BizzPurchasePayment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "BizzPurchasePayment_purchaseId_requestKey_key" ON "BizzPurchasePayment"("purchaseId", "requestKey");

-- CreateIndex
CREATE INDEX "FinancialTransaction_bizzPurchaseId_idx" ON "FinancialTransaction"("bizzPurchaseId");

-- AddForeignKey
ALTER TABLE "BizzPurchase" ADD CONSTRAINT "BizzPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchase" ADD CONSTRAINT "BizzPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "BizzContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchase" ADD CONSTRAINT "BizzPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchaseItem" ADD CONSTRAINT "BizzPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "BizzPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchaseItem" ADD CONSTRAINT "BizzPurchaseItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "BizzCatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchasePayment" ADD CONSTRAINT "BizzPurchasePayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "BizzPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchasePayment" ADD CONSTRAINT "BizzPurchasePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizzPurchasePayment" ADD CONSTRAINT "BizzPurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_bizzPurchaseId_fkey" FOREIGN KEY ("bizzPurchaseId") REFERENCES "BizzPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BizzPurchase" ADD CONSTRAINT "BizzPurchase_total_positive" CHECK ("total" > 0);
ALTER TABLE "BizzPurchaseItem" ADD CONSTRAINT "BizzPurchaseItem_values_valid" CHECK ("quantity" > 0 AND "unitPrice" > 0 AND "total" > 0 AND "position" >= 0);
