-- AlterTable
ALTER TABLE "Bank" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BudgetEntry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserVariableProjectionPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "unique_assistant_message_sequence" RENAME TO "AssistantMessage_sessionId_sequence_key";

-- RenameIndex
ALTER INDEX "unique_budget_client_key" RENAME TO "Budget_companyId_userId_clientKey_key";

-- RenameIndex
ALTER INDEX "unique_budget_entry_client_key" RENAME TO "BudgetEntry_budgetId_clientKey_key";

-- RenameIndex
ALTER INDEX "unique_ai_credential_per_company_provider" RENAME TO "CompanyAiCredential_companyId_provider_key";

-- RenameIndex
ALTER INDEX "unique_company_app_entitlement" RENAME TO "CompanyAppEntitlement_companyId_appId_key";

-- RenameIndex
ALTER INDEX "unique_credit_card_invoice_reference" RENAME TO "CreditCardInvoice_accountId_referenceYear_referenceMonth_key";

-- RenameIndex
ALTER INDEX "unique_credit_card_recurring_description_alias" RENAME TO "CreditCardRecurringDescriptionAlias_accountId_sourceType_no_key";

-- RenameIndex
ALTER INDEX "unique_inbound_import_per_company_source" RENAME TO "InboundImport_companyId_sourceType_externalId_key";

-- RenameIndex
ALTER INDEX "unique_last_used_filter_preset" RENAME TO "LastUsedFilterPreset_userId_companyId_featureKey_key";

-- RenameIndex
ALTER INDEX "unique_process_per_company_source_thread" RENAME TO "Process_companyId_sourceProvider_sourceThreadId_key";

-- RenameIndex
ALTER INDEX "unique_process_tag_link" RENAME TO "ProcessTagLink_processId_tagId_key";

-- RenameIndex
ALTER INDEX "unique_user_company_app_grant" RENAME TO "UserAppGrant_userId_companyId_appId_key";

-- RenameIndex
ALTER INDEX "unique_user_variable_projection_preference" RENAME TO "UserVariableProjectionPreference_userId_companyId_key";
