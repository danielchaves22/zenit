CREATE TYPE "FinancialCategoryNature" AS ENUM ('OPERATIONAL', 'CONCILIATION');

ALTER TABLE "FinancialCategory"
ADD COLUMN "nature" "FinancialCategoryNature" NOT NULL DEFAULT 'OPERATIONAL';

CREATE INDEX "FinancialCategory_companyId_type_nature_idx"
ON "FinancialCategory"("companyId", "type", "nature");
