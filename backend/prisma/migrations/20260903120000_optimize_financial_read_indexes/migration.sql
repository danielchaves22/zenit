CREATE INDEX "idx_ft_company_date" ON "FinancialTransaction"("companyId", "date");
CREATE INDEX "idx_ft_company_invoice" ON "FinancialTransaction"("companyId", "creditCardInvoiceId");
CREATE INDEX "idx_ft_company_due_date" ON "FinancialTransaction"("companyId", "dueDate");
CREATE INDEX "idx_ft_company_created_at" ON "FinancialTransaction"("companyId", "createdAt");
CREATE INDEX "idx_rt_company_card_projection" ON "RecurringTransaction"("companyId", "isActive", "frequency", "type", "fromAccountId");
