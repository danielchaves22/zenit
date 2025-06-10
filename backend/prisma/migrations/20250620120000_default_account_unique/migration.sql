-- Drop old unique constraint on (companyId, isDefault)
DROP INDEX IF EXISTS "FinancialAccount_companyId_isDefault_key";

-- Enforce that only one default account exists per company
CREATE UNIQUE INDEX "FinancialAccount_companyId_isDefault_true_key" ON "FinancialAccount"("companyId") WHERE "isDefault" = true;
