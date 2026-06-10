CREATE TYPE "FinancialTransactionImportSourceType" AS ENUM ('CAIXA_PDF', 'BRADESCO_CSV');

ALTER TABLE "FinancialTransaction"
ADD COLUMN "importSourceType" "FinancialTransactionImportSourceType",
ADD COLUMN "importSourceDescription" TEXT;
