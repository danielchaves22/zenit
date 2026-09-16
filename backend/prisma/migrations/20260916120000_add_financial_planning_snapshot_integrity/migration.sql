ALTER TABLE "FinancialPlanningSnapshot"
ADD COLUMN "basisHash" VARCHAR(64),
ADD COLUMN "confirmationHash" VARCHAR(64);

CREATE UNIQUE INDEX "FinancialPlanningSnapshot_confirmationHash_key"
ON "FinancialPlanningSnapshot"("confirmationHash");
