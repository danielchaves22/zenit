DROP INDEX "FinancialAccount_name_companyId_key";

CREATE UNIQUE INDEX "FinancialAccount_name_type_companyId_key"
ON "FinancialAccount"("name", "type", "companyId");
