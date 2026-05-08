DROP INDEX IF EXISTS "FinancialCategory_companyId_type_isDefault_key";

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialCategory_companyId_type_default_true_key"
ON "FinancialCategory"("companyId", "type")
WHERE "isDefault" = true;
