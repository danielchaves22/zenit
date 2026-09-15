CREATE TYPE "FinancialProvisionKind" AS ENUM ('ONE_TIME', 'ANNUAL');

CREATE TYPE "FinancialProvisionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

CREATE TYPE "FinancialProvisionEntryType" AS ENUM ('INITIAL_BALANCE', 'CONTRIBUTION', 'WITHDRAWAL', 'USE');

CREATE TABLE "FinancialProvision" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "kind" "FinancialProvisionKind" NOT NULL,
    "status" "FinancialProvisionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expectedAmount" DECIMAL(15,2) NOT NULL,
    "reservedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialProvision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialProvisionEntry" (
    "id" SERIAL NOT NULL,
    "provisionId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "type" "FinancialProvisionEntryType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reservedAmountChange" DECIMAL(15,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialProvisionEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialProvision_companyId_status_targetDate_idx"
ON "FinancialProvision"("companyId", "status", "targetDate");

CREATE INDEX "FinancialProvision_categoryId_idx"
ON "FinancialProvision"("categoryId");

CREATE INDEX "FinancialProvision_createdBy_idx"
ON "FinancialProvision"("createdBy");

CREATE INDEX "FinancialProvisionEntry_provisionId_occurredAt_idx"
ON "FinancialProvisionEntry"("provisionId", "occurredAt");

CREATE INDEX "FinancialProvisionEntry_createdBy_idx"
ON "FinancialProvisionEntry"("createdBy");

ALTER TABLE "FinancialProvision"
ADD CONSTRAINT "FinancialProvision_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialProvision"
ADD CONSTRAINT "FinancialProvision_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialProvision"
ADD CONSTRAINT "FinancialProvision_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialProvisionEntry"
ADD CONSTRAINT "FinancialProvisionEntry_provisionId_fkey"
FOREIGN KEY ("provisionId") REFERENCES "FinancialProvision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialProvisionEntry"
ADD CONSTRAINT "FinancialProvisionEntry_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
