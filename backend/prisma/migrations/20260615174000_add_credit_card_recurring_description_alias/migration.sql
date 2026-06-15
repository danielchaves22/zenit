CREATE TABLE "CreditCardRecurringDescriptionAlias" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "fixedTemplateId" INTEGER NOT NULL,
    "sourceType" "FinancialTransactionImportSourceType" NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "normalizedSourceDescription" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardRecurringDescriptionAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_credit_card_recurring_description_alias"
ON "CreditCardRecurringDescriptionAlias"("accountId", "sourceType", "normalizedSourceDescription");

CREATE INDEX "CreditCardRecurringDescriptionAlias_companyId_idx"
ON "CreditCardRecurringDescriptionAlias"("companyId");

CREATE INDEX "CreditCardRecurringDescriptionAlias_fixedTemplateId_idx"
ON "CreditCardRecurringDescriptionAlias"("fixedTemplateId");

CREATE INDEX "CreditCardRecurringDescriptionAlias_accountId_sourceType_idx"
ON "CreditCardRecurringDescriptionAlias"("accountId", "sourceType");

ALTER TABLE "CreditCardRecurringDescriptionAlias"
ADD CONSTRAINT "CreditCardRecurringDescriptionAlias_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardRecurringDescriptionAlias"
ADD CONSTRAINT "CreditCardRecurringDescriptionAlias_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardRecurringDescriptionAlias"
ADD CONSTRAINT "CreditCardRecurringDescriptionAlias_fixedTemplateId_fkey"
FOREIGN KEY ("fixedTemplateId") REFERENCES "RecurringTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardRecurringDescriptionAlias"
ADD CONSTRAINT "CreditCardRecurringDescriptionAlias_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
