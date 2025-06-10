-- Drop old unique constraint on companyId and isDefault
DROP INDEX IF EXISTS "FinancialAccount_companyId_isDefault_key";

-- Create partial unique constraint ensuring only one active account per company
CREATE UNIQUE INDEX "FinancialAccount_companyId_active_true_key" ON "FinancialAccount"("companyId") WHERE "isActive" = true;
