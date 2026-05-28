DROP INDEX IF EXISTS "FinancialCategory_companyId_type_nature_idx";

ALTER TABLE "FinancialCategory"
DROP COLUMN IF EXISTS "nature";

DROP TYPE IF EXISTS "FinancialCategoryNature";
