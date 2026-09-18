-- The existing physical column names are kept for a low-risk production migration.
-- Prisma maps them to the workspace-oriented domain names used by the application.

DROP INDEX "PersonalFinancialProfile_ownerUserId_key";

ALTER TABLE "PersonalFinancialProfile"
ALTER COLUMN "ownerUserId" DROP NOT NULL,
ADD COLUMN "updatedByUserId" INTEGER;

ALTER TABLE "PersonalFinancialProfile"
DROP CONSTRAINT "PersonalFinancialProfile_ownerUserId_fkey";

ALTER TABLE "PersonalFinancialProfile"
ADD CONSTRAINT "PersonalFinancialProfile_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialProfile"
ADD CONSTRAINT "PersonalFinancialProfile_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonalFinancialProfileRevision"
ADD COLUMN "createdByUserId" INTEGER;

CREATE INDEX "PersonalFinancialProfileRevision_createdByUserId_idx"
ON "PersonalFinancialProfileRevision"("createdByUserId");

ALTER TABLE "PersonalFinancialProfileRevision"
ADD CONSTRAINT "PersonalFinancialProfileRevision_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialPlanningSnapshot"
ALTER COLUMN "ownerUserId" DROP NOT NULL;

ALTER TABLE "FinancialPlanningSnapshot"
DROP CONSTRAINT "FinancialPlanningSnapshot_ownerUserId_fkey";

ALTER TABLE "FinancialPlanningSnapshot"
ADD CONSTRAINT "FinancialPlanningSnapshot_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialPlanningGuidanceRecord"
ALTER COLUMN "ownerUserId" DROP NOT NULL;

ALTER TABLE "FinancialPlanningGuidanceRecord"
DROP CONSTRAINT "FinancialPlanningGuidanceRecord_ownerUserId_fkey";

ALTER TABLE "FinancialPlanningGuidanceRecord"
ADD CONSTRAINT "FinancialPlanningGuidanceRecord_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
